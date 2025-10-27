# Echobase - Multi-Tier Order Processing System

A cloud-native, asynchronous order processing application built with React, Node.js, AWS SQS, and MariaDB. This application runs locally using Localstack to simulate AWS services.

## Architecture

![Architecture Diagram](docs/architecture.jpg)

### Components

1. **Frontend (React + Vite)** - Port 3000
   - User interface for order placement
   - Built with React 18 and Vite
   - Modern CSS with responsive design
   - Communicates with API Gateway

2. **API Gateway (Express)** - Port 3001
   - REST API for order submission
   - Places orders into SQS queue
   - Health check endpoint

3. **Processing Queue (SQS)**
   - AWS SQS queue running on Localstack
   - Asynchronous message processing
   - Dead letter queue for failed messages

4. **Order Processor (Node.js Microservice)**
   - Background service polling SQS
   - Processes orders and stores in database
   - Automatic message deletion after processing

5. **Data Store (MariaDB)** - Port 3306
   - Persistent storage for orders
   - Tracks order status and metadata

6. **Infrastructure (Terraform + Docker)**
   - Terraform for SQS queue provisioning
   - Docker Compose for Localstack and MariaDB

## Prerequisites

- Docker and Docker Compose
- Node.js (v16 or higher)
- npm or yarn
- Terraform (optional, for infrastructure provisioning)

## Quick Start

### 1. Generate Secure Credentials

**IMPORTANT:** Before starting the application, generate secure credentials:

```bash
./generate-credentials.sh
```

This script will:
- Generate strong random passwords for the database
- Create a `.env` file with all necessary credentials
- Set restrictive file permissions (600)
- Display a credential summary

### 2. Setup

Run the setup script to install dependencies and configure the environment:

```bash
./setup.sh
```

This script will:
- Create `.env` files from examples (if needed)
- Start Docker containers (Localstack and MariaDB)
- Initialize Terraform and provision SQS queues
- Install Node.js dependencies for all services

### 2. Start the Application

```bash
./start.sh
```

This will start all services:
- React Frontend: http://localhost:3000
- API Gateway: http://localhost:3001
- Order Processor: Background service
- Localstack: http://localhost:4566
- MariaDB: localhost:3306

### 3. Access the Application

Open your browser and navigate to:
```
http://localhost:3000
```

## Manual Setup

If you prefer to set up manually:

### 1. Generate Secure Credentials

**IMPORTANT:** First, generate secure credentials:

```bash
./generate-credentials.sh
```

This creates a root `.env` file with strong random passwords. Docker Compose will automatically use these credentials.

### 2. Start Infrastructure

```bash
docker-compose up -d
```

### 3. Provision SQS Queue with Terraform

```bash
cd terraform
terraform init
terraform apply
cd ..
```

### 4. Configure Environment Variables (Optional)

The root `.env` file created by `generate-credentials.sh` contains all necessary credentials for Docker Compose.

**For local development outside Docker**, create `.env` files in each service directory based on the `.env.example` templates:

- `backend/api-gateway/.env.example`
- `backend/order-processor/.env.example`
- `frontend/.env.example`

**Note:** When running with Docker Compose, individual service `.env` files are not needed.

### 4. Install Dependencies

```bash
# API Gateway
cd backend/api-gateway
npm install

# Order Processor
cd ../order-processor
npm install

# Frontend
cd ../../frontend
npm install
```

### 5. Start Services

In separate terminals:

```bash
# Terminal 1 - API Gateway
cd backend/api-gateway
node server.js

# Terminal 2 - Order Processor
cd backend/order-processor
node processor.js

# Terminal 3 - Frontend
cd frontend
npm start
```

## Project Structure

```
echobase/
├── backend/
│   ├── api-gateway/          # Express API server
│   │   ├── server.js
│   │   ├── package.json
│   │   └── .env.example
│   └── order-processor/      # Background processor
│       ├── processor.js
│       ├── package.json
│       └── .env.example
├── frontend/                 # React + Vite application
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── index.jsx
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── .env.example
├── terraform/                # Infrastructure as Code
│   ├── main.tf              # Provider configuration
│   └── sqs.tf               # SQS queue resources
├── docs/                    # Documentation
│   ├── architecture.mmd     # Mermaid diagram source
│   ├── architecture.png     # PNG diagram
│   └── architecture.jpg     # JPEG diagram
├── docker-compose.yml       # Docker services
├── init-db.sql             # Database schema
├── setup.sh                # Setup script
├── start.sh                # Start script
└── README.md               # This file
```

## Database Schema

