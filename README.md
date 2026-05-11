# ParsRoute Bot

Telegram bot for selling VPN configs (3X-UI) with TON payment support.

## Quick Start

```bash
cp .env.example .env   # fill in all values before continuing
pnpm install
pnpm db:migrate        # creates tables (requires postgres to be running)
pnpm dev               # starts bot with hot reload
```

## Configuration Notes

### Bot Token
1. Message @BotFather on Telegram
2. Send `/newbot`, follow the prompts
3. Copy the token into `BOT_TOKEN`

### Admin IDs (`ADMIN_IDS`)
Message @userinfobot on Telegram — it replies with your numeric user ID.
For multiple admins: `ADMIN_IDS=111111111,222222222`

### Log Channel (`LOG_CHANNEL_ID`)
1. Create a Telegram channel (public or private)
2. Add the bot as **administrator** with "Post Messages" enabled
3. Forward any channel message to @userinfobot — it shows the channel ID (a large negative number like `-1001234567890`)
4. Set that as `LOG_CHANNEL_ID`

### 3X-UI Panel URL (`XUI_PANEL_URL`)
The URL must include the **webBasePath** (the secret path configured in your panel):
- Panel: **Settings → Panel Config → Web Path**
- Format: `http://<server-ip>:<port>/<webBasePath>`
- Example: `http://1.2.3.4:54321/abc123secretpath`
- Do **not** add a trailing slash

### TON Wallet Address (`TON_WALLET_ADDRESS`)
Must be **non-bounceable** format — starts with `UQ`, exactly 48 characters.

| Format | Starts with | Use for |
|--------|-------------|---------|
| Non-bounceable ✅ | `UQ...` | Receiving payments |
| Bounceable ❌ | `EQ...` | Smart contracts only |

In **Tonkeeper**: Wallet → Receive → copy the address (should be `UQ...`)
In **MyTonWallet**: Menu → Receive → choose "Non-bounceable"

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start with hot reload (tsx watch) |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Run compiled bot |
| `pnpm db:generate` | Regenerate Prisma client after schema changes |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:studio` | Open Prisma Studio (DB browser) |
| `pnpm typecheck` | Type-check without emitting files |
| `pnpm lint` | Lint source files |

## Architecture Notes

- **Money**: all wallet balances are `BigInt` in Toman (IRT). Never use `Number` for money.
- **Config**: only `src/lib/config.ts` reads `process.env`. Fail-fast validation at startup.
- **Admin access**: non-admin updates hitting admin handlers are silently dropped (no error message shown).
- **Conversations**: session + conversations plugin are wired up; add conversation flows under `src/bot/handlers/`.
- **Adapters**: `src/adapters/` contains interfaces only — implementations go in the same directory when ready.
- **Workers**: register BullMQ queues/workers in `src/workers/index.ts`.
