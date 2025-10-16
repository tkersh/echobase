require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Configure AWS SQS Client for Localstack
const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.SQS_ENDPOINT || 'http://localhost:4566',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Order submission endpoint
app.post('/api/orders', async (req, res) => {
  try {
    const { customerName, productName, quantity, totalPrice } = req.body;

    // Validate input
    if (!customerName || !productName || !quantity || !totalPrice) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['customerName', 'productName', 'quantity', 'totalPrice'],
      });
    }

    // Create order object
    const order = {
      customerName,
      productName,
      quantity: parseInt(quantity),
      totalPrice: parseFloat(totalPrice),
      timestamp: new Date().toISOString(),
    };

    // Send message to SQS
    const command = new SendMessageCommand({
      QueueUrl: process.env.SQS_QUEUE_URL,
      MessageBody: JSON.stringify(order),
      MessageAttributes: {
        OrderType: {
          DataType: 'String',
          StringValue: 'StandardOrder',
        },
      },
    });

    const result = await sqsClient.send(command);

    res.status(201).json({
      success: true,
      message: 'Order submitted successfully',
      messageId: result.MessageId,
      order,
    });
  } catch (error) {
    console.error('Error submitting order:', error);
    res.status(500).json({
      error: 'Failed to submit order',
      details: error.message,
    });
  }
});

// Get orders endpoint (for testing)
app.get('/api/orders', (req, res) => {
  res.json({
    message: 'Orders are processed asynchronously. Check the database for order history.',
  });
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
  console.log(`SQS Endpoint: ${process.env.SQS_ENDPOINT}`);
  console.log(`Queue URL: ${process.env.SQS_QUEUE_URL}`);
});