# Session Context

## User Prompts

### Prompt 1

=> [mcp-server 3/8] COPY backend/mcp-server/package*.json ./                                                                                                                                                                                               0.1s
 => ERROR [mcp-server 4/8] RUN npm ci                                                                                                                                                                                                               ...

### Prompt 2

We previously moved all of the package-lock.json files to the root level. Please change the docker build to reference that.

### Prompt 3

> echobase-e2e-tests@1.0.0 test
> playwright test
sh: 1: playwright: not found

### Prompt 4

this is inside the CI container. And it's always worked before, so this must be a recent refactoring change.

### Prompt 5

I get a bunch of these. Can we not install only what we need? Removing unused browser at /ms-playwright/chromium-1194
Removing unused browser at /ms-playwright/chromium_headless_shell-1194
Removing unused browser at /ms-playwright/firefox-1495
Removing unused browser at /ms-playwright/webkit-2215

