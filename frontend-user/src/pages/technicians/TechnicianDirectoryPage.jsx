import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, MapPin, Users } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { useTranslation } from '../../i18n';
import { Card, EmptyState, Field, PageHeader, Segmented, Select, Spinner } from '../../components/ui';
import { Avatar, RatingLine, TrustBadges } from './shared';

const AREAS = ['Mataram', 'Lombok Barat', 'Senggigi', 'Lombok Utara', 'Gili', 'Lombok Tengah', 'Kuta Mandalika', 'Lombok Timur'];

/**
 * Every active Wira technician (migrations/0092 list_service_technicians):
 * filter by skill and area; verified and well-rated first. No phone numbers.
 */
export default function TechnicianDirectoryPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [skills, setSkills] = useState([]);
  const [skill, setSkill] = useState('');
  const [area, setArea] = useState('');
  const [techs, setTechs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('service_skills').select('code, name, skill_group').eq('is_active', true).order('sort_order')
      .then(({ data }) => setSkills(data || []));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase.rpc('list_service_technicians', { p_skill: skill || null, p_area: area || null })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error('list_service_technicians failed:', error);
        setTechs(data || []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [skill, area]);

  const skillName = (code) => skills.find((s) => s.code === code)?.name || code;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-16">
      <PageHeader
        back="/service"
        backLabel={t('common.back')}
        eyebrow="WiraService"
        title={t('partners.title')}
        subtitle={t('partners.subtitle')}
        className="mb-0"
      />

      <div className="flex flex-col gap-3">
        <Segmented
          scroll
          size="sm"
          ariaLabel={t('partners.filter_skill')}
          value={skill}
          onChange={setSkill}
          options={[{ value: '', label: t('partners.all_skills') }, ...skills.map((s) => ({ value: s.code, label: s.name }))]}
        />
        <Field label={t('partners.filter_area')} htmlFor="partner-area">
          <Select id="partner-area" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">{t('partners.all_areas')}</option>
            {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
        </Field>
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-brand-ink"><Spinner size={24} /></div>
      ) : techs.length === 0 ? (
        <EmptyState icon={<Users size={24} />} title={t('partners.empty_title')} description={t('partners.empty_desc')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {techs.map((tech) => (
            <li key={tech.id}>
              <Card
                as="button"
                type="button"
                onClick={() => navigate(`/technicians/${tech.id}`)}
                className="flex w-full items-start gap-3 text-left transition-colors hover:bg-sunken/40"
              >
                <Avatar tech={tech} />
                <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[15px] font-bold text-ink">{tech.name}</span>
                    <TrustBadges tech={tech} t={t} />
                  </span>
                  <span className="text-[12.5px] leading-snug text-ink-muted">
                    {tech.skills.slice(0, 3).map(skillName).join(', ')}
                    {tech.skills.length > 3 ? ` +${tech.skills.length - 3}` : ''}
                  </span>
                  {tech.service_areas?.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[12px] text-ink-muted">
                      <MapPin size={12} aria-hidden="true" /> {tech.service_areas.join(', ')}
                    </span>
                  )}
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <RatingLine tech={tech} t={t} />
                    {tech.jobs_completed > 0 && (
                      <span className="text-[12px] text-ink-muted">{t('service.jobs_done', { count: tech.jobs_completed })}</span>
                    )}
                  </span>
                </span>
                <ChevronRight size={18} className="mt-1 shrink-0 text-ink-muted" aria-hidden="true" />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
