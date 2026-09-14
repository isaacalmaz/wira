-- =============================================================================
-- Migration 0009: Create messages table + RLS + realtime
-- Source: create_messages_table.sql (repo root)
-- Original creation date (git history, first commit): 2026-09-11
--   (file mtime is 2026-09-08 20:44, the same moment as master_schema.sql's
--   last edit — git only recorded a commit for this path on 2026-09-11,
--   evidence that this repo's git history is a batched/delayed import and
--   not a reliable ordering signal; file mtimes were used instead. See
--   migrations/README.md.)
-- =============================================================================
-- WARNING — DUPLICATE: this is byte-for-byte the same "TABEL CHAT (MESSAGES)"
-- block already embedded at the tail of 0001 (master_schema.sql). Replaying
-- it after 0001 on a fresh database WILL ERROR on the final statement:
--   ALTER PUBLICATION supabase_realtime ADD TABLE messages;
-- because Postgres does not support "ADD TABLE IF NOT EXISTS" for
-- ALTER PUBLICATION and the table is already a publication member from 0001.
-- Kept here for historical fidelity only — SKIP this file when replaying
-- migrations 0001-0015 against a genuinely fresh database.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages DISABLE ROW LEVEL SECURITY;

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
