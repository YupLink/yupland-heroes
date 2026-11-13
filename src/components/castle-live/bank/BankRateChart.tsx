// График курса пула (админ): курс после каждого обмена по времени, своим svg без
// библиотек. Пунктир — стартовый курс. Палец/мышь над графиком — точка и её курс;
// по умолчанию показана последняя. Подписи — HTML над и под графиком, чтобы текст
// не растягивался вместе с картинкой.
import { useMemo, useState, type PointerEvent } from "react";
import { viewPrice, type RatePoint } from "@/lib/bankStats";
import { fmtRate, fmtWhen } from "./bankStatsFmt";

const W = 320;
const H = 140;
const PAD = 8;

type Props = {
  points: RatePoint[];
  invert: boolean;
  /** Стартовый курс (B за 1 A). */
  start: number;
  /** «DARAI за 1 золото» — что откладывается по вертикали. */
  unit: string;
  ru: boolean;
};

export function BankRateChart({ points, invert, start, unit, ru }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const g = useMemo(() => {
    const vs = points.map((p) => viewPrice(p.p, invert));
    const s = viewPrice(start, invert);
    let lo = Math.min(s, ...vs);
    let hi = Math.max(s, ...vs);
    if (hi - lo < hi * 1e-9) {
      lo *= 0.99;
      hi *= 1.01;
    }
    const pad = (hi - lo) * 0.08;
    lo -= pad;
    hi += pad;
    const t0 = points[0]?.t ?? 0;
    const t1 = points.at(-1)?.t ?? 0;
    const x = (t: number, i: number) =>
      t1 > t0 ? PAD + ((t - t0) / (t1 - t0)) * (W - 2 * PAD) : PAD + (i / Math.max(1, points.length - 1)) * (W - 2 * PAD);
    const y = (v: number) => H - PAD - ((v - lo) / (hi - lo)) * (H - 2 * PAD);
    const xy = points.map((p, i) => [x(p.t, i), y(vs[i])] as const);
    const line = xy.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ");
    const first = xy[0];
    const last = xy.at(-1);
    const area = first && last ? `M${first[0]},${H - PAD} L${line.replace(/ /g, " L")} L${last[0]},${H - PAD} Z` : "";
    return { vs, xy, line, area, startY: y(s), min: Math.min(...vs), max: Math.max(...vs) };
  }, [points, invert, start]);

  if (points.length < 2) {
    return <p className="auction-empty">{ru ? "Обменов ещё не было — графика нет" : "No swaps yet — no chart"}</p>;
  }
  const i = hover !== null && hover < points.length ? hover : points.length - 1;
  const [hx, hy] = g.xy[i];
  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    for (let k = 1; k < g.xy.length; k++) if (Math.abs(g.xy[k][0] - px) < Math.abs(g.xy[best][0] - px)) best = k;
    setHover(best);
  };

  return (
    <figure className="m-0">
      <figcaption className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-[#a59c8c]">
        <span>{unit}</span>
        <span className="tabular-nums text-[#fff0c7]">
          {fmtWhen(points[i].t, ru)} · <b>{fmtRate(g.vs[i], ru)}</b>
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full touch-none select-none rounded-xl bg-[#0d1b2b]"
        role="img"
        aria-label={`${unit}: ${fmtRate(g.vs[0], ru)} → ${fmtRate(g.vs.at(-1) ?? 0, ru)}`}
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="bank-rate-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#edc36b" stopOpacity="0.28" />
            <stop offset="1" stopColor="#edc36b" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={PAD} x2={W - PAD} y1={g.startY} y2={g.startY} stroke="#a59c8c" strokeWidth="1" strokeDasharray="4 4" />
        <path d={g.area} fill="url(#bank-rate-fill)" />
        <polyline points={g.line} fill="none" stroke="#edc36b" strokeWidth="1.8" strokeLinejoin="round" />
        <line x1={hx} x2={hx} y1={PAD} y2={H - PAD} stroke="#ffffff33" strokeWidth="1" />
        <circle cx={hx} cy={hy} r="3.5" fill="#fff0c7" stroke="#081321" strokeWidth="1.5" />
      </svg>
      <div className="mt-1 flex justify-between gap-2 text-[11px] text-[#a59c8c] tabular-nums">
        <span>{fmtWhen(points[0].t, ru)}</span>
        <span>{fmtWhen(points.at(-1)?.t ?? 0, ru)}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-[#a59c8c] tabular-nums">
        {ru ? "мин" : "min"} {fmtRate(g.min, ru)} · {ru ? "макс" : "max"} {fmtRate(g.max, ru)} · - - {ru ? "старт" : "start"}{" "}
        {fmtRate(viewPrice(start, invert), ru)}
      </p>
    </figure>
  );
}
