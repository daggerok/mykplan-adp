// The app's own mark instead of the "mykplan-adp" text (owner 2026-11-23): a 401(k) badge with a rising line. Our own
// drawing, not ADP's logo; the words are plain text in the app's font
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 40" width={size * 1.6} height={size} role="img" aria-label="ADP 401k" className="block">
      <defs>
        <linearGradient id="mykplan-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2563eb" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="38" rx="9" fill="url(#mykplan-logo-bg)" />
      <polyline points="7,31 17,24 25,27 35,16 43,19 56,8" fill="none" stroke="#ffffff" strokeOpacity=".35" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <text x="32" y="17" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif" fontSize="11" fontWeight="600" fill="#ffffff" fillOpacity=".9" letterSpacing="1.5">ADP</text>
      <text x="32" y="33" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif" fontSize="15" fontWeight="800" fill="#ffffff">401k</text>
    </svg>
  );
}
