# Session Context

## User Prompts

### Prompt 1

❯ CI succeeded on the use_otel branch I FF merged to main with no conflicts and now it's failing at deploy:target with SSL Setup: 
An error occurred (ResourceNotFoundException) when calling the GetSecretValue operation: Secrets Manager can't find the specified secret.
SSL Setup: Ensure durable/setup.sh has been run to seed SSL secrets.

### Prompt 2

Is there a secrets manager in both ephemeral and durable localstacks?

### Prompt 3

We should disable SecretsManager in ephemeral localstack if possible. If not, let's make sure that it never gets used.

