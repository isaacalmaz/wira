## 2026-09-12T13:29:39Z

You are worker_backend_1, a Backend PostGIS Worker agent.
Your working directory is /Users/ishakalmaazi/.gemini/antigravity/scratch/wira/.agents/worker_backend_1.

First, read:
- Original Request: /Users/ishakalmaazi/.gemini/antigravity/scratch/wira/.agents/ORIGINAL_REQUEST.md
- Project Scope: /Users/ishakalmaazi/.gemini/antigravity/scratch/wira/PROJECT.md
- Explorer Backend Handoff: /Users/ishakalmaazi/.gemini/antigravity/scratch/wira/.agents/explorer_backend_1/handoff.md
- Explorer Backend Analysis: /Users/ishakalmaazi/.gemini/antigravity/scratch/wira/.agents/explorer_backend_1/analysis.md
- Explorer Test Handoff: /Users/ishakalmaazi/.gemini/antigravity/scratch/wira/.agents/explorer_test_1/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File Write Ownership:
You have exclusive write ownership of:
- `/Users/ishakalmaazi/.gemini/antigravity/scratch/wira/setup_nearest_driver.sql`
- You may also write helper/execution scripts or migrations in your own working directory or root (e.g. `/Users/ishakalmaazi/.gemini/antigravity/scratch/wira/apply_nearest_driver.js` if needed to apply/test the migration).

Task Objective (Milestone M2):
Implement Requirement R2: "Sistem Pencocokan Driver Terdekat (PostGIS Nearest Neighbor)":
1. Create `setup_nearest_driver.sql` in the workspace root with complete, production-grade PostGIS SQL:
   - Ensure PostGIS extension is active: `CREATE EXTENSION IF NOT EXISTS postgis;`
   - Add columns `lat DOUBLE PRECISION`, `lng DOUBLE PRECISION`, `location GEOGRAPHY(Point, 4326)`, `updated_at TIMESTAMPTZ DEFAULT NOW()` to `public.drivers`.
   - Create spatial GiST index `idx_drivers_location_gist` on `public.drivers USING GIST (location)`.
   - Create coordinate synchronization function and trigger `sync_driver_location` on `public.drivers` (maintaining strict Longitude=X, Latitude=Y order: `ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography`).
   - Create RPC function `get_nearest_drivers(user_lat DOUBLE PRECISION, user_lng DOUBLE PRECISION, target_vehicle_type TEXT DEFAULT NULL, only_online BOOLEAN DEFAULT true, max_results INT DEFAULT 10)`:
     - Calculates `distance_meters` using PostGIS `ST_Distance(...)` on WGS84 geography.
     - Orders by PostGIS KNN operator `<->` ascending.
     - Does NOT apply any arbitrary radius limit (no `ST_DWithin` cutoff) so drivers are matched regardless of distance.
     - Returns driver columns, user name/phone/avatar, vehicle info, and `distance_meters`.
     - Security definer, accessible to public and authenticated roles.
   - Create convenience alias `find_nearest_drivers(lat, lng, ...)` calling `get_nearest_drivers`.
   - Ensure RLS policies on `public.drivers` allow reads of online/active drivers.
2. Verify / Apply:
   - Check if the migration can be executed against Supabase using credentials in `backend/.env`.
   - If direct execution via Node/REST/Postgres is possible, apply and test invoking the RPC via Supabase JS client. If DDL execution over REST is blocked by Supabase Cloud permissions, document the execution mechanism clearly and verify the SQL syntax and structure exhaustively.
3. Deliverables:
   - Write your changes log to:
     `/Users/ishakalmaazi/.gemini/antigravity/scratch/wira/.agents/worker_backend_1/changes.md`
   - Write your comprehensive handoff report to:
     `/Users/ishakalmaazi/.gemini/antigravity/scratch/wira/.agents/worker_backend_1/handoff.md`

When done, send a message to parent summarizing your changes, SQL design, verification status, and linking to your handoff.md.
