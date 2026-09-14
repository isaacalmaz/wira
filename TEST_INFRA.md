# E2E Test Infra: WiraPartner

## Test Philosophy
- Opaque-box, requirement-driven. Derives strictly from `ORIGINAL_REQUEST.md` and user-facing partner app expectations.
- Methodology: 4-Tier Test Framework (Category-Partition + Boundary Value Analysis + Combinatorial Pairwise + Real-World Workload).

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Unified Partner Mode Toggle | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | Driver Mode Order Lifecycle (WiraRide, WiraSend) | ORIGINAL_REQUEST §R1, R2 | 5 | 5 | ✓ |
| 3 | Driver GPS Location Tracking | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 4 | Merchant Mode Order Lifecycle (WiraFood, WiraVilla) | ORIGINAL_REQUEST §R1, R2 | 5 | 5 | ✓ |
| 5 | Real-Time Sync & Fallback Polling | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 6 | Capacitor.js Config & APK Readiness | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 7 | Build & Bundle Integrity (`npm run build`) | ORIGINAL_REQUEST §AC | 5 | 5 | ✓ |

## Test Architecture
- **E2E Test Runner**: Multi-tier test suite executed via `node run_e2e_tests.js` and `node verify_partner_flow.js`.
- **Pass/Fail Semantics**: Exit code 0 indicates all assertions passed without error; non-zero indicates failure.
- **Assertion Engine**: Checks database mutations in Supabase (`orders.status`, `orders.driver_id`, `drivers.lat`, `drivers.lng`) and file artifacts (`dist/`, `capacitor.config.json`).
- **Teardown**: Deterministic removal of mock records in `finally` blocks.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Driver Ride Full Flow: User orders ride -> Driver receives realtime alert -> Driver accepts -> GPS updates on route -> Driver arrives and completes ride | F1, F2, F3, F5 | High |
| 2 | Driver Package Send Flow: User sends package -> Driver accepts -> Location tracking -> Handover completion | F1, F2, F3, F5 | Medium |
| 3 | Merchant Food Preparation: User orders food -> Merchant accepts -> Prepares -> Marks ready for pickup -> Handover complete | F1, F4, F5 | High |
| 4 | Merchant Villa Booking: User books villa -> Merchant confirms -> Marks ready/check-in ready -> Completed | F1, F4, F5 | Medium |
| 5 | Dual-Role Shift Switching: User switches from Driver Mode to Merchant Mode seamlessly without state collision or stale subscriptions | F1, F2, F4, F5 | High |

## Coverage Thresholds
- Tier 1 (Feature Coverage): ≥35 test cases (≥5 per feature across 7 core features)
- Tier 2 (Boundary & Corner Cases): ≥35 test cases (≥5 per feature)
- Tier 3 (Cross-Feature Combinations): ≥7 test cases (pairwise interactions)
- Tier 4 (Real-World Scenarios): ≥5 realistic end-to-end workload flows
- **Total Minimum**: ≥82 test cases
