import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cx } from './cx';

/**
 * <img> that never shows the browser's broken-image icon: a missing or
 * failed photo becomes a quiet tile with an icon, same size and corners.
 */
export default function SafeImg({ src, alt = '', className = '', icon: Icon = ImageOff, iconSize = 22, ...rest }) {
  const [failed, setFailed] = useState(!src);
  useEffect(() => { setFailed(!src); }, [src]);
  if (failed) {
    return (
      <div role={alt ? 'img' : undefined} aria-label={alt || undefined} className={cx(className, 'flex items-center justify-center bg-sunken text-ink-muted')}>
        <Icon size={iconSize} aria-hidden="true" />
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} {...rest} />;
}
