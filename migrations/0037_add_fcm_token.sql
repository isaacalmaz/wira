-- Add fcm_token to users table for Push Notifications
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS fcm_token TEXT;
