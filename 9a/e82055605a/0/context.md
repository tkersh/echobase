# Session Context

## User Prompts

### Prompt 1

Nginx is giving a 500 after login to prometheus. I suspect it isn't getting the env var properly since I'm also getting these errors when I run start (And the variables it says aren't set are part of the encrypted password)

### Prompt 2

Let's skip .env.secrets altogether and just read from the environment

### Prompt 3

./start.sh should still check for HTPASSWD_CONTENTS and fail fast with the same messages as before

### Prompt 4

After login, https://localhost:443/prometheus/ reroutes to localhost/prometheus without the port, and gives a 500 error

### Prompt 5

Same behavior. How to check the nginx logs to see if the login was accepted?

### Prompt 6

1. Let's make sure that will work in ci as well

### Prompt 7

Nothing should be running as root in any of the subsystems

### Prompt 8

Now prometheus logs in correctly and so does jaeger but jaeger returns a blank page with some scripts and this html. Is it not loading content for some reason?   <body>
    <div id="jaeger-ui-root"></div>
    <!--
      This file is the main entry point for the Jaeger UI application.
      See https://vitejs.dev/guide/#index-html-and-project-root for more information
      on how asset references are managed by the build system.
    -->

### Prompt 9

Why did it work before we added the nginx auth?

### Prompt 10

On signin to jaeger I get 502 Bad Gateway

### Prompt 11

https://localhost:443/jaeger/ after login redirects to https://localhost/jaeger/ and gets 502 bad gateway

### Prompt 12

Let's follow the standard best practice

