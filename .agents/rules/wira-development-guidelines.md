---
name: wira-development-guidelines
description: Wira super-app development invariants and architectural rules extracted from WIRA_HANDOFF.md.
priority: 100
---

# Wira Development Guidelines

Based on the `WIRA_HANDOFF.md` document, all agents working on the Wira Super-App must adhere to the following invariants:

1. **Verify Migrations Realistically**: Never assume a Supabase SQL migration is successful just because it executed without errors. Policies and triggers (especially RLS/RPC related to wallets and orders) must be live-tested with real simulated user/driver interactions to confirm they actually restrict access.
2. **Build Verification**: When building the monorepo workspaces (`frontend-user`, `frontend-mitra`, `frontend-admin`), always check the FULL output of the `npm run build` commands. Never use `| tail` or truncation, as silent bundler errors often hide in the middle of the logs.
3. **Source of Truth for Pricing**: Order `total_price` is strictly computed server-side via database triggers (e.g., migration 0059). Client-side price calculations are strictly for UI estimates. Do not attempt to bypass this by injecting trusted prices from the client.
4. **Security & Documentation**: The project uses strict Row Level Security (RLS) and state machines (migration 0051). Do not create untracked policies manually via the Supabase Studio UI. All policies must be in tracked `migrations/*.sql` files with clear headers explaining the business/security rationale.
5. **Intentional Architecture Gaps**: WiraSend, WiraService, and WiraPool currently use flat-fee pricing by product design. Do not attempt to "fix" them into distance-based pricing. The `frontend-admin` is intentionally kept as a standard web app (though PWA was recently added per request).
6. **Order Routing**: `frontend-mitra/src/services/orderService.js` is the single source of truth for routing logic (e.g., which driver/vehicle gets which order type). Do not duplicate this logic elsewhere.
