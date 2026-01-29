# Server Agent Notes

Cloudflare Worker serving the Scratch API and content delivery.

## Security Model

**READ THIS FIRST** before modifying authentication, cookies, or content serving.

### Critical: Content Domain Isolation

The content domain (`pages.*`) serves **untrusted, user-submitted JavaScript**. Any visitor to a malicious project could have attacker-controlled JS running in their browser.

### Security Invariants

1. **No shared cookies**: Session cookies are scoped to the app domain only (`app.*`), never `*.example.com`. Sharing cookies would let malicious JS make authenticated API requests.

2. **Project-scoped content tokens**: Content tokens (for private project access) are scoped to a single project. A token for project A cannot access project B. User-scoped tokens would let an attacker on project A steal access to all of a victim's private projects.

3. **CORS policy**: API endpoints must not allow content domain origins in `Access-Control-Allow-Origin`.

### Attack Scenarios to Prevent

- Attacker uploads malicious JS to their project
- Victim visits attacker's project while logged in
- Malicious JS attempts to:
  - Read victim's session cookie → BLOCKED (cookie not shared)
  - Make API requests to app domain → BLOCKED (CORS + no cookie)
  - Use victim's content token for other projects → BLOCKED (project-scoped)

### When Modifying Auth Code

Before changing authentication, content tokens, or cookie handling:

1. Re-read this security model
2. Verify changes don't violate these invariants
3. Consider: "If a user visits a malicious project, what can the attacker do?"
4. Read BetterAuth docs: https://www.better-auth.com/llms.txt
5. See root `CLAUDE.md` for auth architecture details

## Server Architecture

The server is a Cloudflare Worker using the Hono framework.

### Directory Structure

```
server/src/
├── index.ts              # Entry point, domain routing
├── auth.ts               # BetterAuth configuration
├── env.ts                # TypeScript env interface (auto-generated)
├── db/
│   └── client.ts         # Database client
├── lib/                  # Shared utilities
│   ├── access.ts         # Authorization checks
│   ├── content-token.ts  # JWT for private content access
│   ├── content-serving.ts # File serving logic
│   ├── domains.ts        # Domain parsing and routing
│   ├── visibility.ts     # Visibility level logic
│   └── ...
└── routes/
    ├── app/              # App subdomain routes
    │   ├── auth.ts       # OAuth, device auth, content tokens
    │   ├── ui.ts         # HTML pages (device approval, etc.)
    │   └── api/          # API endpoints
    │       ├── projects.ts
    │       ├── deploys.ts
    │       ├── users.ts
    │       └── share-tokens.ts
    ├── pages.ts          # Content subdomain (serves user files)
    └── www.ts            # Marketing site routing
```

### Route Organization

Routes are split by subdomain:

- **App subdomain** (`app.*`): API, OAuth, device authorization
- **Pages subdomain** (`pages.*`): Serves user-uploaded static files
- **WWW subdomain** (`www.*` or apex): Marketing site

### Key Files

| File | Purpose |
|------|---------|
| `lib/content-token.ts` | JWT create/verify for private content |
| `routes/app/auth.ts` | `/auth/content-access` endpoint |
| `routes/pages.ts` | Content serving with token validation |
| `auth.ts` | BetterAuth config with device authorization |

## Database

Uses Cloudflare D1 (SQLite). Schema is in `server/schema.sql`.

```bash
# Run migrations
bun ops server -i <instance> db migrate

# Query database
bun ops server -i <instance> db query "SELECT * FROM user LIMIT 5"
```

## Local Development

```bash
cd server && bun run dev    # Start local dev server
```

This uses wrangler for local development with D1 bindings.
