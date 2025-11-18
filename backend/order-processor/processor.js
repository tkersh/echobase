require('dotenv').config();
const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const { log, logError } = require('../shared/logger');
const { getAwsConfig } = require('../shared/aws-config');
const { initDatabase } = require('../shared/database');
const { validateEnvVars, ORDER_PROCESSOR_REQUIRED_VARS } = require('../shared/env-validator');

// Validate environment variables at startup
if (!validateEnvVars(ORDER_PROCESSOR_REQUIRED_VARS)) {
  process.exit(1);
}

// Configure AWS clients
const awsConfig = getAwsConfig();
const sqsClient = new SQSClient(awsConfig);

let dbPool;
let pollIntervalId;

async function insertOrder(order) {
  try {
    // Validate required fields - all must be defined (not undefined)
    if (order.userId === undefined ||
        order.productName === undefined ||
        order.quantity === undefined ||
        order.totalPrice === undefined) {
      const missingFields = [];
      if (order.userId === undefined) missingFields.push('userId');
      if (order.productName === undefined) missingFields.push('productName');
      if (order.quantity === undefined) missingFields.push('quantity');
      if (order.totalPrice === undefined) missingFields.push('totalPrice');

      throw new Error(`Order missing required fields: ${missingFields.join(', ')}. Order data: ${JSON.stringify(order)}`);
    }

    // Verify user exists before inserting order (prevent foreign key constraint violation)
    const [users] = await dbPool.execute(
      'SELECT id, username FROM users WHERE id = ?',
      [order.userId]
    );

    if (users.length === 0) {
      throw new Error(`User with ID ${order.userId} does not exist. Cannot create order for non-existent user.`);
    }

    const user = users[0];
    log(`Verified user exists: ${user.username} (ID: ${user.id})`);

    // All orders must have a user_id from JWT authentication
    const query = `
      INSERT INTO orders (user_id, product_name, quantity, total_price, order_status)
      VALUES (?, ?, ?, ?, ?)
    `;

    const [result] = await dbPool.execute(query, [
      order.userId,
      order.productName,
      order.quantity,
      order.totalPrice,
      'completed',
    ]);

    log(`Order inserted with ID: ${result.insertId} for user: ${user.username} (user_id: ${order.userId})`);
    return result.insertId;
  } catch (error) {
    logError('Error inserting order:', error);
    throw error;
  }
}

async function processMessage(message) {
  try {
    const order = JSON.parse(message.Body);
    log('Processing order:', order);

    const orderId = await insertOrder(order);
    log(`Successfully processed order ${orderId}`);

    // Delete message from queue after successful processing
    await sqsClient.send(
      new DeleteMessageCommand({
        QueueUrl: process.env.SQS_QUEUE_URL,
        ReceiptHandle: message.ReceiptHandle,
      })
    );

    log('Message deleted from queue');
  } catch (error) {
    logError('Error processing message:', error);
    // Message will remain in queue and be retried
  }
}

async function pollQueue() {
  try {
    const command = new ReceiveMessageCommand({
      QueueUrl: process.env.SQS_QUEUE_URL,
      MaxNumberOfMessages: parseInt(process.env.MAX_MESSAGES),
      WaitTimeSeconds: 10,
      MessageAttributeNames: ['All'],
    });

    const response = await sqsClient.send(command);

    if (response.Messages && response.Messages.length > 0) {
      log(`Received ${response.Messages.length} message(s)`);

      // Process messages sequentially to avoid database connection pool exhaustion
      // This ensures we don't exceed the connection pool limit
      for (const message of response.Messages) {
        await processMessage(message);
      }
    }
  } catch (error) {
    logError('Error polling queue:', error);
  }
}

async function startProcessor() {
  log('Starting Order Processor...');
  log(`SQS Queue URL: ${process.env.SQS_QUEUE_URL}`);
  log(`Database: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);

  dbPool = await initDatabase(awsConfig);

  // Poll the queue continuously
  const pollInterval = parseInt(process.env.POLL_INTERVAL);

  log(`Polling queue every ${pollInterval}ms`);

  // Initial poll
  await pollQueue();

  // Set up interval polling
  pollIntervalId = setInterval(pollQueue, pollInterval);
}

// Handle graceful shutdown
const shutdownHandler = async (signal) => {
  log(`\nReceived ${signal}, shutting down gracefully...`);

  // Clear polling interval
  if (pollIntervalId) {
    clearInterval(pollIntervalId);
    log('Stopped polling for new messages');
  }

  // Close database connection pool
  if (dbPool) {
    try {
      await dbPool.end();
      log('Database connection pool closed');
    } catch (error) {
      logError('Error closing database pool:', error);
    }
  }

  log('Shutdown complete');
  process.exit(0);
};

// Register shutdown handlers for multiple signals
process.on('SIGINT', () => shutdownHandler('SIGINT'));
process.on('SIGTERM', () => shutdownHandler('SIGTERM'));

// Start the processor
startProcessor().catch((error) => {
  logError('Failed to start processor:', error);
  process.exit(1);
});