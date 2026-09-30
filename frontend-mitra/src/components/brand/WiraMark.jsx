// Wira Mitra logo mark: the W is a wave, the dot is the sun at dusk.
// Same geometry and colours as the app icons; the source of truth for the
// shape is branding/generate-icons.mjs at the repo root.
const WAVE = 'M16 38 C26 38 28.5 70 36.5 70 C44 70 44.5 47 50 47 C55.5 47 56 70 63.5 70 C71.5 70 74 38 84 38';

export default function WiraMark({ size = 32, className = '', title }) {
  // Small marks get a heavier stroke so the wave does not thin out.
  const stroke = size <= 32 ? 12 : 10.5;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <rect width="100" height="100" rx="22" fill="#B7862A" />
      <path d={WAVE} fill="none" stroke="#062F3C" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="78" cy="20" r="7" fill="#F7F6F3" />
    </svg>
  );
}
