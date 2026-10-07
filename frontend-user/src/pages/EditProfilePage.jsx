import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../config/supabase';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { User, Camera } from 'lucide-react';
import { Button, Card, Field, Input, PageHeader } from '../components/ui';
import { useTranslation } from '../i18n';
import { friendlyError } from '../utils/friendlyError';

export default function EditProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    phone: '',
    avatar_url: ''
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [preview, setPreview] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();
        
        if (error) throw error;
        setProfile({
          name: data.name || user.user_metadata?.name || '',
          email: data.email || user.email || '',
          phone: data.phone || user.user_metadata?.phone || '',
          avatar_url: data.avatar_url || ''
        });

        if (data.avatar_url) {
          const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(data.avatar_url);
          setPreview(publicData.publicUrl);
        }
      } catch (err) {
        console.error("Error fetching profile:", err);
      }
    };
    fetchProfile();
  }, [user]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAvatarFile(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      let finalAvatarPath = profile.avatar_url;

      // 1. Upload Avatar if changed
      if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop();
        const fileName = `${user.id}-${Math.random()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, avatarFile, { upsert: true });

        if (uploadError) throw uploadError;
        finalAvatarPath = filePath;
      }

      // 2. Update Users Table
      const { error: updateError, data: updatedRows } = await supabase
        .from('users')
        .update({
          name: profile.name,
          email: profile.email,
          avatar_url: finalAvatarPath
        })
        .eq('id', user.id)
        .select();

      if (updateError) throw updateError;
      if (!updatedRows || updatedRows.length === 0) throw new Error(t('edit_profile.denied'));

      toast.success(t('edit_profile.success'));
      navigate('/profile');
    } catch (err) {
      console.error('Error updating profile:', err);
      toast.error(friendlyError(err) === t('edit_profile.denied') ? friendlyError(err) : t('edit_profile.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-6">
      <PageHeader title={t('edit_profile.title')} back backLabel={t('common.back')} className="!mb-0" />

      <Card padding="lg">
        <form onSubmit={handleSave} className="flex flex-col gap-5">

          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-brand-line bg-brand-soft text-brand-ink">
                {preview ? (
                  <img src={preview} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <User size={44} aria-hidden="true" />
                )}
              </div>
              <label
                htmlFor="avatar-upload"
                title={t('edit_profile.avatar_hint')}
                className="absolute -bottom-1 -right-1 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-[3px] border-card bg-brand text-white transition-colors hover:bg-brand-hover focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-ink"
              >
                <Camera size={17} aria-hidden="true" />
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label={t('edit_profile.avatar_hint')}
                  onChange={handleFileChange}
                />
              </label>
            </div>
            <p className="max-w-xs text-center text-xs leading-relaxed text-ink-muted">{t('edit_profile.avatar_hint')}</p>
          </div>

          <Field label={t('edit_profile.name_label')} htmlFor="profile-name">
            <Input
              id="profile-name"
              type="text"
              autoComplete="name"
              value={profile.name}
              onChange={(e) => setProfile({...profile, name: e.target.value})}
              required
            />
          </Field>

          <Field label={t('edit_profile.email_label')} htmlFor="profile-email">
            <Input
              id="profile-email"
              type="email"
              autoComplete="email"
              value={profile.email}
              onChange={(e) => setProfile({...profile, email: e.target.value})}
            />
          </Field>

          <Field label={t('edit_profile.phone_label')} htmlFor="profile-phone" hint={t('edit_profile.phone_hint')}>
            <Input
              id="profile-phone"
              type="text"
              value={profile.phone}
              disabled
              className="cursor-not-allowed font-mono"
            />
          </Field>

          <Button type="submit" block size="lg" className="mt-1" isLoading={loading}>
            {loading ? t('common.saving') : t('edit_profile.submit')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
