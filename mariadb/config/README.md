# MariaDB Encryption Configuration

This directory contains the encryption configuration for MariaDB data-at-rest encryption.

## Files

- **encryption.cnf** - MariaDB configuration file that enables encryption
- **keyfile.enc** - Encryption key file (NEVER commit this to version control!)
- **generate-keys.sh** - Script to generate new encryption keys

## Setup

### Automatic Setup (Recommended)

Encryption keys are automatically generated when you run the main credential generation script:

```bash
# From the project root directory
./generate-credentials.sh
```

This will generate both application credentials AND encryption keys.

### Manual Setup

If you need to generate or regenerate just the encryption keys:

```bash
# From this directory (mariadb/config)
./generate-keys.sh
```

This will create `keyfile.enc` with a 256-bit AES encryption key.

## Encryption Features Enabled

The configuration in `encryption.cnf` enables:

- **InnoDB table encryption** - All new InnoDB tables are encrypted by default
- **InnoDB log encryption** - Transaction logs are encrypted
- **Temporary file encryption** - Temporary tables and files are encrypted
- **Binary log encryption** - Replication binary logs are encrypted
- **Aria table encryption** - MariaDB Aria storage engine tables are encrypted

## Key Management

### Backup Your Keys

**CRITICAL**: Backup your `keyfile.enc` securely! If you lose this file, you will not be able to access your encrypted data.

Recommended backup locations:
- Secure cloud storage (encrypted)
- Hardware security module (HSM)
- Secure offline storage
- Password manager (for development)

### Key Rotation

To rotate encryption keys:

1. Generate a new key with a different key ID:
   ```bash
   # Edit generate-keys.sh to use KEY_ID=2
   ./generate-keys.sh

   # Append the new key to the keyfile
   echo "2;$(openssl rand -hex 32)" >> keyfile.enc
   ```

2. Set the new key as default in `encryption.cnf`:
   ```ini
   innodb_encryption_rotate_key_age = 1
   ```

3. Restart MariaDB - it will automatically re-encrypt tables with the new key

### Verify Encryption

To verify that encryption is working:

```bash
# Connect to the database
docker-compose exec mariadb mysql -u root -p

# Check encryption status
SHOW VARIABLES LIKE 'innodb_encrypt%';

# Check if a specific table is encrypted
SELECT NAME, ENCRYPTION FROM INFORMATION_SCHEMA.INNODB_TABLESPACES
WHERE NAME LIKE 'orders_db%';
```

## Security Notes

1. **Never commit keyfile.enc** - It's already in .gitignore
2. **Restrict file permissions** - keyfile.enc should be readable only by the database user
3. **Use different keys** - Development, staging, and production should use different keys
4. **Regular backups** - Backup both data AND encryption keys (separately!)
5. **Monitor access** - Track who has access to encryption keys

## Encryption Performance

Encryption has minimal performance impact:
- ~1-3% CPU overhead
- No significant I/O impact with modern hardware
- Background encryption threads handle re-encryption asynchronously

## Troubleshooting

### MariaDB won't start

Check logs: `docker-compose logs mariadb`

Common issues:
- Keyfile path incorrect in encryption.cnf
- Keyfile permissions too open (must be 600 or 400)
- Invalid key format in keyfile.enc

### Tables not encrypted

Check:
```sql
SHOW VARIABLES LIKE 'innodb_encrypt_tables';
```

Should show `ON` or `FORCE`.

For existing tables, manually encrypt:
```sql
ALTER TABLE table_name ENCRYPTED=YES;
```

## References

- [MariaDB Encryption Documentation](https://mariadb.com/kb/en/data-at-rest-encryption/)
- [File Key Management Plugin](https://mariadb.com/kb/en/file-key-management-encryption-plugin/)
