import { useEffect, useState } from 'react';
import { supabase } from '../../config/supabase';

/**
 * Thumbnails of the customer's job photos (private bucket order-photos,
 * migrations/0123). Each path gets a short-lived signed URL; tapping a
 * thumbnail opens the full photo.
 */
export default function OrderPhotoThumbs({ paths, label }) {
  const [urls, setUrls] = useState([]);
  const key = (paths || []).join('|');

  useEffect(() => {
    let cancelled = false;
    const list = key ? key.split('|') : [];
    if (list.length === 0) { setUrls([]); return undefined; }
    supabase.storage.from('order-photos').createSignedUrls(list, 3600).then(({ data }) => {
      if (!cancelled) setUrls((data || []).map((d) => d.signedUrl).filter(Boolean));
    });
    return () => { cancelled = true; };
  }, [key]);

  if (urls.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((url, i) => (
        <a key={url} href={url} target="_blank" rel="noreferrer" className="block">
          <img
            src={url}
            alt={label ? `${label} ${i + 1}` : ''}
            className="h-16 w-16 rounded-control border border-line object-cover"
          />
        </a>
      ))}
    </div>
  );
}
