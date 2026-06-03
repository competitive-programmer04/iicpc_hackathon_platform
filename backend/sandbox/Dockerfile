# We use a slim, stable version of Ubuntu as our base OS
FROM ubuntu:24.04

# Avoid prompt dialogs during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install minimal system dependencies (like ca-certificates for network stuff if needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# SECURITY: Create a non-root system group and user
# Contestant's code will run as "sandbox_user" which has ZERO admin privileges.
RUN groupadd -r sandbox_group && useradd -r -g sandbox_group -d /app -s /sbin/nologin sandbox_user

# Create the working directory and transfer ownership to our non-root user
RUN mkdir -p /app && chown -R sandbox_user:sandbox_group /app

WORKDIR /app

# Switch to the non-root user for security (Crucial Sandboxing Standard!)
USER sandbox_user

EXPOSE 8080

# Default command (will be overridden during volume mount execution)
CMD ["/app/my_engine"]