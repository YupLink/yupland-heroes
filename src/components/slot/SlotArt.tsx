// Векторный арт бонуса: кучка, яма, мешочек, сундук, магический сундук, ловушка,
// медведь, фонарь. Плоский стиль с толстым контуром под пиксель-арт владельца.
type P = { className?: string };
const O = "#1a120a";

export function MoundIcon({ className, snow = true }: P & { snow?: boolean }) {
  return (
    <svg viewBox="0 0 64 48" className={className}>
      <path
        d="M6 42 Q14 14 32 10 Q50 14 58 42 Z"
        fill="#7a4a22"
        stroke={O}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M14 36 Q22 22 32 20 Q42 22 50 36 Z" fill="#9a6230" />
      {snow && (
        <path
          d="M20 18 Q32 8 44 18 Q40 14 32 14 Q24 14 20 18 Z"
          fill="#eaf4ff"
          stroke={O}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      )}
      <circle cx="26" cy="33" r="2" fill="#5a3416" />
      <circle cx="40" cy="30" r="2.5" fill="#5a3416" />
    </svg>
  );
}

export function HoleIcon({ className }: P) {
  return (
    <svg viewBox="0 0 64 48" className={className}>
      <ellipse cx="32" cy="30" rx="24" ry="12" fill="#2b1a0c" stroke={O} strokeWidth="3" />
      <ellipse cx="32" cy="28" rx="16" ry="7" fill="#120a04" />
      <path
        d="M8 30 Q4 22 12 20 M56 30 Q60 22 52 20"
        fill="none"
        stroke="#7a4a22"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PouchIcon({ className }: P) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <path
        d="M18 26 Q10 44 20 56 L44 56 Q54 44 46 26 Z"
        fill="#c08a4a"
        stroke={O}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M22 26 Q32 14 42 26 Q32 30 22 26 Z"
        fill="#8a5a2a"
        stroke={O}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M20 28 L44 28" stroke="#f5b301" strokeWidth="3" strokeLinecap="round" />
      <circle cx="26" cy="19" r="4" fill="#f5b301" stroke={O} strokeWidth="2" />
      <circle cx="36" cy="16" r="4" fill="#f5b301" stroke={O} strokeWidth="2" />
      <circle cx="32" cy="23" r="3" fill="#ffd54a" stroke={O} strokeWidth="2" />
    </svg>
  );
}

export function ChestIcon({ className, magic = false }: P & { magic?: boolean }) {
  const body = magic ? "#5b2a8a" : "#8a5a2a";
  const lid = magic ? "#7a3cb8" : "#a8703a";
  const band = magic ? "#4fd6e0" : "#f5b301";
  return (
    <svg viewBox="0 0 64 64" className={className}>
      {magic && <circle cx="32" cy="32" r="28" fill="#a78bfa" opacity="0.25" />}
      <rect x="10" y="30" width="44" height="24" rx="3" fill={body} stroke={O} strokeWidth="3" />
      <path
        d="M10 30 Q10 16 32 16 Q54 16 54 30 Z"
        fill={lid}
        stroke={O}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <rect x="10" y="28" width="44" height="6" fill="#ffd54a" stroke={O} strokeWidth="2" />
      <rect x="18" y="16" width="5" height="38" fill={band} stroke={O} strokeWidth="2" />
      <rect x="41" y="16" width="5" height="38" fill={band} stroke={O} strokeWidth="2" />
      <rect x="28" y="30" width="8" height="9" rx="2" fill={band} stroke={O} strokeWidth="2" />
      {magic && (
        <>
          <path d="M8 10 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2 z" fill="#4fd6e0" />
          <path d="M54 6 l1.5 3 3 1.5 -3 1.5 -1.5 3 -1.5 -3 -3 -1.5 3 -1.5 z" fill="#ffffff" />
        </>
      )}
    </svg>
  );
}

export function TrapIcon({ className }: P) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <ellipse cx="32" cy="48" rx="24" ry="8" fill="#2b1a0c" stroke={O} strokeWidth="3" />
      <path
        d="M12 44 Q12 20 32 20 Q52 20 52 44"
        fill="none"
        stroke="#9aa3ad"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <path
          key={i}
          d={`M${16 + i * 6.4} 42 l3 -9 l3 9 z`}
          fill="#dfe6ee"
          stroke={O}
          strokeWidth="1.5"
        />
      ))}
      <circle cx="32" cy="44" r="5" fill="#ff5470" stroke={O} strokeWidth="2" />
    </svg>
  );
}

export function BearIcon({ className }: P) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <circle cx="16" cy="18" r="9" fill="#5a3a22" stroke={O} strokeWidth="3" />
      <circle cx="48" cy="18" r="9" fill="#5a3a22" stroke={O} strokeWidth="3" />
      <circle cx="32" cy="34" r="22" fill="#6b4529" stroke={O} strokeWidth="3" />
      <ellipse cx="32" cy="42" rx="11" ry="8" fill="#c9a37a" stroke={O} strokeWidth="2" />
      <ellipse cx="32" cy="39" rx="5" ry="3.5" fill={O} />
      <path
        d="M24 46 Q32 52 40 46"
        fill="none"
        stroke={O}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="23" cy="30" r="3.5" fill="#ff5470" stroke={O} strokeWidth="2" />
      <circle cx="41" cy="30" r="3.5" fill="#ff5470" stroke={O} strokeWidth="2" />
      <path d="M18 24 L26 27 M46 24 L38 27" stroke={O} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function LanternIcon({ className }: P) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <path
        d="M20 8 L44 8 L48 16 L16 16 Z"
        fill="#9aa3ad"
        stroke={O}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <rect x="20" y="16" width="24" height="26" rx="3" fill="#ffd54a" stroke={O} strokeWidth="3" />
      <rect x="26" y="20" width="12" height="18" rx="2" fill="#fff4b0" />
      <path
        d="M18 42 L46 42 L42 52 L22 52 Z"
        fill="#9aa3ad"
        stroke={O}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M28 8 Q32 0 36 8" fill="none" stroke={O} strokeWidth="3" />
    </svg>
  );
}

export function EyesIcon({ className, red = false }: P & { red?: boolean }) {
  const c = red ? "#ff5470" : "#f5b301";
  return (
    <svg viewBox="0 0 64 24" className={className}>
      <ellipse cx="18" cy="12" rx="10" ry="6" fill={c} />
      <ellipse cx="46" cy="12" rx="10" ry="6" fill={c} />
      <ellipse cx="18" cy="12" rx="3" ry="5" fill="#120a04" />
      <ellipse cx="46" cy="12" rx="3" ry="5" fill="#120a04" />
    </svg>
  );
}
