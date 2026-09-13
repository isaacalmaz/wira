# BRIEFING — 2026-09-12T13:45:00Z

## Mission
Adversarially challenge Milestone M2: coordinate synchronization in `sync_driver_location`, vehicle type filtering, `only_online` toggle, and PostGIS indexability in `setup_nearest_driver.sql`.

## 🔒 My Identity
- Archetype: challenger
- Roles: critic, specialist
- Working directory: /Users/ishakalmaazi/.gemini/antigravity/scratch/wira/.agents/challenger_backend_2
- Original parent: 33d8d42c-8936-412f-bec0-5f5aca64e47b
- Milestone: M2
- Instance: 2 of 2

## 🔒 Key Constraints
- Review-only — do NOT modify implementation code directly
- Adversarial challenge: stress-test assumptions, find failure modes, propose counter-examples
- Must run empirical verification code yourself; do NOT trust claims or logs
- Issue clear verdict: APPROVE or REQUEST_CHANGES

## Current Parent
- Conversation ID: 33d8d42c-8936-412f-bec0-5f5aca64e47b
- Updated: 2026-09-12T13:45:00Z

## Review Scope
- **Files to review**: `setup_nearest_driver.sql`, `apply_nearest_driver.js`, `PROJECT.md`
- **Interface contracts**: `PROJECT.md` Supabase PostGIS RPC Contract
- **Review criteria**: correctness, robustness, edge cases, coordinate synchronization, filter behavior

## Attack Surface
- **Hypotheses tested**: 
  1. Trigger `sync_driver_location` behavior when only `lat` updated, only `lng` updated, both updated, or `location` updated.
  2. Vehicle type filtering with NULL, '', 'motor', 'mobil', and NULL in database.
  3. `only_online` toggle with true vs false vs NULL.
  4. PostGIS KNN GiST indexability in `ORDER BY` clause.
- **Vulnerabilities found**:
  1. Updating only `location` on existing driver causes `NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL` to overwrite and revert `location` to old coordinates.
  2. Clearing coordinates (`lat = null, lng = null`) causes trigger to resurrect them from `OLD.location`.
  3. Drivers with `NULL` vehicle type are outputted as `'motor'` via COALESCE, but excluded by `target_vehicle_type = 'motor'`.
  4. `ORDER BY COALESCE(d.location, ...) <-> u_point` bypasses the `idx_drivers_location_gist` index scan, forcing a sequential table scan and memory sort.
- **Untested angles**: None.

## Key Decisions Made
- Built and ran `adversarial_test.js` simulating trigger mutations and SQL query semantics.
- Issued verdict: REQUEST_CHANGES.

## Artifact Index
- handoff.md — Final handoff report with verdict REQUEST_CHANGES
- adversarial_test.js — Adversarial test runner