```sql
CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_name VARCHAR(255) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    order_status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

## API Endpoints

### API Gateway (Port 3001)

- **GET /health** - Health check
- **POST /api/orders** - Submit a new order
  ```json
  {
    "customerName": "John Doe",
    "productName": "Widget",
    "quantity": 5,
    "totalPrice": 99.99
  }
  ```

## Testing the Application

1. Open http://localhost:3000 in your browser
2. Fill in the order form:
   - Customer Name
   - Product Name
   - Quantity
   - Total Price
3. Click "Submit Order"
4. The order will be:
   - Sent to API Gateway
   - Placed in SQS queue
   - Processed by the background service
   - Stored in MariaDB

5. Verify the order in the database:
```bash
docker exec -it echobase-mariadb-1 mariadb -u orderuser -porderpass orders_db -e "SELECT * FROM orders;"
```

## Monitoring

### View SQS Queue

```bash
aws --endpoint-url=http://localhost:4566 sqs receive-message --queue-url http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/order-processing-queue
```

### View Database Orders

```bash
docker exec -it echobase-mariadb-1 mariadb -u orderuser -porderpass orders_db -e "SELECT * FROM orders ORDER BY created_at DESC LIMIT 10;"
```

### View Application Logs

```bash
# View all Docker container logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f api-gateway
docker-compose logs -f order-processor
docker-compose logs -f frontend

# View Localstack logs (includes SQS operations)
docker-compose logs -f localstack

# View MariaDB logs
docker-compose logs -f mariadb

# Service logs (when running manually)
# Check the terminal where each service is running
```

### View Localstack Activity

Localstack logs all AWS API operations in DEBUG mode. You can monitor SQS activity:

```bash
# Watch Localstack logs for SQS operations
docker-compose logs -f localstack | grep -i sqs

# Filter for specific operations
docker-compose logs -f localstack | grep "SendMessage\|ReceiveMessage\|DeleteMessage"
```

## Troubleshooting

### Localstack Connection Issues

If you can't connect to Localstack:
```bash
docker-compose restart localstack
```

### Database Connection Issues

Verify MariaDB is running:
```bash
docker-compose ps mariadb
```

Connect to database:
```bash
docker exec -it echobase-mariadb-1 mariadb -u orderuser -porderpass orders_db
```

### SQS Queue Not Found

Re-apply Terraform:
```bash
cd terraform
terraform destroy -auto-approve
terraform apply -auto-approve
cd ..
```

Or create manually:
```bash
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name order-processing-queue
```

### Port Already in Use

If ports 3000, 3001, 3306, or 4566 are already in use, you can:
1. Stop the conflicting service
2. Modify the port in the respective `.env` files and `docker-compose.yml`

## Cleanup

Stop all services and remove containers:

```bash
# Stop scripts (if using start.sh)
Ctrl+C

# Destroy Terraform resources FIRST (requires Localstack to be running)
cd terraform
terraform destroy -auto-approve
cd ..

# Then stop Docker containers
docker-compose down

# OR remove volumes as well (WARNING: This deletes all data)
docker-compose down -v
```

**Note:** It's important to run `terraform destroy` BEFORE `docker-compose down` because Terraform needs to connect to Localstack (running in Docker) to properly clean up the SQS resources.

## Development

### Adding New Features

1. Modify the appropriate service
2. Restart the service
3. Test the changes

### Database Migrations

To modify the database schema:
1. Update `init-db.sql`
2. Restart the MariaDB container with volumes removed:
   ```bash
   docker-compose down -v
   docker-compose up -d mariadb
   ```

## Security

### Current Security Status

✅ **Implemented:**
- Strong random password generation for database
- Environment variable-based credential management
- `.env` file with restrictive permissions (600)
- Parameterized SQL queries (SQL injection protection)
- Automated credential generation script
- `.env` files excluded from version control

⚠️ **Development Environment Only:**
- This setup is secure for **local development**
- **NOT production ready** - multiple security enhancements required

### Security Documentation

For comprehensive security information:

- **`SECURITY.md`** - Complete security guide with credential setup, best practices, and production checklist
- **`TrustBoundaries.md`** - Detailed trust boundary and attack surface analysis

### Quick Security Checklist

Before deploying to production, review `SECURITY.md` and ensure:

- [ ] Replace hardcoded AWS credentials with IAM roles
- [ ] Implement AWS Secrets Manager or similar
- [ ] Enable HTTPS/TLS for all endpoints
- [ ] Implement authentication and authorization
- [ ] Configure CORS for specific origins only
- [ ] Enable database encryption at rest
- [ ] Implement rate limiting and input validation
- [ ] Set up monitoring and audit logging
- [ ] Review compliance requirements (GDPR, PCI DSS, etc.)

**See `SECURITY.md` for the complete production deployment checklist.**

## Production Deployment

**IMPORTANT:** Review `SECURITY.md` and `TrustBoundaries.md` before production deployment.

For production deployment:

1. **Security** - Implement all critical security requirements (see `SECURITY.md`)
2. **AWS Services** - Replace Localstack with actual AWS services
3. **Credentials** - Use AWS Secrets Manager and IAM roles
4. **Encryption** - Enable HTTPS/TLS, database encryption, SQS encryption
5. **Authentication** - Implement proper authentication and authorization
6. **Monitoring** - Add CloudWatch monitoring and alerting
7. **Scaling** - Configure auto-scaling for processors
8. **Backup** - Set up automated backup strategies for the database
9. **Compliance** - Review and implement compliance requirements

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Support

For issues and questions, please open an issue on GitHub.
