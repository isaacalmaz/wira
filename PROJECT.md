# Project: WiraPartner

## Architecture
- **Framework & Runtime**: React 18 (`^18.3.1`), Vite 5 (`^5.2.0`), TypeScript 5 (`^5.4.5`), Tailwind CSS 3 (`^3.4.3`), Lucide React icons.
- **Mobile Container**: Capacitor.js (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android` v6.x) mapping `webDir: 'dist'`, appId `com.wira.partner`, appName `WiraPartner`.
- **Backend & Realtime Data Layer**: Supabase PostgreSQL database (`public.orders`, `public.drivers`, `public.merchants`, `public.users`).
  - Realtime Change Data Capture via WebSocket subscription to `postgres_changes` on `public.orders`.
  - Resilience Polling Fallback: 10-second polling interval ensures zero dropped orders during mobile background sleep/wake cycles.
  - Driver Geolocation: Browser Geolocation API synchronizes `lat` and `lng` to `public.drivers`, with PostgreSQL trigger `trg_sync_driver_location` updating PostGIS `location` point automatically.
- **Headless Service Architecture**: Business logic is isolated in `frontend-partner/src/services/partnerOrderService.js`. Both the React UI components and the Node.js E2E test harness (`verify_partner_flow.js`) import this exact service layer.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Workspace Integration | Monorepo `package.json` workspace includes `frontend-partner` | M1 | Survey |
| 2 | Project Tooling & Dependencies | Vite, React 18, Tailwind CSS, Lucide icons, Supabase JS client installed and configured | M1 | Survey |
| 3 | Capacitor.js Mobile Setup | `@capacitor/core`, `@capacitor/android`, `@capacitor/cli` initialized with `capacitor.config.json` (`webDir: 'dist'`) and Android sync readiness | M1 | Survey (R3) |
| 4 | Mobile Safe-Area & Viewport Layout | Viewport meta, mobile safe-area padding, Tailwind mobile layout | M1 | Survey (R1) |
| 5 | Supabase Client & Auth Configuration | Client initialization from env (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), demo login support, session persistence | M1 | Survey (R1) |
| 6 | Core Partner Order Service | Decoupled headless service (`partnerOrderService.js`) with methods: `fetchOrders`, `acceptOrder`, `updateDriverLocation`, `updateOrderStatus`, `completeOrder` | M1 | Survey (R2, AC) |
| 7 | Unified Partner Mode Toggle | UI header toggle between Driver Mode and Merchant Mode governed by `user.mitra_access` | M2 | Survey (R1) |
| 8 | Driver Mode Dashboard | Online/offline toggle, active trips overview, completed counter, mobile cards | M2 | Survey (R1) |
| 9 | Driver Incoming Order Real-Time Sync | Realtime listener for `pending` orders with `service_type IN ('ride', 'send')` + 10s polling fallback | M2 | Survey (R2) |
| 10 | Driver Order Acceptance | Atomic update assigning `driver_id` and setting `status = 'accepted'` | M2 | Survey (R2) |
| 11 | Driver GPS Location Tracking | Geolocation updates pushing `lat`/`lng` to `public.drivers` with PostGIS sync trigger | M2 | Survey (R2) |
| 12 | Driver Navigation & Status Progression | Route directions / navigation intent and status progression (`accepted` -> `picking_up` / `delivering` -> `completed`) | M2 | Survey (R2) |
| 13 | Driver Trip Completion | Set `orders.status = 'completed'` and return to online dispatch queue | M2 | Survey (R2, AC) |
| 14 | Merchant Mode Dashboard | Store open/closed status, pending/preparing/ready order queues, summary statistics | M3 | Survey (R1) |
| 15 | Merchant Incoming Order Real-Time Sync | Realtime listener for `pending` orders with `service_type IN ('food', 'villa')` + 10s polling fallback | M3 | Survey (R2) |
| 16 | Merchant Order Acceptance | Transition incoming order from `pending` to `preparing` | M3 | Survey (R2) |
| 17 | Merchant Preparation & Ready for Pickup | Progress order from `preparing` to `ready` for pickup | M3 | Survey (R2) |
| 18 | Merchant Order Handover Completion | Finalize pickup/handover by marking order `completed` | M3 | Survey (R2) |
| 19 | Production Build Target | `npm run build` in `frontend-partner` completes with exit code 0 producing `dist/` | M1 | Survey (AC) |
| 20 | Automated Simulation Script (`verify_partner_flow.js`) | Root-level Node.js script creating mock customer order in Supabase, using `partnerOrderService` to accept and complete it, and verifying DB `status === 'completed'` | M4 | Survey (AC) |
| 21 | Graceful Offline/Reconnection Resilience | Channel reconnection logic and fallback polling | M2, M3 | Survey |
| 22 | Deterministic Test Teardown | Mock order cleanup and test isolation in `verify_partner_flow.js` | M4 | Survey (AC) |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core Foundation & Mobile Packaging | Project scaffolding, Vite/React/Tailwind, Capacitor configuration (`capacitor.config.json`), `@capacitor/android` setup, `partnerOrderService.js`, Supabase client, build verification | none | PLANNED |
| M2 | Driver Mode Operations | Driver dashboard, online toggle, real-time ride/send order listening, atomic acceptance, GPS tracking via `public.drivers`, trip progression and completion | M1 | PLANNED |
| M3 | Merchant Mode Operations | Merchant dashboard, store open toggle, real-time food/villa order listening, order acceptance, `preparing` status, `ready` status, handover completion | M1 | PLANNED |
| M4 | Final Milestone: E2E Integration & Verification | Phase 1: 100% passing E2E test suite (Tiers 1-4) & `verify_partner_flow.js`. Phase 2: Adversarial coverage hardening (Tier 5) | M1, M2, M3 | PLANNED |

## Interface Contracts
### `partnerOrderService` Interface
```typescript
export interface PartnerOrder {
  id: string;
  user_id: string;
  driver_id?: string | null;
  merchant_id?: string | null;
  service_type: 'ride' | 'send' | 'food' | 'villa';
  title?: string;
  details?: string;
  status: 'pending' | 'accepted' | 'preparing' | 'ready' | 'delivering' | 'completed' | 'cancelled';
  total_price: number;
  payment_method: string;
  payment_status: string;
  created_at?: string;
}

export interface IPartnerService {
  getOrders(filter?: { mode?: 'driver' | 'merchant'; status?: string; driverId?: string; merchantId?: string }): Promise<PartnerOrder[]>;
  acceptOrder(orderId: string, partnerId: string, mode: 'driver' | 'merchant'): Promise<PartnerOrder>;
  updateOrderStatus(orderId: string, status: string, additionalFields?: Record<string, any>): Promise<PartnerOrder>;
  updateDriverLocation(driverId: string, lat: number, lng: number): Promise<{ success: boolean; lat: number; lng: number }>;
  completeOrder(orderId: string): Promise<PartnerOrder>;
  subscribeToIncomingOrders(mode: 'driver' | 'merchant', partnerId: string, onOrder: (order: PartnerOrder) => void): () => void;
}
```

## Code Layout
```
/Users/ishakalmaazi/.gemini/antigravity/scratch/wira/
├── frontend-partner/                       # WiraPartner Application Root
│   ├── package.json                        # Dependencies, build scripts
│   ├── vite.config.ts                      # Vite build configuration
│   ├── tsconfig.json                       # TypeScript config (noEmit: true)
│   ├── tailwind.config.js                  # Tailwind mobile responsive theme
│   ├── postcss.config.js                   # PostCSS Tailwind plugins
│   ├── capacitor.config.json               # Capacitor configuration (webDir: 'dist')
│   ├── index.html                          # Entry HTML with mobile viewport
│   ├── android/                            # Capacitor Android project files
│   └── src/
│       ├── main.tsx                        # React application entry point
│       ├── App.tsx                         # Main container & Mode toggle
│       ├── config/
│       │   └── supabase.js                 # Supabase client singleton & env loader
│       ├── services/
│       │   └── partnerOrderService.js      # Headless business logic service
│       ├── context/
│       │   └── AuthContext.tsx             # Supabase auth & partner role context
│       ├── components/
│       │   ├── Header.tsx                  # App bar with Driver/Merchant toggle
│       │   ├── DriverView.tsx              # Driver UI (Ride, Send, GPS, Trip)
│       │   ├── MerchantView.tsx            # Merchant UI (Food, Villa, Queues)
│       │   └── OrderCard.tsx               # Mobile-optimized order action card
│       └── types/
│           └── partner.ts                  # TypeScript models and interfaces
└── verify_partner_flow.js                  # Root E2E simulation script
```
