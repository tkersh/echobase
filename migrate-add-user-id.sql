-- Migration script to add user_id column to existing orders table
-- Run this script if you have an existing database that needs to be updated
--
-- IMPORTANT: Backup your database before running this migration!
--
-- Usage:
--   docker exec -i echobase-mariadb-1 mariadb -u root -p$MYSQL_ROOT_PASSWORD orders_db < migrate-add-user-id.sql

-- Check if user_id column already exists
SET @column_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'user_id'
);

-- Add user_id column if it doesn't exist
SET @sql = IF(@column_exists = 0,
    'ALTER TABLE orders ADD COLUMN user_id INT NULL AFTER id',
    'SELECT "Column user_id already exists" AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add foreign key constraint if it doesn't exist
SET @fk_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND CONSTRAINT_NAME = 'orders_ibfk_1'
);

SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE orders ADD CONSTRAINT orders_ibfk_1 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL',
    'SELECT "Foreign key constraint already exists" AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index on user_id if it doesn't exist
SET @index_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND INDEX_NAME = 'idx_user_id'
);

SET @sql = IF(@index_exists = 0,
    'CREATE INDEX idx_user_id ON orders(user_id)',
    'SELECT "Index idx_user_id already exists" AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Display current structure
DESCRIBE orders;

-- Show sample data
SELECT
    id,
    user_id,
    customer_name,
    product_name,
    quantity,
    total_price,
    order_status,
    created_at
FROM orders
ORDER BY created_at DESC
LIMIT 10;

SELECT 'Migration completed successfully!' AS status;
