/**
 * Order Service
 * Business logic layer for order processing
 * Separates business logic from API controllers for better testability and reusability
 */

const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { log, logError } = require('../../shared/logger');
const { ORDER_MAX_VALUE } = require('../../shared/constants');

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
   * @param {Object} orderData - Order data (productName, quantity, totalPrice)
   * @param {Object} userInfo - User information for audit logging
   * @returns {Promise<Object>} - { success: boolean, messageId: string, order: Object }
   */
  async submitOrder(userId, orderData, userInfo) {
    try {
      const { productName, quantity, totalPrice } = orderData;

      // Create order object with user_id from JWT token
      const order = {
        userId,
        productName,
        quantity,
        totalPrice,
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

      // Send message to SQS
      const command = new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(order),
        MessageAttributes: {
          OrderType: {
            DataType: 'String',
            StringValue: 'StandardOrder',
          },
        },
      });

      const result = await this.sqsClient.send(command);

      // Log for audit trail
      log(`Order submitted: ${result.MessageId} - ${userInfo.fullName} - ${productName} [user:${userInfo.username}]`);

      return {
        success: true,
        messageId: result.MessageId,
        order: {
          productName: order.productName,
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

  /**
   * Get order statistics (placeholder for future functionality)
   * @param {number} userId - User ID
   * @returns {Promise<Object>} - Order statistics
   */
  async getOrderStatistics(userId) {
    // Placeholder for future implementation
    return {
      totalOrders: 0,
      totalSpent: 0,
    };
  }
}

module.exports = OrderService;
