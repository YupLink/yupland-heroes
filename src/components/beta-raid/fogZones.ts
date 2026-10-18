// Зоны тумана номерами клеток — считает BetaRaidCanvas (useMemo), читает
// betaCanvasDraw. Уровни из CLAUDE.md «Fog of war»:
//   active — радиус 20 от героя, лёгкая плёнка;
//   bright — радиус 1 от СВОИХ шахт и полей, без плёнки вовсе; с 02.10 —
//   и от моих бугорков (владелец: «мои закопанные кучки подсвечивать первым
//   обзором, как шахты, на одну клетку в радиусе»).
//
// bright дают ТОЛЬКО mineFlags 'own' (mine-flags.ts: моя шахта и поля, где
// батрачит мой герой). Раньше сюда же клали ВСЕ поля из fieldSlots (17.09 —
// getFieldSlots отдаёт все лимитные поля карты, без фильтра по герою) и склады
// с моими вещами (e702ddfe): 23 чужих поля стояли без плёнки, а яркое кольцо
// вокруг склада накрывало соседей — владелец 21.09: «поля подсвечиваются даже
// те, которые я не захватывал». Бейджи «занято/всего» у полей и «единиц к
// сбору» у складов читаются и под плёнкой — им bright не нужен.
import { FOG_ACTIVE_RADIUS } from "@/lib/raid/fogRadius";
import { hexDisc } from "./hexGeometry";

export type FogZones = { active: Set<number>; bright: Set<number> };

// Радиус активной зоны — общий с сервером (мешочки видно ровно в ней).
export { FOG_ACTIVE_RADIUS };

export function buildFogZones(args: {
  /** Номер клетки по (q,r) или -1 вне карты — mapStore.index. */
  index: (q: number, r: number) => number;
  heroQ: number | null;
  heroR: number | null;
  mineFlags?: Record<string, "own" | "enemy" | "tree">;
  /** Мои бугорки «q,r» (что закопал я сам). */
  mounds?: readonly string[];
}): FogZones {
  const { index, heroQ, heroR, mineFlags, mounds } = args;
  const active = new Set<number>();
  const bright = new Set<number>();
  if (heroQ != null && heroR != null) {
    for (const c of hexDisc(heroQ, heroR, FOG_ACTIVE_RADIUS)) {
      const i = index(c.q, c.r);
      if (i >= 0) active.add(i);
    }
  }
  const lightAround = (key: string) => {
    const [q, r] = key.split(",").map(Number);
    if (isNaN(q) || isNaN(r)) return;
    for (const c of hexDisc(q, r, 1)) {
      const i = index(c.q, c.r);
      if (i >= 0) bright.add(i);
    }
  };
  if (mineFlags) {
    for (const key of Object.keys(mineFlags)) if (mineFlags[key] === "own") lightAround(key);
  }
  for (const key of mounds ?? []) lightAround(key);
  return { active, bright };
}
