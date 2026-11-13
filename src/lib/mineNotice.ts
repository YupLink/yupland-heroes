// Уведомление «Добычи» о потере шахты или гриба (владелец 04.11.2026, §8.106):
// строка журнала raid_mine_capture_log, пока игрок не нажал «×»
// (acknowledged_at). Только для чтения; кто отнял — не бывает здесь вовсе.
import { lostKindOf, lostMushroomOf, type MineLostKind } from "@/lib/mineLost";
import type { MushroomKind } from "@/lib/mushroomKinds";

export type MineNotice = {
  id: string;
  kind: MineLostKind;
  mapId: string;
  /** Мир шахты (этаж или карта); пусто — без имени. */
  world: string | null;
  /** Шахта в том мире, где сейчас герой: булавка везёт камеру. */
  here: boolean;
  q: number;
  r: number;
  resource: string | null;
  mushroom?: MushroomKind;
  /** Сколько ещё ждёт сбора с этой строки (0 — собрано или не было). */
  amount: number;
  /** Когда случилось, мс. */
  at: number;
};

type Row = {
  id?: unknown;
  kind?: unknown;
  map_id?: unknown;
  world?: unknown;
  q?: unknown;
  r?: unknown;
  resource?: unknown;
  token?: unknown;
  amount?: unknown;
  at?: unknown;
};

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Строки базы → уведомления; here — карта, где стоит герой. Мусор отбрасываем. */
export function noticesOf(rows: unknown, here: string | null): MineNotice[] {
  const out: MineNotice[] = [];
  for (const x of (Array.isArray(rows) ? rows : []) as Row[]) {
    const id = str(x?.id);
    const mapId = str(x?.map_id);
    if (!id || !mapId) continue;
    const kind = lostKindOf(x.kind);
    const mushroom = lostMushroomOf(kind, x.resource, x.token);
    out.push({
      id,
      kind,
      mapId,
      world: str(x.world),
      here: mapId === here,
      q: Math.trunc(num(x.q)),
      r: Math.trunc(num(x.r)),
      resource: str(x.resource),
      ...(mushroom ? { mushroom } : {}),
      amount: Math.max(0, num(x.amount)),
      at: num(x.at),
    });
  }
  return out;
}
