# Graph Report - .  (2026-05-11)

## Corpus Check
- Corpus is ~2,498 words - fits in a single context window. You may not need a graph.

## Summary
- 98 nodes · 146 edges · 16 communities (7 shown, 9 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.81)
- Token cost: 31,222 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Bot Core & Admin Handlers|Bot Core & Admin Handlers]]
- [[_COMMUNITY_Bot Factory & Config Bootstrap|Bot Factory & Config Bootstrap]]
- [[_COMMUNITY_Error Class Hierarchy|Error Class Hierarchy]]
- [[_COMMUNITY_Design Rationale & Error Concepts|Design Rationale & Error Concepts]]
- [[_COMMUNITY_Admin Access Control|Admin Access Control]]
- [[_COMMUNITY_User Persistence Layer|User Persistence Layer]]
- [[_COMMUNITY_XUI VPN Adapter|XUI VPN Adapter]]
- [[_COMMUNITY_User Menu & Navigation|User Menu & Navigation]]
- [[_COMMUNITY_TON Payment Adapter|TON Payment Adapter]]
- [[_COMMUNITY_FX Rate Adapter|FX Rate Adapter]]
- [[_COMMUNITY_Project Overview Docs|Project Overview Docs]]
- [[_COMMUNITY_Errors Module|Errors Module]]
- [[_COMMUNITY_TON Transaction Type|TON Transaction Type]]
- [[_COMMUNITY_XUI Client Params|XUI Client Params]]
- [[_COMMUNITY_XUI VPN Client Type|XUI VPN Client Type]]
- [[_COMMUNITY_XUI Inbound Type|XUI Inbound Type]]

## God Nodes (most connected - your core abstractions)
1. `Bot Factory (createBot)` - 8 edges
2. `Config Module (Zod Validation)` - 7 edges
3. `logger` - 6 edges
4. `Config` - 6 edges
5. `BotContext` - 6 edges
6. `Logger Module (Pino)` - 6 edges
7. `createBot()` - 5 edges
8. `AppError Base Class` - 5 edges
9. `BotContext Type Definition` - 5 edges
10. `Admin Access Middleware` - 5 edges

## Surprising Connections (you probably didn't know these)
- `TON Non-Bounceable Address Requirement` --rationale_for--> `Config Module (Zod Validation)`  [EXTRACTED]
  README.md → src/lib/config.ts
- `BigInt Money Rule` --rationale_for--> `User Table Migration`  [INFERRED]
  README.md → prisma/migrations/20260511155714_init/migration.sql
- `Fail-Fast Config Validation` --rationale_for--> `Config Module (Zod Validation)`  [EXTRACTED]
  README.md → src/lib/config.ts
- `Bot Middleware Chain Order` --rationale_for--> `Bot Factory (createBot)`  [EXTRACTED]
  CLAUDE.md → src/bot/index.ts
- `Admin Access Middleware` --implements--> `Admin Silent Drop Pattern`  [EXTRACTED]
  src/bot/middlewares/admin.middleware.ts → CLAUDE.md

## Hyperedges (group relationships)
- **Bot Middleware Pipeline (session → conversations → userSync → handlers)** — bot_index, usersync_middleware, admin_menu_handler, start_handler [EXTRACTED 1.00]
- **VPN + Payment + FX Adapter Interfaces** — xui_interface, ton_interface, fx_interface [INFERRED 0.85]
- **User Sync Flow (middleware → service → db)** — usersync_middleware, user_service, db_client [EXTRACTED 1.00]

## Communities (16 total, 9 thin omitted)

### Community 0 - "Bot Core & Admin Handlers"
Cohesion: 0.17
Nodes (20): Admin Menu Inline Keyboard, Admin Menu Handler, Admin Access Middleware, Bot Menu Constants, Bot Factory (createBot), BotContext Type Definition, Admin Silent Drop Pattern, Bot Middleware Chain Order (+12 more)

### Community 1 - "Bot Factory & Config Bootstrap"
Cohesion: 0.25
Nodes (11): registerAdminHandlers(), createBot(), SessionData, registerStartHandler(), Config, parsed, schema, logger (+3 more)

### Community 2 - "Error Class Hierarchy"
Cohesion: 0.15
Nodes (6): AppError, InsufficientBalanceError, NotFoundError, TonError, ValidationError, XuiPanelError

### Community 3 - "Design Rationale & Error Concepts"
Cohesion: 0.18
Nodes (13): Adapters Interfaces-Only Pattern, AppError Base Class, InsufficientBalanceError, NotFoundError, TonError, ValidationError, XuiPanelError, IFxClient Interface (TON/IRR Exchange Rate) (+5 more)

### Community 4 - "Admin Access Control"
Cohesion: 0.52
Nodes (3): BotContext, adminMenuKeyboard(), adminMiddleware()

### Community 5 - "User Persistence Layer"
Cohesion: 0.38
Nodes (4): prisma, userSyncMiddleware(), UpsertParams, userService

### Community 6 - "XUI VPN Adapter"
Cohesion: 0.4
Nodes (4): CreateClientParams, IXuiClient, XuiInbound, XuiVpnClient

## Knowledge Gaps
- **29 isolated node(s):** `IFxClient`, `ITonClient`, `TonTx`, `IXuiClient`, `CreateClientParams` (+24 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `User Table Migration` connect `Design Rationale & Error Concepts` to `Bot Core & Admin Handlers`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `User Service` connect `Bot Core & Admin Handlers` to `Design Rationale & Error Concepts`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **What connects `IFxClient`, `ITonClient`, `TonTx` to the rest of the system?**
  _29 weakly-connected nodes found - possible documentation gaps or missing edges._