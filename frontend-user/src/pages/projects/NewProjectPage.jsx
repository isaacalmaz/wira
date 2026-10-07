import { useEffect, useId, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ImagePlus, Send, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import { Button, Card, Field, Input, Notice, PageHeader, Select, Textarea } from '../../components/ui';
import AddressMapPicker from '../../components/common/AddressMapPicker';
import { uploadImageToBucket } from '../../utils/imageUpload';
import { witaToday, witaDatePlus } from '../../utils/visitSchedule';
import { PROJECT_AREAS } from './projectShared';
import { friendlyError } from '../../utils/friendlyError';

const MAX_PHOTOS = 6;

/**
 * Post a project for quotes (migrations/0093 create_project). Verified
 * technicians with the skill are notified and can quote for 7 days.
 */
export default function NewProjectPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [skills, setSkills] = useState([]);
  const [form, setForm] = useState({
    skill: params.get('skill') || '', title: '', description: '', area: '', startDate: '', budgetMin: '', budgetMax: '',
  });
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [saving, setSaving] = useState(false);
  const fileId = useId();

  useEffect(() => {
    supabase.from('service_skills').select('code, name, skill_group').eq('is_active', true).order('sort_order')
      .then(({ data }) => setSkills(data || []));
  }, []);

  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const addPhotos = (e) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/') && f.size <= 10 * 1024 * 1024);
    e.target.value = '';
    setPhotos((cur) => [...cur, ...files].slice(0, MAX_PHOTOS));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.skill || !form.area) { toast.error(t('projects.need_skill_area')); return; }
    if (!address.trim()) { toast.error(t('common.address_required')); return; }
    setSaving(true);
    try {
      const urls = await Promise.all(photos.map((f) => uploadImageToBucket(supabase, 'project-photos', user.id, f)));
      const { data, error } = await supabase.rpc('create_project', {
        p_skill: form.skill,
        p_title: form.title,
        p_description: form.description,
        p_area: form.area,
        p_address: address,
        p_lat: coords?.lat ?? null,
        p_lng: coords?.lng ?? null,
        p_preferred_start: form.startDate || null,
        p_budget_min: form.budgetMin ? Number(form.budgetMin) : null,
        p_budget_max: form.budgetMax ? Number(form.budgetMax) : null,
        p_photos: urls,
      });
      if (error) throw error;
      toast.success(t('projects.created'));
      navigate(`/projects/${data}`, { replace: true });
    } catch (err) {
      toast.error(friendlyError(err) || t('projects.create_failed'));
    } finally {
      setSaving(false);
    }
  };

  const groups = [
    { key: 'proyek', label: t('projects.group_project') },
    { key: 'servis', label: t('projects.group_service') },
  ];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-16">
      <PageHeader back="/projects" backLabel={t('common.back')} eyebrow="WiraService" title={t('projects.new_title')} subtitle={t('projects.new_subtitle')} className="mb-0" />

      <form onSubmit={submit} className="flex flex-col gap-5">
        <Card className="flex flex-col gap-4">
          <Field label={t('projects.field_skill')} htmlFor="project-skill" required>
            <Select id="project-skill" value={form.skill} onChange={set('skill')} required>
              <option value="">{t('projects.pick')}</option>
              {groups.map((g) => (
                <optgroup key={g.key} label={g.label}>
                  {skills.filter((s) => s.skill_group === g.key).map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                </optgroup>
              ))}
            </Select>
          </Field>
          <Field label={t('projects.field_title')} htmlFor="project-title" required hint={t('projects.title_hint')}>
            <Input id="project-title" value={form.title} onChange={set('title')} minLength={5} maxLength={120} required />
          </Field>
          <Field label={t('projects.field_desc')} htmlFor="project-desc" required hint={t('projects.desc_hint')}>
            <Textarea id="project-desc" rows={5} value={form.description} onChange={set('description')} minLength={20} maxLength={3000} required />
          </Field>

          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-ink">{t('projects.field_photos')}</span>
            <div className="flex flex-wrap gap-2">
              {previews.map((src, i) => (
                <div key={src} className="relative h-20 w-20 overflow-hidden rounded-control border border-line">
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotos((cur) => cur.filter((_, j) => j !== i))}
                    aria-label={t('review.photo_remove', { n: i + 1 })}
                    className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-ink/70 text-white"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <label htmlFor={fileId} className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-control border border-dashed border-line-strong text-ink-muted hover:border-brand hover:text-brand-ink">
                  <ImagePlus size={20} aria-hidden="true" />
                  <span className="text-[11px] font-semibold">{t('review.photo_add')}</span>
                </label>
              )}
              <input id={fileId} type="file" accept="image/*" multiple className="sr-only" onChange={addPhotos} />
            </div>
          </div>
        </Card>

        <Card className="flex flex-col gap-4">
          <Field label={t('projects.field_area')} htmlFor="project-area" required>
            <Select id="project-area" value={form.area} onChange={set('area')} required>
              <option value="">{t('projects.pick')}</option>
              {PROJECT_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          </Field>
          <AddressMapPicker
            id="project-address"
            label={t('projects.field_address')}
            placeholder={t('service.address_placeholder')}
            address={address}
            onAddressChange={setAddress}
            coords={coords}
            onCoordsChange={setCoords}
            markerType="dropoff"
            pinLabel={t('projects.field_address')}
          />
          <Notice tone="info">{t('projects.address_private')}</Notice>
          <Field label={t('projects.field_start')} htmlFor="project-start" hint={t('projects.optional')}>
            <Input id="project-start" type="date" min={witaToday()} max={witaDatePlus(180)} value={form.startDate} onChange={set('startDate')} className="font-mono" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('projects.field_budget_min')} htmlFor="project-bmin" hint={t('projects.optional')}>
              <Input id="project-bmin" type="number" inputMode="numeric" min={0} step={50000} value={form.budgetMin} onChange={set('budgetMin')} className="font-mono" />
            </Field>
            <Field label={t('projects.field_budget_max')} htmlFor="project-bmax" hint={t('projects.optional')}>
              <Input id="project-bmax" type="number" inputMode="numeric" min={0} step={50000} value={form.budgetMax} onChange={set('budgetMax')} className="font-mono" />
            </Field>
          </div>
        </Card>

        <Card className="flex flex-col gap-2 bg-sunken">
          <p className="text-[13px] font-semibold text-ink">{t('projects.how_title')}</p>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-[12.5px] leading-relaxed text-ink-muted">
            <li>{t('projects.how_1')}</li>
            <li>{t('projects.how_2')}</li>
            <li>{t('projects.how_3')}</li>
          </ol>
        </Card>

        <Button type="submit" size="lg" leftIcon={<Send size={17} />} isLoading={saving}>{t('projects.submit')}</Button>
      </form>
    </div>
  );
}
