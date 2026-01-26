# ADR-010: SQS-Based Async Order Processing

## Status

Accepted

## Date

2026-01-24

## Context

Order submission needs to be:
- **Reliable**: Orders must not be lost
- **Decoupled**: API response shouldn't wait for database write
- **Resilient**: Temporary database outages shouldn't reject orders
- **Scalable**: Order processing can be scaled independently

Synchronous database writes from the API have problems:
- Slow response times when database is under load
- Failed requests if database is temporarily unavailable
- Tight coupling between API and database performance

## Decision

Implement **asynchronous order processing** using **SQS (Simple Queue Service)** as a message broker between the API Gateway and Order Processor.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      ORDER FLOW                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. USER SUBMITS ORDER                                           │
│     ┌──────────┐                                                │
│     │ Frontend │                                                │
│     └────┬─────┘                                                │
│          │ POST /api/v1/orders                                  │
│          ▼                                                      │
│  2. API VALIDATES & QUEUES                                       │
│     ┌──────────────┐                                            │
│     │ API Gateway  │                                            │
│     │              │                                            │
│     │ • Validate   │                                            │
│     │ • Auth check │                                            │
│     │ • Send to SQS│                                            │
│     └──────┬───────┘                                            │
│            │ SendMessage                                        │
│            ▼                                                    │
│  3. MESSAGE QUEUED                          ┌────────────────┐  │
│     ┌──────────────┐                        │ Dead Letter    │  │
│     │  SQS Queue   │───── after 3 fails ───▶│ Queue (DLQ)    │  │
│     │              │                        │                │  │
│     │ order-queue  │                        │ order-dlq      │  │
│     └──────┬───────┘                        └────────────────┘  │
│            │ ReceiveMessage (polling)                           │
│            ▼                                                    │
│  4. PROCESSOR HANDLES ORDER                                      │
│     ┌──────────────────┐                                        │
│     │ Order Processor  │                                        │
│     │                  │                                        │
│     │ • Poll SQS       │                                        │
│     │ • Parse message  │                                        │
│     │ • Insert to DB   │                                        │
│     │ • Delete message │                                        │
│     └──────┬───────────┘                                        │
│            │                                                    │
│            ▼                                                    │
│  5. ORDER PERSISTED                                              │
│     ┌──────────────┐                                            │
│     │   MariaDB    │                                            │
│     │              │                                            │
│     │ orders table │                                            │
│     └──────────────┘                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Message Format

```json
{
  "orderId": "uuid-v4",
  "userId": 123,
  "productName": "Widget",
  "quantity": 2,
  "totalPrice": 99.99,
  "status": "pending",
  "timestamp": "2026-01-24T12:00:00Z"
}
```

### Order Processor

Separate Node.js service that:
1. Long-polls SQS for messages (20-second wait)
2. Processes messages one at a time
3. Writes order to database
4. Deletes message from queue on success
5. Leaves message for retry on failure

```javascript
// Simplified processing loop
while (true) {
  const messages = await sqs.receiveMessage({
    QueueUrl: QUEUE_URL,
    WaitTimeSeconds: 20,
    MaxNumberOfMessages: 1,
  });

  for (const message of messages.Messages || []) {
    try {
      const order = JSON.parse(message.Body);
      await db.insertOrder(order);
      await sqs.deleteMessage({ QueueUrl, ReceiptHandle: message.ReceiptHandle });
    } catch (error) {
      // Message returns to queue after visibility timeout
      log.error('Failed to process order', error);
    }
  }
}
```

### Dead Letter Queue (DLQ)

After 3 failed processing attempts, messages move to DLQ:
- Prevents infinite retry loops
- Allows manual inspection of failed orders
- Can be reprocessed after fixing issues

## Consequences

### Positive

- **Fast API response**: Returns immediately after queuing (~50ms)
- **Reliability**: Orders survive API restarts, DB outages
- **Decoupling**: API and processor scale independently
- **Retry logic**: Built-in retry with visibility timeout
- **Observability**: Can monitor queue depth, DLQ

### Negative

- **Eventual consistency**: Order not immediately in database
- **Complexity**: Additional service to deploy and monitor
- **Message ordering**: Not guaranteed (acceptable for orders)

### Neutral

- **LocalStack dependency**: Uses LocalStack SQS in development
- **Terraform provisioning**: Queue created via Terraform

## Configuration

**Queue Settings:**
```hcl
# terraform/sqs.tf
resource "aws_sqs_queue" "order_queue" {
  name                       = "order-processing-queue"
  visibility_timeout_seconds = 30
  message_retention_seconds  = 86400  # 24 hours
  receive_wait_time_seconds  = 20     # Long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.order_dlq.arn
    maxReceiveCount     = 3
  })
}
```

**Environment Variables:**
```bash
SQS_ENDPOINT=http://localstack:4566
SQS_QUEUE_URL=http://localstack:4566/000000000000/order-processing-queue
```

## Alternatives Considered

### 1. Synchronous database writes

**Rejected**: Tight coupling, slow responses, no retry logic.

### 2. Redis pub/sub

**Considered**: Fast, simple.
**Not chosen**: No persistence, messages lost on restart.

### 3. RabbitMQ

**Considered**: Feature-rich, reliable.
**Not chosen**: Additional infrastructure, SQS sufficient and has AWS parity.

### 4. Kafka

**Considered**: High throughput, event sourcing.
**Not chosen**: Overkill for order volume, complex operations.

### 5. Database-backed queue (polling orders table)

**Considered**: Simple, no additional infrastructure.
**Not chosen**: Polling overhead, no built-in retry/DLQ.

## References

- `backend/order-processor/` - Order processor service
- `terraform/sqs.tf` - SQS queue configuration
- `backend/api-gateway/server.js` - SQS send logic
- ADR-006: LocalStack for AWS Services
