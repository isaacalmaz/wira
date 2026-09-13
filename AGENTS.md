# Global Rules for Wira Project

## 1. Supabase `.update()` & `.delete()` RLS Trap
When performing `.update()` or `.delete()` operations via the Supabase JS client, Supabase will return a `null` error if the operation is blocked by Row-Level Security (RLS). It treats it as a successful operation that just affected 0 rows.
**Rule:** You MUST always chain `.select()` to these operations and manually verify the response array length (e.g., `if (!data || data.length === 0) throw new Error("Blocked by RLS")`).

## 2. PostgreSQL / PL/pgSQL Parameter Collisions
When writing Supabase RPC functions (`RETURNS TABLE`), input parameters share the same namespace as the returned columns. 
**Rule:** If you use identical names (e.g. `lat DOUBLE PRECISION` as input and `lat DOUBLE PRECISION` in output), Postgres will throw a fatal compilation error. Always prefix input parameters with `p_` or `user_` (e.g., `user_lat`).
