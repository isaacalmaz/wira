import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Car, UtensilsCrossed, Package, Home, Wrench, Waves, Baby, KeyRound, ReceiptText, LifeBuoy } from 'lucide-react';
import { useTranslation } from '../i18n';
import DownloadSheet from '../components/landing/DownloadSheet';

// Front page for visitors who are not signed in (Layout shows it at "/" on
// the web; the Android app goes straight to /login). Texts live under
// `landing.*` in i18n; the ID/EN button switches the whole app's language.

const MITRA_URL = 'https://mitra.wira.one/gabung';

function Logo({ className = 'h-9 w-9' }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <rect width="100" height="100" rx="22" fill="#0B4F5E" stroke="#1C6676" strokeWidth="2" />
      <path d="M16 38 C26 38 28.5 70 36.5 70 C44 70 44.5 47 50 47 C55.5 47 56 70 63.5 70 C71.5 70 74 38 84 38" fill="none" stroke="#F7F6F3" strokeWidth="10.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="78" cy="20" r="7" fill="#D9A845" />
    </svg>
  );
}

const SERVICES = [
  { icon: Car, name: 'WiraRide', key: 'svc_ride' },
  { icon: UtensilsCrossed, name: 'WiraFood', key: 'svc_food' },
  { icon: Package, name: 'WiraSend', key: 'svc_send' },
  { icon: Home, name: 'WiraVilla', key: 'svc_villa' },
  { icon: Wrench, name: 'WiraService', key: 'svc_service' },
  { icon: Waves, name: 'WiraPool', key: 'svc_pool' },
  { icon: Baby, name: 'WiraAsuh', key: 'svc_asuh' },
];

const STEPS = ['step1', 'step2', 'step3'];

const TRUST = [
  { icon: KeyRound, key: 'trust_pin' },
  { icon: ReceiptText, key: 'trust_price' },
  { icon: LifeBuoy, key: 'trust_help' },
];

const PARTNERS = ['partner_driver', 'partner_resto', 'partner_villa', 'partner_tech', 'partner_nanny'];

const goldBtn = 'inline-flex min-h-12 items-center justify-center rounded-[14px] bg-emas-400 px-6 text-[15px] font-bold text-[#1E1A10] transition-[filter] hover:brightness-105 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-emas-400';
const ghostBtn = 'inline-flex min-h-10 items-center justify-center rounded-[12px] border border-white/35 px-4 text-[14px] font-bold text-[#F7F6F3] transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-emas-400';
const eyebrow = 'text-[12px] font-bold uppercase tracking-[0.12em] text-emas-600 dark:text-emas-400';

