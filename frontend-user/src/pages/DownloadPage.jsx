import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, ShieldCheck, Smartphone, Store } from 'lucide-react';
import { supabase } from '../config/supabase';
import { useTranslation } from '../i18n';
import WiraMark from '../components/brand/WiraMark';
import { Card, Notice } from '../components/ui';

const APPS = [
  { app: 'user', name: 'Wira', icon: Smartphone, color: '#0B4F5E' },
  { app: 'mitra', name: 'Wira Mitra', icon: Store, color: '#B7862A' },
];

/**
 * Public download page for the Android apps (wira.one/unduh): the latest
 * APK of each app from app_releases (migrations/0105), with install steps.
 * Linked from the "Versi baru tersedia" prompt inside the apps.
 */
export default function DownloadPage() {
  const { t, lang } = useTranslation();
  const [releases, setReleases] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('app_releases').select('app, version_name, version_code, download_url, file_size, notes, created_at')
      .in('app', ['user', 'mitra']).order('version_code', { ascending: false })
      .then(({ data }) => {
        const latest = {};
        (data || []).forEach((r) => { if (!latest[r.app]) latest[r.app] = r; });
        setReleases(latest);
        setLoading(false);
      });
  }, []);

  const date = (ts) => new Date(ts).toLocaleDateString(lang === 'en' ? 'en-GB' : 'id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="min-h-[100dvh] bg-ground px-4 pb-16 pt-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <Link to="/" className="flex items-center gap-2.5 self-start" aria-label="Wira">
          <WiraMark size={32} />
          <span className="text-[18px] font-extrabold tracking-tight text-ink">wira</span>
        </Link>
        <div className="flex flex-col gap-2">
          <h1 className="text-balance text-[28px] font-extrabold leading-tight tracking-tight text-ink">{t('download.title')}</h1>
          <p className="text-[15px] leading-relaxed text-ink-muted">{t('download.subtitle')}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {APPS.map(({ app, name, icon: Icon, color }) => {
            const r = releases[app];
            return (
              <Card key={app} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-white" style={{ background: color }}><Icon size={22} /></span>
                  <div>
                    <p className="text-[16px] font-bold text-ink">{name}</p>
                    <p className="text-[13px] text-ink-muted">{t(`download.${app}_sub`)}</p>
                  </div>
                </div>
                {r ? (
                  <>
                    <p className="font-mono text-[12.5px] text-ink-muted">
                      {t('download.version', { v: r.version_name })} · {date(r.created_at)}
                      {r.file_size ? ` · ${(r.file_size / 1048576).toFixed(1)} MB` : ''}
                    </p>
                    {r.notes && <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink">{r.notes}</p>}
                    <a
                      href={r.download_url}
                      className="mt-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-5 text-[15px] font-bold text-white"
                      style={{ background: color }}
                    >
                      <Download size={18} /> {t('download.button')}
                    </a>
                  </>
                ) : (
                  <p className="text-[13px] text-ink-muted">{loading ? t('download.loading') : t('download.soon')}</p>
                )}
              </Card>
            );
          })}
        </div>

        
      </div>
    </div>
  );
}
