import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarCheck, ChevronLeft, Languages, MapPin, Star, Wrench } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { useTranslation } from '../../i18n';
import { Badge, Button, Card, EmptyState, Notice, Sheet, Spinner } from '../../components/ui';
import { NEGATIVE_TAGS } from '../../utils/review';
import { Avatar, BOOKABLE, RatingLine, TrustBadges } from './shared';

const LANGUAGE_KEY = { id: 'partners.lang_id', sasak: 'partners.lang_sasak', en: 'partners.lang_en' };

const Stars = ({ value }) => (
  <span className="inline-flex gap-0.5" aria-hidden="true">
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} size={13} className={n <= value ? 'fill-pay text-pay' : 'fill-sunken text-line-strong'} />
    ))}
  </span>
);

/**
 * A technician's public profile (migrations/0092): trust signals first
 * (verified, rating, jobs), then what they do, where, portfolio and reviews,
 * with a booking button for the skills customers can book directly.
 */
export default function TechnicianProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [tech, setTech] = useState(null);
  const [loading, setLoading] = useState(true);
  const [skills, setSkills] = useState([]);
  const [portfolio, setPortfolio] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [photo, setPhoto] = useState(null);
  const [pickOpen, setPickOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.rpc('get_technician_profile', { p_user_id: id }),
      supabase.from('service_skills').select('code, name, skill_group').order('sort_order'),
      supabase.from('technician_portfolio').select('id, image_url, caption').eq('user_id', id).order('created_at'),
      supabase.rpc('get_partner_reviews', { p_partner_id: id, p_limit: 10 }),
    ]).then(([p, s, pf, r]) => {
      if (cancelled) return;
      setTech(p.data?.[0] || null);
      setSkills(s.data || []);
      setPortfolio(pf.data || []);
      setReviews(r.data || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <div className="flex h-[60vh] items-center justify-center text-brand-ink"><Spinner size={28} /></div>;
  if (!tech) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <EmptyState icon={<Wrench size={24} />} title={t('partners.not_found')} />
        <Button variant="secondary" onClick={() => navigate('/technicians')}>{t('partners.back_to_list')}</Button>
      </div>
    );
  }

  const skillName = (code) => skills.find((s) => s.code === code)?.name || code;
  const bookable = tech.skills.filter((c) => BOOKABLE[c]);
  const projectSkills = tech.skills.filter((c) => !BOOKABLE[c]);
  const since = new Date(tech.member_since).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  const book = (code) => {
    const path = BOOKABLE[code];
    navigate(path === '/pool' ? `/pool` : `${path}?tech=${tech.id}&cat=${code}`);
  };
  const onBook = () => (bookable.length === 1 ? book(bookable[0]) : setPickOpen(true));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label={t('common.back')}
        className="inline-flex h-11 w-11 items-center justify-center rounded-control border border-line bg-card text-ink transition-colors hover:bg-sunken"
      >
        <ChevronLeft size={20} />
      </button>

      <Card className="flex flex-col items-center gap-3 text-center">
        <Avatar tech={tech} size="lg" />
        <div className="flex flex-col items-center gap-1.5">
          <h1 className="text-balance text-[22px] font-extrabold leading-tight tracking-tight text-ink">{tech.name}</h1>
          <span className="flex flex-wrap justify-center gap-1.5"><TrustBadges tech={tech} t={t} /></span>
          <RatingLine tech={tech} t={t} />
        </div>
        <dl className="grid w-full grid-cols-3 divide-x divide-line border-t border-line pt-3 text-center">
          <div className="flex flex-col gap-0.5 px-1">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">{t('partners.stat_jobs')}</dt>
            <dd className="font-mono text-[16px] font-medium text-ink">{tech.jobs_completed}</dd>
          </div>
          <div className="flex flex-col gap-0.5 px-1">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">{t('partners.stat_experience')}</dt>
            <dd className="font-mono text-[16px] font-medium text-ink">{tech.experience_years ? t('service.experience_years', { count: tech.experience_years }) : '–'}</dd>
          </div>
          <div className="flex flex-col gap-0.5 px-1">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">{t('partners.stat_since')}</dt>
            <dd className="text-[13px] font-medium text-ink">{since}</dd>
          </div>
        </dl>
      </Card>

      {tech.bio && (
        <Card><p className="whitespace-pre-line text-[14px] leading-relaxed text-ink">{tech.bio}</p></Card>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="text-[14px] font-bold text-ink">{t('partners.skills')}</h2>
        <div className="flex flex-wrap gap-1.5">
          {bookable.map((c) => <Badge key={c} tone="brand">{skillName(c)}</Badge>)}
          {projectSkills.map((c) => <Badge key={c}>{skillName(c)}</Badge>)}
        </div>
        {tech.service_areas?.length > 0 && (
          <p className="flex items-start gap-2 text-[13px] text-ink">
            <MapPin size={15} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" /> {tech.service_areas.join(', ')}
          </p>
        )}
        {tech.languages?.length > 0 && (
          <p className="flex items-start gap-2 text-[13px] text-ink">
            <Languages size={15} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
            {tech.languages.map((l) => (LANGUAGE_KEY[l] ? t(LANGUAGE_KEY[l]) : l)).join(', ')}
          </p>
        )}
      </Card>

      {portfolio.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[14px] font-bold text-ink">{t('partners.portfolio')}</h2>
          <ul className="grid grid-cols-3 gap-2">
            {portfolio.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setPhoto(p)}
                  className="block aspect-square w-full overflow-hidden rounded-control border border-line bg-sunken"
                  aria-label={p.caption || t('partners.portfolio_photo')}
                >
                  <img src={p.image_url} alt={p.caption || ''} className="h-full w-full object-cover" loading="lazy" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[14px] font-bold text-ink">{t('partners.reviews')}</h2>
        {reviews.length === 0 ? (
          <Card><p className="text-[13px] text-ink-muted">{t('partners.no_reviews')}</p></Card>
        ) : (
          <Card padding="none">
            <ul className="divide-y divide-line">
              {reviews.map((r) => (
                <li key={r.id} className="flex flex-col gap-1.5 p-4">
                  <span className="flex flex-wrap items-center gap-2">
                    <Stars value={r.rating} />
                    <span className="text-[13px] font-semibold text-ink">{r.reviewer_name}</span>
                    <span className="text-[12px] text-ink-muted">
                      {new Date(r.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </span>
                  {r.tags?.length > 0 && (
                    <span className="flex flex-wrap gap-1.5">
                      {r.tags.map((tag) => <Badge key={tag} tone={NEGATIVE_TAGS.includes(tag) ? 'danger' : 'success'}>{t(`review.tag.${tag}`)}</Badge>)}
                    </span>
                  )}
                  {r.review_text && <p className="whitespace-pre-line break-words text-[13.5px] leading-relaxed text-ink">{r.review_text}</p>}
                  {r.partner_reply && (
                    <p className="rounded-control border border-line bg-sunken px-3 py-2 text-[12.5px] leading-relaxed text-ink">
                      <span className="font-semibold">{t('partners.reply_from', { name: tech.name.split(' ')[0] })}: </span>{r.partner_reply}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {/* Book */}
      {/* Sticks above the bottom nav inside the scrolling page. */}
      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 md:bottom-4">
        <div className="flex flex-col gap-2 rounded-card border border-line bg-card/95 p-3 shadow-[0_16px_40px_-16px_rgba(6,47,60,0.35)] backdrop-blur">
          {bookable.length > 0 ? (
            <Button size="lg" block leftIcon={<CalendarCheck size={18} />} onClick={onBook}>
              {t('partners.book', { name: tech.name.split(' ')[0] })}
            </Button>
          ) : (
            <Notice tone="info">{t('partners.project_soon')}</Notice>
          )}
        </div>
      </div>

      <Sheet open={pickOpen} onClose={() => setPickOpen(false)} title={t('partners.pick_service')} closeLabel={t('common.close')}>
        <div className="flex flex-col gap-2">
          {bookable.map((c) => (
            <Button key={c} variant="secondary" block onClick={() => book(c)}>{skillName(c)}</Button>
          ))}
        </div>
      </Sheet>

      <Sheet open={!!photo} onClose={() => setPhoto(null)} title={photo?.caption || t('partners.portfolio')} closeLabel={t('common.close')}>
        {photo && <img src={photo.image_url} alt={photo.caption || ''} className="w-full rounded-control object-contain" />}
      </Sheet>
    </div>
  );
}
