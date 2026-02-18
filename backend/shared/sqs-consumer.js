const { ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const { log, logError } = require('./logger');
const {
    CIRCUIT_BREAKER_THRESHOLD,
    CIRCUIT_BREAKER_BASE_DELAY_MS,
    CIRCUIT_BREAKER_MAX_DELAY_MS,
} = require('./constants');

class SQSConsumer {
    constructor({ sqsClient, queueUrl, processMessage, concurrency = 1, suppressTracing, otelContext }) {
        this.sqsClient = sqsClient;
        this.queueUrl = queueUrl;
        this.processMessage = processMessage;
        this.concurrency = concurrency;
        this.suppressTracing = suppressTracing;
        this.otelContext = otelContext;

        this.consecutiveFailures = 0;
        this.circuitOpen = false;
        this.shutdownRequested = false;

        this.onPollSuccess = null;
        this.onPollError = null;
        this.messagesReceivedCounter = null;
    }

    async start() {
        log(`Starting SQS consumer for ${this.queueUrl}`);
        while (!this.shutdownRequested) {
            await this.poll();
        }
    }

    stop() {
        this.shutdownRequested = true;
        log('SQS consumer shutdown requested');
    }

    async poll() {
        if (this.circuitOpen) {
            const backoffDelay = Math.min(
                CIRCUIT_BREAKER_BASE_DELAY_MS * Math.pow(2, this.consecutiveFailures - CIRCUIT_BREAKER_THRESHOLD),
                CIRCUIT_BREAKER_MAX_DELAY_MS
            );
            log(`Circuit open (${this.consecutiveFailures} failures). Waiting ${Math.round(backoffDelay / 1000)}s...`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }

        try {
            const command = new ReceiveMessageCommand({
                QueueUrl: this.queueUrl,
                MaxNumberOfMessages: Math.min(this.concurrency, 10),
                WaitTimeSeconds: 20,
                MessageAttributeNames: ['All'],
            });

            let response;
            if (this.suppressTracing && this.otelContext) {
                response = await this.otelContext.with(
                    this.suppressTracing(this.otelContext.active()),
                    () => this.sqsClient.send(command)
                );
            } else {
                response = await this.sqsClient.send(command);
            }

            if (response.Messages && response.Messages.length > 0) {
                log(`Received ${response.Messages.length} message(s)`);
                if (this.messagesReceivedCounter) {
                    this.messagesReceivedCounter.add(response.Messages.length);
                }

                // Process messages with bounded concurrency
                for (let i = 0; i < response.Messages.length; i += this.concurrency) {
                    const batch = response.Messages.slice(i, i + this.concurrency);
                    await Promise.all(batch.map(msg => this.processMessage(msg)));
                }
            }

            this.consecutiveFailures = 0;
            this.circuitOpen = false;
            if (this.onPollSuccess) this.onPollSuccess();
        } catch (error) {
            this.consecutiveFailures++;
            logError(`Error polling queue (failure ${this.consecutiveFailures}):`, error);

            if (this.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD && !this.circuitOpen) {
                this.circuitOpen = true;
                logError(`Circuit breaker opened after ${this.consecutiveFailures} consecutive failures`);
            }
            if (this.onPollError) this.onPollError(error);
        }
    }

    async deleteMessage(receiptHandle) {
        await this.sqsClient.send(
            new DeleteMessageCommand({
                QueueUrl: this.queueUrl,
                ReceiptHandle: receiptHandle,
            })
        );
    }
}

module.exports = SQSConsumer;
