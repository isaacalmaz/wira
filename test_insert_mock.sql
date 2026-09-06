INSERT INTO public.users (id, name, role, status) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Ahmad Supardi', 'driver', 'Aktif')
ON CONFLICT (id) DO NOTHING;
