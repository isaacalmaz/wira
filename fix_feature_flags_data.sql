DELETE FROM public.feature_flags WHERE region = 'features_config';
ALTER PUBLICATION supabase_realtime ADD TABLE feature_flags;
