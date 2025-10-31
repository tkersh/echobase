# Echobase - Multi-Tier Order Processing System

A cloud-native, asynchronous order processing application built with React, Node.js, AWS SQS, and MariaDB. This application runs locally using Localstack to simulate AWS services.

## Architecture

![Architecture Diagram](docs/architecture.jpg)

### Components

1. **Frontend (React + Vite)** - Port 3000
   - User interface for order placement and user registration
   - Built with React 18 and Vite
   - Modern CSS with responsive design
   - JWT-based authentication
   - Communicates with API Gateway

2. **API Gateway (Express)** - Port 3001
   - REST API for order submission and authentication
   - JWT authentication with secure user sessions
   - Retrieves database credentials from AWS Secrets Manager
   - Places orders into SQS queue
   - Health check endpoint

3. **Processing Queue (SQS)**
   - AWS SQS queue running on Localstack
   - Asynchronous message processing
   - Dead letter queue for failed messages

4. **Order Processor (Node.js Microservice)**
   - Background service polling SQS
   - Retrieves database credentials from AWS Secrets Manager
   - Processes orders and stores in database
   - Automatic message deletion after processing

5. **Data Store (MariaDB)** - Port 3306
   - Persistent storage for orders with encryption at rest
   - AES-256 encryption for all data, logs, and temporary files
   - User authentication and order history tracking
   - Foreign key relationships enforcing data integrity

6. **Security Services (AWS - Localstack)**
   - **KMS (Key Management Service)** - Encryption key management
     - AES-256 encryption keys
     - Automatic key rotation enabled
     - Encrypts all secrets at rest
   - **Secrets Manager** - Secure credential storage
     - Database credentials encrypted with KMS
     - No credentials in environment variables or code
     - Runtime credential retrieval

7. **Infrastructure (Terraform + Docker)**
   - Terraform for AWS resource provisioning (SQS, KMS, Secrets Manager)
   - Docker Compose for Localstack and MariaDB
   - Infrastructure as Code for reproducible deployments

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
- Generate 256-bit AES encryption keys for database encryption at rest
- Create a `.env` file with all necessary credentials
- Set restrictive file permissions (600)
- Display a credential summary

**Note:** Database encryption at rest is enabled by default. All data stored in MariaDB is encrypted using AES-256.

### 2. Setup

Run the setup script to install dependencies and configure the environment:

```bash
./setup.sh
```

This script will:
- Check for root `.env` file (warns if missing)
- Start Docker containers (all services)
- Initialize Terraform and provision SQS queues
- Install Node.js dependencies for building Docker images

### 3. Start the Application

```bash
./start.sh
```

This will:
- Start all services in Docker containers
- Display service status
- Follow logs from all containers (Ctrl+C to stop)

Services will be available at:
- React Frontend: http://localhost:3000
- API Gateway: http://localhost:3001
- Order Processor: Running in Docker
- Localstack: http://localhost:4566
- MariaDB: localhost:3306

### 4. Access the Application

Open your browser and navigate to:
```
http://localhost:3000
```

## Manual Setup

If you prefer to set up manually instead of using the scripts:

### 1. Generate Secure Credentials

**IMPORTANT:** First, generate secure credentials:

```bash
./generate-credentials.sh
```

This creates a root `.env` file with strong random passwords. Docker Compose will automatically use these credentials.

### 2. Install Node.js Dependencies

Install dependencies for building Docker images:

```bash
# API Gateway
cd backend/api-gateway
npm install
cd ../..

# Order Processor
cd backend/order-processor
npm install
cd ../..

# Frontend
cd frontend
npm install
cd ..
```

### 3. Start Docker Infrastructure

```bash
docker-compose up -d
```

This starts all services: Localstack, MariaDB, API Gateway, Order Processor, and Frontend.

### 4. Provision SQS Queue with Terraform

```bash
cd terraform
terraform init
terraform apply -auto-approve
cd ..
```

### 5. View Logs

```bash
# View all services
docker-compose logs -f

# Or view specific services
docker-compose logs -f api-gateway
docker-compose logs -f order-processor
```

All services run in Docker containers using the root `.env` file for credentials.

## Project Structure

```
echobase/
├── backend/
│   ├── api-gateway/          # Express API server
│   │   ├── server.js         # Main server with Secrets Manager integration
│   │   ├── routes/           # API routes (auth, orders)
│   │   ├── middleware/       # JWT authentication middleware
│   │   ├── package.json
│   │   └── .env.example
│   ├── order-processor/      # Background processor
│   │   ├── processor.js      # Main processor with Secrets Manager integration
│   │   ├── package.json
│   │   └── .env.example
│   └── shared/               # Shared utilities
│       └── logger.js         # Logging utility
├── frontend/                 # React + Vite application
│   ├── src/
│   │   ├── App.jsx           # Main app with routing
│   │   ├── App.css
│   │   └── index.jsx
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── .env.example
├── terraform/                # Infrastructure as Code
│   ├── main.tf               # Provider configuration
│   ├── sqs.tf                # SQS queue resources
│   ├── kms.tf                # KMS encryption key
│   └── secrets.tf            # Secrets Manager configuration
├── docs/                     # Documentation
│   ├── architecture.mmd      # Mermaid diagram source
│   ├── architecture.png      # PNG diagram
│   └── architecture.jpg      # JPEG diagram
├── mariadb/                  # MariaDB configuration
│   └── config/               # Database encryption config
├── docker-compose.yml        # Docker services
├── init-db.sql              # Database schema
├── setup.sh                 # Setup script
├── start.sh                 # Start script
├── SECURITY_IMPROVEMENTS.md # KMS & Secrets Manager documentation
├── SECURITY.md              # Security best practices
├── SECURITY_TESTING.md      # Security test documentation
├── AUTHENTICATION.md        # JWT authentication guide
└── README.md                # This file
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

### Functional Testing

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
# First, load environment variables from .env
source .env

# Then query the database using environment variables
docker exec -it echobase-mariadb-1 mariadb -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DATABASE -e "SELECT * FROM orders;"
```

