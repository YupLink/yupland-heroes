// Земля из-под лопаты (владелец, 20.10.2026: «ощущение, что действительно копает»).
// Два удара лопатой в анимации Юпика (YupikSprite, «dig»: кадры ~0,46 с и ~1,06 с) —
// на каждом из кучки летят комья и поднимается пыль. Только вид, без звука.
import "./dig-dirt.css";

const CLODS = [
  { dx: -38, dy: 46, s: 1 },
  { dx: -18, dy: 62, s: 0.8 },
  { dx: 6, dy: 70, s: 1.1 },
  { dx: 26, dy: 54, s: 0.9 },
  { dx: 44, dy: 40, s: 0.7 },
];
const STRIKES = [440, 1040];

export function DigDirt() {
  return (
    <span className="dig-dirt" aria-hidden="true">
      {STRIKES.map((delay) => (
        <span key={delay}>
          <span className="dig-dust" style={{ animationDelay: `${delay}ms` }} />
          {CLODS.map((c, i) => (
            <span
              key={i}
              className="dig-clod"
              style={
                {
                  "--dx": `${(delay === 440 ? 1 : -1) * c.dx}%`,
                  "--dy": `${c.dy}%`,
                  "--s": c.s,
                  animationDelay: `${delay + i * 18}ms`,
                } as React.CSSProperties
              }
            />
          ))}
        </span>
      ))}
    </span>
  );
}
