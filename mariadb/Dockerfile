FROM mariadb:latest

# Create encryption directory with proper permissions
RUN mkdir -p /etc/mysql/encryption && \
    chmod 750 /etc/mysql/encryption && \
    chown mysql:mysql /etc/mysql/encryption

# Copy encryption configuration files
# Use minimal config for faster startup and better CI reliability
COPY --chown=mysql:mysql --chmod=644 mariadb/config/encryption-minimal.cnf /etc/mysql/conf.d/encryption.cnf
COPY --chown=mysql:mysql --chmod=600 mariadb/config/keyfile.enc /etc/mysql/encryption/keyfile.enc

# Copy database initialization script
COPY init-db.sql /docker-entrypoint-initdb.d/init-db.sql