### Security Testing

Run automated security tests to verify no unauthorized access:

```bash
cd backend/api-gateway
npm test
```

This will run 42+ security tests covering:
- Authentication and authorization (JWT & API Keys)
- SQS queue access control
- Input validation and sanitization
- Rate limiting and DoS protection
- CORS configuration
- Security headers
- Error handling and information leakage

For detailed information, see **`SECURITY_TESTING.md`**.

## Monitoring

**Note:** For database commands, load environment variables first with `source .env` to use your secure credentials.

### View SQS Queue

```bash
aws --endpoint-url=http://localhost:4566 sqs receive-message --queue-url http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/order-processing-queue
```

### View Database Orders

```bash
# Load environment variables first
source .env

# Query database with environment variables
docker exec -it echobase-mariadb-1 mariadb -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DATABASE -e "SELECT * FROM orders ORDER BY created_at DESC LIMIT 10;"
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
# Load environment variables first
source .env

# Connect with environment variables
docker exec -it echobase-mariadb-1 mariadb -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DATABASE
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

```bash
# System must be running

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
- **KMS Encryption** - Database credentials encrypted at rest with AWS KMS
- **Secrets Manager** - Centralized secret management with KMS encryption
- **JWT Authentication** - Secure user sessions with JSON Web Tokens
- **Database Encryption at Rest** - AES-256 encryption for all MariaDB data
- **No Credentials in Code** - Runtime credential retrieval from Secrets Manager
- Strong random password generation for database
- Parameterized SQL queries (SQL injection protection)
- Input validation and sanitization
- Rate limiting and security headers
- `.env` files excluded from version control

⚠️ **Development Environment Only:**
- This setup demonstrates **production security patterns** using Localstack
- For production AWS deployment, see `SECURITY_IMPROVEMENTS.md`

### Security Documentation

For comprehensive security information:

- **`SECURITY_IMPROVEMENTS.md`** - **NEW!** KMS and Secrets Manager implementation guide
- **`SECURITY.md`** - Complete security guide with credential setup, best practices, and production checklist
- **`TrustBoundaries.md`** - Detailed trust boundary and attack surface analysis
- **`SECURITY_TESTING.md`** - Automated security test suite for verifying no unauthorized access
- **`AUTHENTICATION.md`** - JWT and API Key authentication guide

### Quick Security Checklist

Before deploying to production, review `SECURITY.md` and `SECURITY_IMPROVEMENTS.md`:

- [x] ~~Implement AWS Secrets Manager~~ - **DONE!** (see `SECURITY_IMPROVEMENTS.md`)
- [x] ~~Enable database encryption at rest~~ - **DONE!** (AES-256 with KMS)
- [x] ~~Implement authentication and authorization~~ - **DONE!** (JWT + API Keys)
- [x] ~~Implement rate limiting and input validation~~ - **DONE!**
- [ ] Replace hardcoded AWS credentials with IAM roles (for production AWS)
- [ ] Enable HTTPS/TLS for all endpoints
- [ ] Configure CORS for specific origins only
- [ ] Set up monitoring and audit logging
- [ ] Enable automatic secret rotation in Secrets Manager
- [ ] Use RDS instead of MariaDB container (production AWS)
- [ ] Review compliance requirements (GDPR, PCI DSS, etc.)

**See `SECURITY.md` and `SECURITY_IMPROVEMENTS.md` for complete production deployment checklists.**

## Production Deployment

**IMPORTANT:** Review `SECURITY.md` and `TrustBoundaries.md` before production deployment.

For production deployment:

1. **Security** - Review `SECURITY.md` and `SECURITY_IMPROVEMENTS.md`
   - ✅ KMS encryption implemented
   - ✅ Secrets Manager implemented
   - ✅ JWT authentication implemented
   - ✅ Database encryption at rest enabled
2. **AWS Services** - Replace Localstack with actual AWS services
   - Use real AWS KMS, Secrets Manager, SQS
   - Replace MariaDB with RDS (with KMS encryption)
3. **Credentials** - Use IAM roles for EC2/ECS (no access keys)
4. **Secret Rotation** - Enable automatic secret rotation in Secrets Manager
5. **Encryption** - Enable HTTPS/TLS, SQS encryption in transit
6. **Monitoring** - Add CloudWatch monitoring and alerting
7. **Scaling** - Configure auto-scaling for processors
8. **Backup** - Set up automated RDS backup strategies
9. **VPC** - Configure VPC endpoints for Secrets Manager access
10. **Compliance** - Review and implement compliance requirements

**See `SECURITY_IMPROVEMENTS.md` for detailed production AWS migration guide.**

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
