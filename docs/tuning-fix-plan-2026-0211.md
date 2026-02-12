Here's everything worth tuning, organized by impact.
                                                                                                                                                                       
---                                                                                                                                                                  
HIGH IMPACT

1. bcrypt blocks the event loop on every login/registration                                                                                                          
   backend/shared/constants.js:8 — Salt rounds = 12 (~250-300ms of synchronous CPU per call). Every concurrent auth request serializes behind this.
- Fix: Drop to 10 (~60-80ms, still OWASP-compliant), or offload to a worker thread.
  For #1, will offloading to a separate thread help, or will it just block waiting for the thread to complete?

⏺ Good question. The answer is: it helps significantly, but not for the reason you might think.

The problem isn't that the calling request waits — it always will. The problem is that bcrypt blocks the entire event loop, meaning every other request (health      
checks, order submissions, other logins) queues up behind it for ~300ms. With 5 concurrent logins, the last one waits ~1.5 seconds before its bcrypt even starts.

With a worker thread, awaiting the result yields the event loop. The calling request still takes ~300ms, but all other requests proceed normally during that time.

That said, there's an even simpler fix here. Let me check what you're actually using.

⏺ Searched for 1 pattern, read 1 file (ctrl+o to expand)

⏺ You're using bcryptjs (the pure JavaScript implementation). This is the key detail:

- bcryptjs — even its async API (await bcrypt.hash(...)) runs on the main thread. It uses setTimeout to yield periodically, but the CPU work still monopolizes the   
  event loop. A worker thread would help here.
- bcrypt (the native C++ package) — its async API automatically offloads to libuv's thread pool. No worker thread code needed. It's also ~3-4x faster per operation.

So you have two options:
┌───────────────────────────────┬────────────────────────┬────────────────────────┬─────────────────────────────────────────────────────┐
│           Approach            │  Event loop blocked?   │   Speed at rounds=12   │                     Code change                     │
├───────────────────────────────┼────────────────────────┼────────────────────────┼─────────────────────────────────────────────────────┤
│ Switch bcryptjs → bcrypt      │ No (libuv threads)     │ ~80ms                  │ Swap dependency, zero code changes (API-compatible) │
├───────────────────────────────┼────────────────────────┼────────────────────────┼─────────────────────────────────────────────────────┤
│ Keep bcryptjs + worker thread │ No (worker thread)     │ ~300ms                 │ Need worker thread wrapper                          │
├───────────────────────────────┼────────────────────────┼────────────────────────┼─────────────────────────────────────────────────────┤
│ Drop rounds 12 → 10           │ Still yes, but shorter │ ~60-80ms with bcryptjs │ One constant                                        │
└───────────────────────────────┴────────────────────────┴────────────────────────┴─────────────────────────────────────────────────────┘
Switching to native bcrypt is the simplest win — it's a drop-in replacement (same API), unblocks the event loop automatically, and is faster. The only trade-off is
it requires a native compilation step during npm install, which you already handle since you have a Dockerfile with a build stage.

Reducing rounds from 12 to 10 is complementary — you can do both.

Want me to go ahead with swapping the dependency?


2. MCP product recommendations block the auth response
   backend/api-gateway/routes/auth.js:224-229 (registration) and auth.js:381-386 (login) — await getRecommendedProducts(userId) is called before responding. A slow/down
   MCP server delays every login.
- Fix: Return the auth response immediately; fetch recommendations in a separate frontend API call (localStorage already handles caching).

3. Health check probes 3 external services on every call
   backend/api-gateway/server.js:206-275 — /health hits the database, SQS, and MCP server. Docker/load-balancer probes call this every 10-30s.
- Fix: Cache health results with a 5-10s TTL. At minimum, remove the MCP call (it's optional).

4. Order processor handles messages sequentially
   backend/order-processor/processor.js:269-273 — Receives up to 10 messages but processes them one-by-one with for...await.
- Fix: Use Promise.all with bounded concurrency (2-3, matching DB_CONNECTION_LIMIT). Could cut batch time 50-70%.

5. SecretsManager client re-instantiated on every call
   backend/shared/database.js:16 — A new SecretsManagerClient (including HTTP client setup) is created inside getDbCredentials() each time.
- Fix: Cache the client instance at module level.

6. CSRF middleware re-parses CORS_ORIGIN on every state-changing request
   backend/api-gateway/middleware/csrf-middleware.js:110 — parseAllowedOrigins() runs on every POST/PUT/DELETE. The value never changes at runtime.
- Fix: Parse once at module load time.

  ---
MEDIUM IMPACT

7. Redundant user existence check per order
   backend/order-processor/processor.js:133-144 — SELECT to verify user exists before insert, but the orders table already has a FK constraint on user_id. Extra DB
   round-trip per order.
- Fix: Remove the SELECT; handle the FK violation error instead.

8. Product lookup on every order submission — never cached
   backend/api-gateway/server.js:403-413 — SELECT ... FROM products WHERE id = ? on every order. Only 11 static rows.
- Fix: Cache the products table in memory with a 5-60 minute TTL.

9. Frontend API timeout is 30 seconds
   frontend/src/services/api.js:21 — Users stare at a spinner for 30s before seeing an error.
- Fix: 10-15s for writes, 5-10s for reads.

10. Nginx proxy timeouts are 60 seconds
    frontend/nginx.conf.template:90-92 — Combined with the frontend's 30s, failed requests hang.
- Fix: Reduce to 15-30s.

11. No DB connection keepalive configured
    backend/shared/database.js:67-76 — Pool has no enableKeepAlive or idleTimeout. Idle connections can go stale behind Docker NAT, causing first-query-after-idle
    failures.
- Fix: Add enableKeepAlive: true, keepAliveInitialDelay: 30000.

12. Docker healthcheck start periods are overly conservative
    Frontend Dockerfile: 90s start period for a static nginx container. Order processor: 60s + 20 retries. LocalStack: 30 retries.
- Fix: Frontend → 15-20s. Order processor → 30s/10 retries. LocalStack → 15 retries.

13. Missing composite index for the orders query
    init-db.sql — SELECT ... WHERE user_id = ? ORDER BY created_at DESC has separate indexes on each column but no composite index.
- Fix: CREATE INDEX idx_user_orders ON orders(user_id, created_at DESC);

14. require() inside request handlers
    backend/api-gateway/server.js:240 — SQS client destructured inside the /health handler. Also at lines 444, 564 for OTEL imports.
- Fix: Move to module top-level.

  ---
LOW IMPACT

- Test hardcoded sleeps (orders.test.js:214,285,320,328) — 2-3s fixed waits. Replace with polling loops.
- bodyParser instead of express.json() — unnecessary dependency.
- Swagger UI loaded in all non-production envs — adds startup time even in CI.
- No gzip_proxied in nginx — API JSON responses pass through uncompressed.
- npm audit during Docker build — adds 2-5s network call per build; better as a CI step.
- Nginx DNS resolver TTL for OTEL proxy is 30s — could be 5 minutes in a stable Docker network.

