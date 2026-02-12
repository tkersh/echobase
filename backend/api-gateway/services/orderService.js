/**
 * Order Service
 * Business logic layer for order processing
 * Separates business logic from API controllers for better testability and reusability
 */

const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { log, logError } = require('../../shared/logger');
const { ORDER_MAX_VALUE } = require('../../shared/constants');

// OTEL context propagation for SQS trace continuity (optional)
let otelContext, otelPropagation;
let ordersSubmittedCounter;
try {
  const api = require('@opentelemetry/api');
  otelContext = api.context;
  otelPropagation = api.propagation;
  const meter = api.metrics.getMeter('api-gateway');
  ordersSubmittedCounter = meter.createCounter('orders.submitted', { description: 'Total orders submitted to SQS' });
} catch (_) {
  // OTEL not available
}

class OrderService {
  constructor(sqsClient, queueUrl) {
    this.sqsClient = sqsClient;
    this.queueUrl = queueUrl;
  }

  /**
   * Validate order business rules
   * @param {Object} order - Order object to validate
   * @returns {Object} - { valid: boolean, error: string }
   */
  validateOrderBusinessRules(order) {
    const { totalPrice } = order;

    // Business rule: Order total cannot exceed maximum value
    if (totalPrice > ORDER_MAX_VALUE) {
      return {
        valid: false,
        error: 'Order total exceeds maximum allowed value',
        message: `Order total price cannot exceed $${ORDER_MAX_VALUE.toLocaleString()}`,
      };
    }

    // Additional business rules can be added here
    // Example: minimum order value, product availability, etc.

    return { valid: true };
  }

  /**
   * Submit an order to the processing queue
   * @param {number} userId - User ID from JWT token
   * @param {Object} orderData - Order data (productId, productName, sku, quantity, totalPrice)
   * @param {Object} userInfo - User information for audit logging
   * @returns {Promise<Object>} - { success: boolean, messageId: string, order: Object }
   */
  async submitOrder(userId, orderData, userInfo, correlationId) {
    try {
      const { productId, productName, sku, quantity, totalPrice } = orderData;

      // Create order object with user_id from JWT token
      const order = {
        userId,
        productId,
        productName,
        sku,
        quantity,
        totalPrice,
        correlationId: correlationId || undefined,
        timestamp: new Date().toISOString(),
      };

      // Validate business rules
      const validation = this.validateOrderBusinessRules(order);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          message: validation.message,
        };
      }

      // Inject W3C trace context into SQS attributes for end-to-end tracing
      const traceAttrs = {};
      if (otelPropagation && otelContext) {
        const carrier = {};
        otelPropagation.inject(otelContext.active(), carrier);
        if (carrier.traceparent) {
          traceAttrs.Traceparent = { DataType: 'String', StringValue: carrier.traceparent };
        }
        if (carrier.tracestate) {
          traceAttrs.Tracestate = { DataType: 'String', StringValue: carrier.tracestate };
        }
      }

      // Send message to SQS
      const command = new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(order),
        MessageAttributes: {
          OrderType: {
            DataType: 'String',
            StringValue: 'StandardOrder',
          },
          ...(correlationId ? {
            CorrelationId: {
              DataType: 'String',
              StringValue: correlationId,
            },
          } : {}),
          ...traceAttrs,
        },
      });

      const result = await this.sqsClient.send(command);

      if (ordersSubmittedCounter) ordersSubmittedCounter.add(1, { product: productName });

      // Log for audit trail
      log(`Order submitted: ${result.MessageId} - ${userInfo.fullName} - ${productName} [user:${userInfo.username}]`);

      return {
        success: true,
        messageId: result.MessageId,
        order: {
          productId: order.productId,
          productName: order.productName,
          sku: order.sku,
          quantity: order.quantity,
          totalPrice: order.totalPrice,
          timestamp: order.timestamp,
        },
      };
    } catch (error) {
      logError('Error in OrderService.submitOrder:', error);
      throw error; // Re-throw for controller to handle
    }
  }
}

module.exports = OrderService;
