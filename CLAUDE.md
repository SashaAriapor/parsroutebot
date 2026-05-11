# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev            # start bot with hot reload (tsx watch)
pnpm build          # tsc + tsc-alias (resolves @/* path aliases)
pnpm typecheck      # type-check without emitting
pnpm lint           # eslint src/

pnpm db:migrate     # apply migrations (requires postgres)
pnpm db:generate    # regenerate Prisma client after schema changes
pnpm db:studio      # open Prisma Studio

pnpm start          # run compiled dist/ (production)
```

After any `prisma/schema.prisma` change, always run `pnpm db:generate` before typechecking.

## Architecture

### Entry point & startup order
`src/main.ts` → loads dotenv → imports `config` (Zod validation runs, exits on failure) → `createBot()` → long-poll start. Config validation is intentionally fail-fast before any bot logic executes.

### Bot middleware chain (order matters)
`src/bot/index.ts` wires them in this exact sequence:
1. `session` — required before conversations
2. `conversations()` — grammY conversations plugin
3. `userSyncMiddleware` — upserts `User` in DB, attaches to `ctx.dbUser`
4. Handler registration (`registerStartHandler`, `registerAdminHandlers`)

### Context type
`src/bot/types.ts` exports `BotContext = Context & ConversationFlavor & SessionFlavor<SessionData> & { dbUser?: User }`. All handlers, middlewares, and keyboards must use this type.

### Admin access
Admin handlers are registered on a `Composer<BotContext>(adminMiddleware)` in `src/bot/handlers/admin/menu.handler.ts`. The middleware silently drops non-admin updates — no error message is ever shown to the user. Callback queries are always answered (to clear Telegram's loading indicator) even when dropped.

### Config
`src/lib/config.ts` is the **only** place that reads `process.env`. Import `config` everywhere else. The exported object is fully typed via Zod inference. `ADMIN_IDS` is parsed to `number[]`, `LOG_CHANNEL_ID` to `number`.

### Money / BigInt rule
All wallet balances are `bigint` (Toman / IRT). Never use `number` for money. Telegram user IDs are also stored as `BigInt` in the DB (`User.id`). Convert with `BigInt(ctx.from.id)` when upserting.

### Adapters pattern
`src/adapters/*/` contains **interfaces and types only** — no implementations yet. Implementations go in the same directory (e.g. `xui.client.ts` next to `xui.interface.ts`). The XUI adapter needs a cookie jar + auto-relogin on 401; see the comment block at the top of `xui.interface.ts` for endpoint paths.

### Adding a new handler
1. Create `src/bot/handlers/<feature>.handler.ts` exporting a `register<Feature>Handler(bot: Bot<BotContext>)` function.
2. Import and call it in `src/bot/index.ts` after `userSyncMiddleware`.
3. For admin-only handlers, wrap in a `Composer<BotContext>(adminMiddleware)` like `menu.handler.ts`.

### Adding a BullMQ queue/worker
Export a `Queue` from `src/workers/index.ts` using the shared `redisConnection`. Keep workers in the same file or subdirectory; import the queue in whichever service enqueues jobs.

### User-facing strings
All text shown to Telegram users must be in **Persian (fa-IR)**. Code comments and log messages are in English.
