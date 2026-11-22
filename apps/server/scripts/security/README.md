# Security and workflow tests

Two scripts that talk to a running server over HTTP.

* `attack.mjs`: 96 attack checks (permissions, privilege escalation, CSRF, injection, uploads, rate limits, payment and refund races, public QR page, print bridge, sockets, headers).
* `smoke.mjs`: a normal shift end to end (orders, printing with a failure and retry, kitchen, payments, stock, expenses, prices).

**They create users, orders, payments and uploads. Use a TEST database only.**

## Run against a real MongoDB

```bash
# 1. a throw-away database
export MONGODB_URI=mongodb://127.0.0.1:27017/ammas_test
export SEED_OWNER_PASSWORD='Owner#Pass2026'        # the scripts log in as owner with this password
export PRINT_BRIDGE_TOKEN=bridge-token-1234567890  # the scripts use this bridge token
export PORT=4100
npm run seed -w apps/server
npm run dev -w apps/server &                        # development mode, TRUST_PROXY unset

# 2. run (a fresh server each time: the login rate limit is remembered in memory)
node apps/server/scripts/security/attack.mjs http://localhost:4100
node apps/server/scripts/security/smoke.mjs  http://localhost:4100
```

Expected: attack suite `FAIL` list contains only `B5` (informational: the Secure cookie flag is off in development).
`ferretdb-harness.ts` is only needed when you test on FerretDB (it tolerates the TTL-index error that FerretDB raises); you do not need it with MongoDB.
