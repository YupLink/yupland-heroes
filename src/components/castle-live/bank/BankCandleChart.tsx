// График курса игрокам (владелец, 23.10.2026): линия по закрытиям свечей или свечи
// (зелёная — курс вырос за корзину, красная — упал, фитиль — макс/мин). Своим svg без
// библиотек, как у админа (BankRateChart). Палец/мышь — свеча и её время, курс
// открытия/макс/мин/закрытия; по умолчанию — последняя, она обновляется сама при
// опросе. Пунктир — курс на начало промежутка (от него изменение в заголовке).
import { useMemo, useState, type PointerEvent } from "react";
import { viewPrice } from "@/lib/bankStats";
import type { Candle, RateStep } from "@/lib/bankRate";
import { fmtRate } from "./bankStatsFmt";
import { fmtBucket } from "./bankRateFmt";

export type RateMode = "line" | "candles";

const W = 320;
const H = 150;
const PX = 4;
const PY = 8;
const UP = "#7fd18b";
const DOWN = "#ef8a7a";
const FLAT = "#a59c8c";

type Props = {
  candles: Candle[];
  mode: RateMode;
  step: RateStep;
  invert: boolean;
  /** «DARAI за 1 золото» — что откладывается по вертикали. */
  unit: string;
  ru: boolean;
};

/** Свеча в прочтении «за 1 базовый»: при перевороте курса макс и мин меняются местами. */
function view(c: Candle, invert: boolean): Candle {
  const h = viewPrice(c.h, invert);
  const l = viewPrice(c.l, invert);
  return { t: c.t, o: viewPrice(c.o, invert), h: Math.max(h, l), l: Math.min(h, l), c: viewPrice(c.c, invert) };
}

export function BankCandleChart({ candles, mode, step, invert, unit, ru }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const g = useMemo(() => {
    const cs = candles.map((c) => view(c, invert));
    const min = Math.min(...cs.map((c) => c.l));
    const max = Math.max(...cs.map((c) => c.h));
    let lo = min;
    let hi = max;
    if (hi - lo < hi * 1e-9) {
      lo *= 0.99;
      hi *= 1.01;
    }
    const pad = (hi - lo) * 0.08;
    lo -= pad;
    hi += pad;
    const slot = (W - 2 * PX) / Math.max(1, cs.length);
    const x = (i: number) => PX + slot * (i + 0.5);
    const y = (v: number) => H - PY - ((v - lo) / (hi - lo)) * (H - 2 * PY);
    const line = cs.map((c, i) => `${x(i).toFixed(1)},${y(c.c).toFixed(1)}`).join(" ");
    const area = cs.length ? `M${x(0).toFixed(1)},${H - PY} L${line.replace(/ /g, " L")} L${x(cs.length - 1).toFixed(1)},${H - PY} Z` : "";
    return { cs, min, max, slot, x, y, line, area, body: Math.max(1, Math.min(slot * 0.7, 14)) };
  }, [candles, invert]);

  if (g.cs.length === 0) return null;
  const i = hover !== null && hover < g.cs.length ? hover : g.cs.length - 1;
  const cur = g.cs[i];
  const hx = g.x(i);
  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.min(g.cs.length - 1, Math.max(0, Math.floor((px - PX) / g.slot))));
  };
  // Палец оторвался — свеча остаётся выбранной (иначе касание лишь мигнуло бы);
  // мышь ушла с графика — снова последняя.
  const leave = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse") setHover(null);
  };
  const start = g.cs[0].o;
  const ohlc: Array<[string, number]> = [
    [ru ? "Откр" : "O", cur.o],
    [ru ? "Макс" : "H", cur.h],
    [ru ? "Мин" : "L", cur.l],
    [ru ? "Закр" : "C", cur.c],
  ];

  return (
    <figure className="m-0">
      <figcaption className="mb-1 text-xs text-[#a59c8c]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span>{unit}</span>
          <span className="tabular-nums text-[#fff0c7]">
            {fmtBucket(cur.t, step, ru)}
            {mode === "line" && <> · <b>{fmtRate(cur.c, ru)}</b></>}
          </span>
        </div>
        {mode === "candles" && (
          <div className="mt-0.5 flex flex-wrap justify-end gap-x-2.5 tabular-nums">
            {ohlc.map(([k, v]) => (
              <span key={k}>
                {k} <b className={cur.c > cur.o ? "text-[#7fd18b]" : cur.c < cur.o ? "text-[#ef8a7a]" : "text-[#fff0c7]"}>{fmtRate(v, ru)}</b>
              </span>
            ))}
          </div>
        )}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full touch-pan-y select-none rounded-xl bg-[#0d1b2b]"
        role="img"
        aria-label={`${unit}: ${fmtRate(start, ru)} → ${fmtRate(g.cs[g.cs.length - 1].c, ru)}`}
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={leave}
      >
        <defs>
          <linearGradient id="bank-candle-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#edc36b" stopOpacity="0.28" />
            <stop offset="1" stopColor="#edc36b" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={PX} x2={W - PX} y1={g.y(start)} y2={g.y(start)} stroke="#a59c8c" strokeWidth="1" strokeDasharray="4 4" />
        <line x1={hx} x2={hx} y1={PY} y2={H - PY} stroke="#ffffff33" strokeWidth="1" />
        {mode === "line" ? (
          <>
            <path d={g.area} fill="url(#bank-candle-fill)" />
            <polyline points={g.line} fill="none" stroke="#edc36b" strokeWidth="1.8" strokeLinejoin="round" />
            <circle cx={hx} cy={g.y(cur.c)} r="3.5" fill="#fff0c7" stroke="#081321" strokeWidth="1.5" />
          </>
        ) : (
          g.cs.map((c, k) => {
            const color = c.c > c.o ? UP : c.c < c.o ? DOWN : FLAT;
            const top = g.y(Math.max(c.o, c.c));
            const bottom = g.y(Math.min(c.o, c.c));
            const cx = g.x(k);
            return (
              <g key={c.t}>
                <line x1={cx} x2={cx} y1={g.y(c.h)} y2={g.y(c.l)} stroke={color} strokeWidth="1" />
                <rect x={cx - g.body / 2} y={top} width={g.body} height={Math.max(1, bottom - top)} fill={color} />
              </g>
            );
          })
        )}
      </svg>
      <div className="mt-1 flex justify-between gap-2 text-[11px] text-[#a59c8c] tabular-nums">
        <span>{fmtBucket(g.cs[0].t, step, ru)}</span>
        <span>{fmtBucket(g.cs[g.cs.length - 1].t, step, ru)}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-[#a59c8c] tabular-nums">
        {ru ? "мин" : "min"} {fmtRate(g.min, ru)} · {ru ? "макс" : "max"} {fmtRate(g.max, ru)} · - - {ru ? "старт" : "start"}{" "}
        {fmtRate(start, ru)}
      </p>
    </figure>
  );
}
