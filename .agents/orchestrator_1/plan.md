# Plan: Transition to Proximity-Based Matching

## Objective
Transition Wira application from strict geofencing to PostGIS proximity matching across frontend-user, Supabase RPC, and test verification.

## Phases
1. **Phase 0: Survey & Codebase Exploration**
   - Spawn 3 Explorers (Frontend, Backend/SQL, Test/Infra) in parallel.
   - Aggregate findings into `PROJECT.md` (Architecture, Feature Inventory, Milestones, Interface Contracts).

2. **Phase 1: Milestone Decomposition**
   - M1: Frontend Lazy GPS Load (`frontend-user/src/pages/HomePage.jsx` etc.)
   - M2: Supabase PostGIS Nearest Driver RPC (`nearest_drivers` / PostGIS distance operator)
   - M3: Proximity Verification Test Script (`test_proximity.js`) & Integration Verification

3. **Phase 2: Execution & Verification Loop**
   - Execute milestones via Explorer -> Worker -> Reviewer -> Challenger -> Auditor cycles.
   - Strictly enforce non-negotiable integrity standards and binary auditor veto.

4. **Phase 3: Final Acceptance & Reporting**
   - Verify all acceptance criteria from `ORIGINAL_REQUEST.md`.
   - Report completion back to Sentinel with evidence and verification artifacts.
