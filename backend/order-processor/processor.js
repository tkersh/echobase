require('dotenv').config();
const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const mysql = require('mysql2/promise');
const { log, logError } = require('../shared/logger');

// Configure AWS SQS Client for Localstack
const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.SQS_ENDPOINT || 'http://localhost:4566',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
});

// Database connection pool
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'orderuser',
  password: process.env.DB_PASSWORD || 'orderpass',
  database: process.env.DB_NAME || 'orders_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

let dbPool;

async function initDatabase() {
  try {
    dbPool = mysql.createPool(dbConfig);
    const connection = await dbPool.getConnection();
    log('Connected to MariaDB database');
    connection.release();
  } catch (error) {
    logError('Error connecting to database:', error);
    throw error;
  }
}

async function insertOrder(order) {
  try {
    const query = `
      INSERT INTO orders (user_id, customer_name, product_name, quantity, total_price, order_status)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const [result] = await dbPool.execute(query, [
      order.userId || null, // Use userId if present (JWT auth), otherwise NULL (API key auth)
      order.customerName,
      order.productName,
      order.quantity,
      order.totalPrice,
      'completed',
    ]);

    const userInfo = order.userId ? `for user_id: ${order.userId}` : 'via API key';
    log(`Order inserted with ID: ${result.insertId} ${userInfo}`);
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
      MaxNumberOfMessages: parseInt(process.env.MAX_MESSAGES) || 10,
      WaitTimeSeconds: 10,
      MessageAttributeNames: ['All'],
    });

    const response = await sqsClient.send(command);

    if (response.Messages && response.Messages.length > 0) {
      log(`Received ${response.Messages.length} message(s)`);

      // Process messages in parallel
      await Promise.all(response.Messages.map(processMessage));
    }
  } catch (error) {
    logError('Error polling queue:', error);
  }
}

async function startProcessor() {
  log('Starting Order Processor...');
  log(`SQS Queue URL: ${process.env.SQS_QUEUE_URL}`);
  log(`Database: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);

  await initDatabase();

  // Poll the queue continuously
  const pollInterval = parseInt(process.env.POLL_INTERVAL) || 5000;

  log(`Polling queue every ${pollInterval}ms`);

  // Initial poll
  await pollQueue();

  // Set up interval polling
  setInterval(pollQueue, pollInterval);
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  log('\nShutting down gracefully...');
  if (dbPool) {
    await dbPool.end();
  }
  process.exit(0);
});

// Start the processor
startProcessor().catch((error) => {
  logError('Failed to start processor:', error);
  process.exit(1);
});