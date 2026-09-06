#!/bin/bash
source /Users/ishakalmaazi/.gemini/antigravity/scratch/wira/frontend-user/.env

curl -s "$VITE_SUPABASE_URL/rest/v1/feature_flags?region=eq.features_config" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"
