import { supabase } from '../config/supabase';

// users.avatar_url holds either a full URL (partner app) or a path inside
// the public "avatars" bucket (customer app, EditProfilePage).
export function avatarSrc(value) {
  if (!value) return null;
  if (/^https?:\/\//.test(value)) return value;
  return supabase.storage.from('avatars').getPublicUrl(value).data.publicUrl;
}
