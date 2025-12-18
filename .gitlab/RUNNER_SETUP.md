# GitLab Runner Configuration for Blue-Green Deployment

## Overview

This project uses **blue-green deployment** which requires containers to persist across GitLab CI jobs. The standard Docker-in-Docker (DinD) setup creates isolated, ephemeral Docker daemons that don't support persistent containers.

## Required Runner Configuration

### **Option 1: Docker Executor with Socket Mount (Recommended)**

Configure your GitLab Runner to use the `docker` executor with the host Docker socket mounted:

#### **config.toml**
```toml
[[runners]]
  name = "docker-runner-with-socket"
  url = "https://gitlab.com/"
  token = "YOUR_RUNNER_TOKEN"
  executor = "docker"

  [runners.docker]
    image = "docker:24"
    privileged = false
    volumes = [
      "/var/run/docker.sock:/var/run/docker.sock",  # Mount host Docker socket
      "/cache"
    ]

  [runners.docker.tmpfs]
    "/tmp/claude" = "rw,noexec"
```

#### **Runner Tags**
Ensure the runner has the `docker` tag so jobs can target it:
```bash
gitlab-runner register \
  --tag-list "docker"
```

### **Option 2: Shell Executor (Alternative)**

Use a shell executor on a host with Docker installed:

```toml
[[runners]]
  name = "shell-runner"
  url = "https://gitlab.com/"
  token = "YOUR_RUNNER_TOKEN"
  executor = "shell"

  [runners.custom_build_dir]
    enabled = true
```

Install Docker and docker compose on the runner host.

## Why This Matters

### **Blue-Green Deployment Flow**

```
deploy:green      → Deploys green environment (containers start)
                   ↓ (containers persist on host)
test:green-e2e    → Tests green environment (same containers)
                   ↓ (containers still running)
promote:green     → Switches traffic to green
                   ↓ (green is now production)
[manual]
cleanup:blue      → Removes old blue environment
```

### **With DinD (Wrong)**
```
Job 1: deploy:green
  └─ DinD Daemon A
     └─ Containers created
        └─ Job ends → Daemon stops → ❌ Containers destroyed

Job 2: test:green-e2e
  └─ DinD Daemon B (new, empty)
     └─ ❌ No containers found!
```

### **With Host Socket (Correct)**
```
Job 1: deploy:green
  └─ Host Docker Daemon
     └─ Containers created → ✅ Persist on host

Job 2: test:green-e2e
  └─ Host Docker Daemon (same)
     └─ ✅ Containers still running!
```

## Verification

Test that your runner is configured correctly:

```bash
# Run a test pipeline job
docker ps  # Should show containers from previous jobs

# Check if socket is mounted
docker info  # Should show host Docker info, not isolated DinD
```

## Security Considerations

### **Mounting Docker Socket**
- ⚠️  Gives CI jobs full control over host Docker
- ✅  Acceptable for **trusted projects** and **self-hosted runners**
- ❌  **Not recommended** for shared/public runners

### **Isolation**
- Use **project-specific prefixes** (e.g., `echobase-green`, `echobase-blue`)
- Implement **resource limits** in Docker Compose
- Configure **network isolation** for security

### **Cleanup**
- Regular cleanup of old containers/images
- Implement lifecycle management (cleanup:blue, cleanup:green jobs)
- Monitor disk usage on runner host

## Troubleshooting

### **"Cannot connect to Docker daemon"**
```bash
# Check if socket is accessible
ls -la /var/run/docker.sock

# Verify runner can access it
sudo usermod -aG docker gitlab-runner
```

### **"Permission denied"**
```bash
# Ensure socket has correct permissions
sudo chmod 666 /var/run/docker.sock  # Or add runner to docker group
```

### **Containers disappear between jobs**
- Verify `DOCKER_HOST: unix:///var/run/docker.sock` in .gitlab-ci.yml
- Check runner config has socket mount
- Ensure jobs use same runner (tags)

## Alternative: Kubernetes Deployment

For production Kubernetes clusters, consider:
- **ArgoCD** for GitOps-based blue-green deployment
- **Istio/Linkerd** for traffic shifting
- **Helm** with blue-green chart patterns

This approach is more complex but provides better isolation and scalability.
