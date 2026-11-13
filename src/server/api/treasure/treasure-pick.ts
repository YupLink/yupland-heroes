// Где закопать клад (lib/treasure): случайный мир, в нём случайная клетка, до
// которой «доступ обязательно должен быть» (владелец 07.11.2026).
//
// Доступ = клетка стоит в самом большом связном куске проходимой суши мира или
// касается его (декор на клетке рубят с соседней, копают — с неё же). Мелкие
// острова, замурованные углы и клетки за водой куском не считаются.
import { mcpExec } from "@/server/db/mcpClient";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { busyCellsSql, mapFlagsSql, worldsSql } from "./treasure-pick-sql";

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

const keyOf = (q: number, r: number) => `${q},${r}`;

const split = (s: unknown): string[] => (typeof s === "string" && s ? s.split(";") : []);

/** Самый большой связный кусок набора клеток. */
export function mainComponent(walk: ReadonlySet<string>): Set<string> {
  const seen = new Set<string>();
  let best = new Set<string>();
  for (const start of walk) {
    if (seen.has(start)) continue;
    const part = new Set<string>([start]);
    seen.add(start);
    const stack = [start];
    while (stack.length > 0) {
      const [q, r] = stack.pop()!.split(",").map(Number);
      for (const [dq, dr] of DIRS) {
        const k = keyOf(q + dq, r + dr);
        if (seen.has(k) || !walk.has(k)) continue;
        seen.add(k);
        part.add(k);
        stack.push(k);
      }
    }
    if (part.size > best.size) best = part;
  }
  return best;
}

/** Клетки-кандидаты с доступом: сама в куске или касается его. */
export function reachableCandidates(
  walk: ReadonlySet<string>,
  cand: readonly string[],
  busy: ReadonlySet<string>,
): Array<{ q: number; r: number }> {
  const main = mainComponent(walk);
  const out: Array<{ q: number; r: number }> = [];
  for (const raw of cand) {
    const [qs, rs] = raw.split(",");
    const q = Number(qs);
    const r = Number(rs);
    const k = keyOf(q, r);
    if (busy.has(k) || !Number.isFinite(q) || !Number.isFinite(r)) continue;
    if (main.has(k) || DIRS.some(([dq, dr]) => main.has(keyOf(q + dq, r + dr)))) out.push({ q, r });
  }
  return out;
}

export type TreasureSpot = { mapId: string; world: string; q: number; r: number };

type Rnd = () => number;

async function oneRow(sql: string): Promise<Record<string, unknown> | null> {
  const rows = (await mcpExec(sql, { wrapJson: true })) as Array<Record<string, unknown>> | null;
  return rows?.[0] ?? null;
}

/** Клетка в этом мире или null (некуда). */
export async function pickInWorld(
  mapId: string,
  rnd: Rnd,
): Promise<{ q: number; r: number } | null> {
  const [flags, busy] = await Promise.all([
    oneRow(mapFlagsSql(mapId)),
    oneRow(busyCellsSql(mapId)),
  ]);
  const walk = new Set(split(flags?.walk));
  const spots = reachableCandidates(walk, split(flags?.cand), new Set(split(busy?.busy)));
  if (spots.length === 0) return null;
  return spots[Math.floor(rnd() * spots.length)];
}

/** Случайный мир (все — поровну), в нём случайная клетка; не вышло — следующий мир. */
export async function pickTreasureSpot(rnd: Rnd = Math.random): Promise<TreasureSpot | null> {
  const rows = ((await mcpExec(worldsSql, { wrapJson: true })) ?? []) as Array<{
    id: string;
    name: string;
  }>;
  const worlds = rows.filter((w) => !isIslandMapId(w.id));
  // Перемешать (Фишер — Йетс): первый мир — случайный, остальные — запас.
  for (let i = worlds.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [worlds[i], worlds[j]] = [worlds[j], worlds[i]];
  }
  for (const w of worlds) {
    const at = await pickInWorld(w.id, rnd);
    if (at) return { mapId: w.id, world: String(w.name), ...at };
  }
  return null;
}
