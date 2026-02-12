-- Users table for JWT-based authentication
-- Encryption at rest enabled
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENCRYPTED=YES;

CREATE INDEX idx_username ON users(username);
CREATE INDEX idx_email ON users(email);

-- Products table
-- Encryption at rest enabled
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    cost DECIMAL(10, 2) NOT NULL,
    sku VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENCRYPTED=YES;

CREATE INDEX idx_product_name ON products(name);
CREATE INDEX idx_product_sku ON products(sku);

-- Seed products
INSERT INTO products (name, cost, sku) VALUES
    ('Quantum Stabilizer', 249.99, 'QS-001'),
    ('Plasma Conduit', 89.50, 'PC-042'),
    ('Neural Interface Module', 599.00, 'NIM-007'),
    ('Gravity Dampener', 175.25, 'GD-113'),
    ('Chrono Sync Unit', 324.75, 'CSU-088'),
    ('Headphones', 79.99, 'HP-101'),
    ('Keyboard', 49.99, 'KB-202'),
    ('Laptop', 999.99, 'LT-303'),
    ('Monitor', 349.99, 'MN-404'),
    ('Mouse', 29.99, 'MS-505'),
    ('Webcam', 59.99, 'WC-606');

-- Orders table
-- All orders must be associated with a registered user (JWT authentication only)
-- Encryption at rest enabled
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT,
    product_name VARCHAR(255) NOT NULL,
    sku VARCHAR(50),
    quantity INT NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    order_status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
) ENCRYPTED=YES;

CREATE INDEX idx_user_id ON orders(user_id);
CREATE INDEX idx_product_id ON orders(product_id);
CREATE INDEX idx_order_status ON orders(order_status);
CREATE INDEX idx_created_at ON orders(created_at);
CREATE INDEX idx_user_orders ON orders(user_id, created_at DESC);
