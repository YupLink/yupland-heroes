// Линии поверх окна барабанов, как на автоматах: каждая линия идёт по своей
// «дорожке» внутри клетки (смещение по вертикали по номеру линии), поэтому
// линии через одни и те же клетки не сливаются. По краям — номер линии.
import { LINES } from "@/lib/slot/lines";
import type { LineWin } from "@/lib/slot/types";

export const LINE_COLORS = [
  "#f5b301",
  "#4fd6e0",
  "#ff5470",
  "#37d67a",
  "#a78bfa",
  "#ff8a3d",
  "#60a5fa",
  "#f472b6",
  "#ffffff",
];

const W = 500;
const H = 300;
const CELL_H = H / 3;
/** Дорожки внутри клетки: смещение от центра по номеру линии (доли высоты клетки). */
const TRACK = [0, -0.3, 0.3, -0.15, 0.15, -0.38, 0.38, -0.08, 0.08];
const cx = (reel: number) => ((reel + 0.5) / 5) * W;
const cy = (row: number, line: number) => (row + 0.5) * CELL_H + TRACK[line - 1] * CELL_H * 0.9;

function path(line: number): string {
  const rows = LINES[line - 1];
  const pts = rows.map((row, reel) => `${cx(reel)},${cy(row, line)}`);
  return `0,${cy(rows[0], line)} ${pts.join(" ")} ${W},${cy(rows[4], line)}`;
}

function Badge({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={9} fill={LINE_COLORS[n - 1]} />
      <text x={x} y={y + 3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#0c0d12">
        {n}
      </text>
    </g>
  );
}

export function SlotLinesOverlay({ lines, wins }: { lines: number[]; wins: LineWin[] }) {
  if (!lines.length && !wins.length) return null;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {lines.map((n) => (
        <g key={`l${n}`}>
          <polyline
            points={path(n)}
            fill="none"
            stroke="#000"
            strokeOpacity={0.5}
            strokeWidth={5}
            strokeLinejoin="round"
          />
          <polyline
            points={path(n)}
            fill="none"
            stroke={LINE_COLORS[n - 1]}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          <Badge x={12} y={cy(LINES[n - 1][0], n)} n={n} />
          <Badge x={W - 12} y={cy(LINES[n - 1][4], n)} n={n} />
        </g>
      ))}
      {wins.map((w) => {
        const pts = w.cells.map(([reel, row]) => `${cx(reel)},${cy(row, w.line)}`).join(" ");
        return (
          <g key={`w${w.line}`}>
            <polyline
              points={pts}
              fill="none"
              stroke="#000"
              strokeOpacity={0.5}
              strokeWidth={8}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <polyline
              points={pts}
              fill="none"
              stroke={LINE_COLORS[w.line - 1]}
              strokeWidth={4}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {w.cells.map(([reel, row]) => (
              <rect
                key={`${reel}:${row}`}
                x={(reel / 5) * W + 3}
                y={(row / 3) * H + 3}
                width={W / 5 - 6}
                height={H / 3 - 6}
                rx={10}
                fill="none"
                stroke={LINE_COLORS[w.line - 1]}
                strokeWidth={3}
              />
            ))}
            <Badge x={12} y={cy(LINES[w.line - 1][0], w.line)} n={w.line} />
          </g>
        );
      })}
    </svg>
  );
}