export default function LandingPage() {
  const { t: tr, lang, toggleLang } = useTranslation();
  const t = (k) => tr(`landing.${k}`);
  const [downloadOpen, setDownloadOpen] = useState(false);
  return (
    <div className="min-h-[100dvh] bg-ground text-ink">
      {/* Header + hero share the sea-dark ground */}
      <div className="bg-laut-900 text-[#F7F6F3]">
        <header className="mx-auto flex min-h-[68px] max-w-6xl items-center gap-5 px-5 pt-safe">
          <Link to="/" className="inline-flex items-center gap-2.5 text-[22px] font-extrabold tracking-[-0.03em]">
            <Logo />
            wira
          </Link>
          <nav aria-label="Halaman" className="ml-auto hidden gap-6 text-[14px] font-semibold md:flex">
            <a href="#layanan" className="opacity-80 hover:opacity-100">{t('nav_services')}</a>
            <a href="#cara" className="opacity-80 hover:opacity-100">{t('nav_how')}</a>
            <a href="#mitra" className="opacity-80 hover:opacity-100">{t('nav_partner')}</a>
          </nav>
          <button type="button" onClick={toggleLang} aria-label={t('switch_lang')} title={t('switch_lang')} className={`${ghostBtn} ml-auto w-12 px-0 md:ml-0`}>
            {lang === 'id' ? 'EN' : 'ID'}
          </button>
          <Link to="/login" className={ghostBtn}>{t('sign_in')}</Link>
        </header>

        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pt-10 md:grid-cols-[1.1fr_0.9fr] md:pt-12">
          <div className="flex flex-col gap-5 pb-2 md:pb-12">
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-emas-400">{t('hero_eyebrow')}</p>
            <h1 className="text-balance text-[38px] font-extrabold leading-[1.05] tracking-[-0.02em] sm:text-[52px] lg:text-[58px]">
              {t('hero_title_a')} <span className="text-emas-400">{t('hero_title_b')}</span> {t('hero_title_c')}
            </h1>
            <p className="max-w-[34em] text-[18px] leading-relaxed text-[#C9D8DB]">
              {t('hero_sub')}
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              <Link to="/login" className={goldBtn}>{t('cta_order')}</Link>
              <button type="button" onClick={() => setDownloadOpen(true)} className={`${ghostBtn} min-h-12 px-6 text-[15px]`}>{t('cta_download')}</button>
            </div>
          </div>

          {/* The app's home screen on a phone */}
          <div className="flex justify-center self-end" aria-hidden="true">
            <div className="w-[290px] max-w-full rounded-t-[40px] bg-[#0E1416] px-3 pt-3 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)]">
              <div className="overflow-hidden rounded-t-[30px] bg-[#F7F6F3] pb-5 text-[#142328]">
                <div className="flex items-center justify-between px-4 pb-1.5 pt-4 font-extrabold text-laut-700">
                  <span className="flex items-center gap-1.5"><Logo className="h-6 w-6" />wira</span>
                  <span className="text-[11px] font-semibold uppercase text-[#6B6862]">{lang}</span>
                </div>
                <div className="px-4 pb-3 pt-1">
                  <span className="block text-[11px] text-[#6B6862]">{t('phone_greet')}</span>
                  <b className="text-[18px] tracking-[-0.02em]">{t('phone_question')}</b>
                </div>
                <div className="mx-3.5 mb-3.5 overflow-hidden rounded-2xl bg-laut-700 text-[#F7F6F3]">
                  <div className="tenun-band h-1.5" />
                  <div className="px-3.5 py-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-laut-300">{t('phone_active')}</span>
                    <p className="mt-1 text-[13px] font-semibold">{t('phone_driver')}</p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-x-2 gap-y-2.5 px-3.5">
                  {SERVICES.map(({ icon: Icon, name }) => (
                    <div key={name} className="flex flex-col items-center gap-1 text-[10.5px] font-semibold">
                      <span className="grid aspect-[1.15] w-full place-items-center rounded-[13px] border border-laut-200 bg-laut-100 text-laut-700">
                        <Icon size={19} />
                      </span>
                      {name.replace('Wira', '')}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
        <div className="tenun-band h-2.5" />
      </div>

      <main>
        <section id="layanan" className="mx-auto max-w-6xl px-5 py-16 md:py-20">
          <div className="mb-8 flex max-w-2xl flex-col gap-2.5">
            <p className={eyebrow}>{t('services_eyebrow')}</p>
            <h2 className="text-balance text-[30px] font-extrabold leading-tight tracking-[-0.02em] md:text-[38px]">{t('services_title')}</h2>
            <p className="text-[17px] text-ink-muted">{t('services_sub')}</p>
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICES.map(({ icon: Icon, name, key }) => (
              <article key={name} className="flex min-w-0 flex-col gap-2.5 rounded-card border border-line bg-card p-5">
                <span className="grid h-11 w-11 place-items-center rounded-[13px] bg-brand-soft text-brand-ink"><Icon size={22} /></span>
                <h3 className="text-[18px] font-extrabold tracking-[-0.01em]">{name}</h3>
                <p className="text-[15px] leading-relaxed text-ink-muted">{t(key)}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="cara" className="border-y border-line bg-card">
          <div className="mx-auto max-w-6xl px-5 py-16 md:py-20">
            <div className="mb-8 flex max-w-2xl flex-col gap-2.5">
              <p className={eyebrow}>{t('how_eyebrow')}</p>
              <h2 className="text-balance text-[30px] font-extrabold leading-tight tracking-[-0.02em] md:text-[38px]">{t('how_title')}</h2>
            </div>
            <ol className="grid gap-7 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s} className="flex min-w-0 flex-col gap-2.5">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-laut-700 font-mono text-[15px] text-[#F7F6F3]">{i + 1}</span>
                  <h3 className="text-[19px] font-extrabold">{t(`${s}_title`)}</h3>
                  <p className="leading-relaxed text-ink-muted">{t(`${s}_desc`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 md:py-20">
          <div className="mb-8 flex max-w-2xl flex-col gap-2.5">
            <p className={eyebrow}>{t('trust_eyebrow')}</p>
            <h2 className="text-balance text-[30px] font-extrabold leading-tight tracking-[-0.02em] md:text-[38px]">{t('trust_title')}</h2>
          </div>
          <div className="grid gap-3.5 md:grid-cols-3">
            {TRUST.map(({ icon: Icon, key }) => (
              <div key={key} className="flex min-w-0 flex-col gap-2 rounded-card border border-line bg-card p-5">
                <Icon size={22} className="text-emas-600 dark:text-emas-400" aria-hidden="true" />
                <h3 className="text-[17px] font-extrabold">{t(`${key}_title`)}</h3>
                <p className="text-[15px] leading-relaxed text-ink-muted">{t(`${key}_desc`)}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="mitra" className="mx-auto max-w-6xl px-5 pb-16 md:pb-20">
          <div className="overflow-hidden rounded-[22px] bg-laut-700 text-[#F7F6F3]">
            <div className="tenun-band h-2.5" />
            <div className="grid items-center gap-7 p-7 md:grid-cols-[1.2fr_0.8fr] md:p-9">
              <div className="min-w-0">
                <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-emas-400">Wira Mitra</p>
                <h2 className="mt-2.5 text-balance text-[26px] font-extrabold leading-tight tracking-[-0.02em] md:text-[34px]">{t('partner_title')}</h2>
                <p className="mt-3 text-[#C9D8DB]">{t('partner_sub')}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {PARTNERS.map((p) => (
                    <span key={p} className="rounded-full border border-white/25 px-3 py-1.5 text-[13px] font-semibold">{t(p)}</span>
                  ))}
                </div>
              </div>
              <a href={MITRA_URL} className={goldBtn}>{t('partner_cta')}</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line pb-safe">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-x-12 gap-y-6 px-5 py-10 text-[14px] text-ink-muted">
          <div className="flex max-w-xs flex-col gap-1.5">
            <strong className="text-[18px] tracking-[-0.02em] text-ink">wira</strong>
            <span>{t('footer_tagline')}</span>
            <span className="font-mono">halo@wira.one</span>
          </div>
          <nav aria-label="Informasi" className="flex flex-wrap gap-x-5 gap-y-2.5">
            <a href="/panduan" className="hover:text-ink hover:underline">{t('footer_guide')}</a>
            <Link to="/privacy" className="hover:text-ink hover:underline">{t('footer_privacy')}</Link>
            <Link to="/terms" className="hover:text-ink hover:underline">{t('footer_terms')}</Link>
            <Link to="/refund" className="hover:text-ink hover:underline">{t('footer_refund')}</Link>
            <Link to="/hapus-akun" className="hover:text-ink hover:underline">{t('footer_delete')}</Link>
          </nav>
        </div>
      </footer>

      <DownloadSheet open={downloadOpen} onClose={() => setDownloadOpen(false)} />
    </div>
  );
}
