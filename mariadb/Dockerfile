FROM mariadb:latest

# Install AWS CLI v2 for fetching encryption key from Secrets Manager
# MariaDB latest is Ubuntu Noble-based; awscli package not available, use official installer
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        unzip \
    && curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "/tmp/awscliv2.zip" \
    && unzip -q /tmp/awscliv2.zip -d /tmp \
    && /tmp/aws/install \
    && rm -rf /tmp/awscliv2.zip /tmp/aws \
    && apt-get purge -y unzip \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Create encryption directory with proper permissions
# The keyfile will be written at runtime by the entrypoint wrapper
RUN mkdir -p /etc/mysql/encryption && \
    chmod 750 /etc/mysql/encryption && \
    chown mysql:mysql /etc/mysql/encryption

# Copy encryption configuration (references keyfile that will be created at runtime)
COPY --chown=mysql:mysql --chmod=644 mariadb/config/encryption-minimal.cnf /etc/mysql/conf.d/encryption.cnf

# Copy database initialization script
COPY init-db.sql /docker-entrypoint-initdb.d/init-db.sql

# Copy entrypoint wrapper that fetches encryption key from Secrets Manager
COPY --chmod=755 mariadb/docker-entrypoint-wrapper.sh /usr/local/bin/docker-entrypoint-wrapper.sh

# Use our wrapper as the entrypoint (it calls the original entrypoint after fetching key)
ENTRYPOINT ["docker-entrypoint-wrapper.sh"]
CMD ["mariadbd"]
