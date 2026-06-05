# Deploying mcp-doc-processor over Tailscale (with OAuth for claude.ai)

This runbook hosts the **HTTP transport** (`src/server.js`) on this Mac Studio,
keeps it running via **launchd**, and exposes it on the public internet over HTTPS
via **Tailscale Funnel** so remote MCP clients — including **claude.ai web** — can
reach it.

Two auth paths are supported on the same `/mcp` endpoint:

| Client | Auth | How |
|---|---|---|
| Claude Code / Desktop / API | Static tenant **bearer** | `Authorization: Bearer <token>` |
| **claude.ai web** | **OAuth 2.1** (PKCE + DCR) | Custom connector; paste the tenant token on the consent page |

The OAuth login step bridges to the existing per-tenant tokens (`tenants.json`),
so there is no separate user database. See `src/oauth/`.

---

## 0. Prerequisites (already done on this machine)

- Node `v24.x` at `/usr/local/bin/node`
- Tailscale installed: `brew install tailscale` (CLI at `/opt/homebrew/bin/tailscale`)

## 1. Start the Tailscale daemon and join the tailnet

```bash
brew services start tailscale        # runs tailscaled as a background service
sudo tailscale up                    # opens a browser to log in / authorize this device
tailscale status                     # note this device's MagicDNS name, e.g.
                                     #   works-mac-studio.tailXXXX.ts.net
```

In the **Tailscale admin console** (https://login.tailscale.com/admin):

1. **DNS** → enable **MagicDNS**.
2. **DNS** → enable **HTTPS Certificates**.
3. **Access controls** → ensure the `funnel` node attribute is granted, e.g.:
   ```json
   "nodeAttrs": [
     { "target": ["autogroup:member"], "attr": ["funnel"] }
   ]
   ```

## 2. Configure and install the launchd service

```bash
cp deploy/com.leanzero.docprocessor.plist ~/Library/LaunchAgents/
# Edit ~/Library/LaunchAgents/com.leanzero.docprocessor.plist and replace every
# REPLACE_ME value: PUBLIC_HOST + ISSUER_URL = your ts.net name, a strong random
# DOC_PROCESSOR_ADMIN_TOKEN, and the AI keys.
chmod 600 ~/Library/LaunchAgents/com.leanzero.docprocessor.plist   # it holds secrets

launchctl load -w ~/Library/LaunchAgents/com.leanzero.docprocessor.plist
curl -s localhost:8443/healthz        # -> {"ok":true,...}
```

Generate a strong admin token: `openssl rand -base64 32`.

Manage the service:
```bash
launchctl unload ~/Library/LaunchAgents/com.leanzero.docprocessor.plist   # stop
launchctl load  -w ~/Library/LaunchAgents/com.leanzero.docprocessor.plist # start
tail -f logs/launchd.err.log logs/server.log                              # logs
```

## 3. Mint a tenant token (one per consumer)

```bash
ADMIN=<DOC_PROCESSOR_ADMIN_TOKEN>
curl -s -X POST localhost:8443/v1/admin/tenants \
  -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" \
  -d '{"displayName":"alice-laptop"}'
# -> {"tenantId":"...","bearer":"<SAVE THIS — shown once>","displayName":"alice-laptop"}
```
Rotate / revoke / list:
```bash
curl -s -X POST   localhost:8443/v1/admin/tenants/<id>/rotate -H "Authorization: Bearer $ADMIN"
curl -s -X DELETE localhost:8443/v1/admin/tenants/<id>        -H "Authorization: Bearer $ADMIN"
curl -s            localhost:8443/v1/admin/tenants            -H "Authorization: Bearer $ADMIN"
```

## 4. Open the public Funnel

Funnel only allows ports 443 / 8443 / 10000.

```bash
tailscale funnel --bg 8443        # background; auto-resumes after reboot
tailscale funnel status           # confirm the public mapping
# Public URL: https://<your-name>.tailXXXX.ts.net  ->  localhost:8443
```

Verify from off-LAN (e.g. phone on cellular):
```bash
curl -s https://<your-name>.tailXXXX.ts.net/healthz
curl -s https://<your-name>.tailXXXX.ts.net/.well-known/oauth-authorization-server
```

## 5. Connect clients

**Claude Code / Desktop / API** (static bearer):
```bash
claude mcp add --transport http doc-processor \
  https://<your-name>.tailXXXX.ts.net/mcp \
  --header "Authorization: Bearer <tenant-token>"
```

**claude.ai web** (OAuth):
1. claude.ai → Settings → Connectors → **Add custom connector**.
2. URL: `https://<your-name>.tailXXXX.ts.net/mcp`
3. Start the connection → you'll be redirected to the consent page → **paste your
   tenant token** → authorize. claude.ai registers dynamically and completes the
   OAuth code+PKCE exchange automatically.

---

## Security notes

- Funnel is **public internet**. The wall is: argon2 bearer tokens, per-tenant rate
  limiting (`TENANT_RATE_LIMIT`), and DNS-rebinding protection (`PUBLIC_HOST`).
- Keep `tenants.json`, `oauth-tokens.json`, `oauth-clients.json` at mode `0600`
  (the server writes them that way; `DATA_DIR` should not be world-readable).
- Use a strong random `DOC_PROCESSOR_ADMIN_TOKEN`. **The admin API (`/v1/admin/*`)
  is blocked from the public Funnel by default** — it only answers requests that
  arrive directly on `localhost` (no `X-Forwarded-For`). Requests proxied in via
  Funnel get a `404`, even with a valid admin token. Mint/rotate tokens by running
  `curl localhost:8443/v1/admin/...` on this machine. To deliberately expose the
  admin API publicly, set `ALLOW_ADMIN_OVER_FUNNEL=true` (not recommended).
- OAuth access tokens are short-lived (1h, refreshable); `/revoke` is supported.

## Tailnet-only alternative (no public exposure)

If you later decide claude.ai web is not needed, swap Funnel for Serve to keep the
service private to your devices (Claude Code/Desktop still work with the bearer):
```bash
tailscale serve --bg --https=443 localhost:8443
```
