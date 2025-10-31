require('dotenv').config();
const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const mysql = require('mysql2/promise');
const { log, logError } = require('../shared/logger');

// Configure AWS clients for Localstack
const awsConfig = {
  region: process.env.AWS_REGION,
  endpoint: process.env.SQS_ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

const sqsClient = new SQSClient(awsConfig);
const secretsClient = new SecretsManagerClient(awsConfig);

let dbPool;

// Retrieve database credentials from AWS Secrets Manager
async function getDbCredentials() {
  try {
    const secretName = process.env.DB_SECRET_NAME;
    log(`Retrieving database credentials from Secrets Manager: ${secretName}`);

    const command = new GetSecretValueCommand({
      SecretId: secretName,
    });

    const response = await secretsClient.send(command);
    const secret = JSON.parse(response.SecretString);

    log('Successfully retrieved database credentials from Secrets Manager');
    return secret;
  } catch (error) {
    logError('Error retrieving database credentials from Secrets Manager:', error);
    throw error;
  }
}

async function initDatabase() {
  try {
    const dbCredentials = await getDbCredentials();

    const dbConfig = {
      host: dbCredentials.host,
      port: dbCredentials.port,
      user: dbCredentials.username,
      password: dbCredentials.password,
      database: dbCredentials.dbname,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    };

    dbPool = mysql.createPool(dbConfig);
    const connection = await dbPool.getConnection();
    log(`Connected to RDS MariaDB database at ${dbCredentials.host}:${dbCredentials.port}`);
    connection.release();
  } catch (error) {
    logError('Error connecting to database:', error);
    throw error;
  }
}

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

    log(`Order inserted with ID: ${result.insertId} for user_id: ${order.userId}`);
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
  const pollInterval = parseInt(process.env.POLL_INTERVAL);

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