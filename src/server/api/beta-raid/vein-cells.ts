// Жилы золота и алмазов карты — для снимка (migrations/minev2-30-veins.sql).
//
// Жила — накладка в гексе поверх местности: на ходьбу и цену шага не влияет,
// поэтому её никто, кроме снимка, не читает. В снимок она уезжает списком
// lists.veins (packCells): номер клетки, код вида, номер поворота.
//
// Ошибку чтения НЕ глотаем (как mine-cells): пустой список ушёл бы в снимок на
// всю версию карты и осел бы в IndexedDB у всех. Таблицы ещё нет (код выкачен
// раньше миграции) — null: снимок уйдёт без списка, клиент такой в кэш
// устройства не кладёт (mapBlob.isCurrentBuild) и перекачает позже.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";

export type VeinKind = "gold" | "diamonds";

/** Код вида в снимке: 1 — золото, 2 — алмазы. */
export const VEIN_CODE: Record<VeinKind, number> = { gold: 1, diamonds: 2 };

/** Поворот картинки — шаг 60°: в снимок едет номер 0..5. */
export const VEIN_ROT_STEP = 60;

/** Клетка (veinKey) → [код вида, номер поворота]. */
export type VeinCells = Map<number, [number, number]>;

/** Ключ клетки числом: снимок спрашивает все 100+ тыс. клеток — без строк. */
export const veinKey = (q: number, r: number): number => (q + 32768) * 65536 + (r + 32768);

let tableSeen = false;

async function tableReady(): Promise<boolean> {
  if (tableSeen) return true;
  const rows = (await mcpExec(`SELECT to_regclass('yuplink.raid_map_vein') AS t;`, {
    wrapJson: true,
  })) as Array<{ t: string | null }> | null;
  tableSeen = !!rows?.[0]?.t;
  return tableSeen;
}

/** Разобрать строки таблицы; незнакомый вид или поворот — пропуск. */
export function veinCellsFrom(
  rows: Array<{ q: unknown; r: unknown; kind: unknown; rot: unknown }>,
): VeinCells {
  const out: VeinCells = new Map();
  for (const row of rows) {
    const code = row.kind === "gold" || row.kind === "diamonds" ? VEIN_CODE[row.kind] : 0;
    const rot = row.rot == null || row.rot === "" ? NaN : Number(row.rot);
    if (!code || !Number.isInteger(rot) || rot % VEIN_ROT_STEP !== 0) continue;
    const step = (((rot / VEIN_ROT_STEP) % 6) + 6) % 6;
    out.set(veinKey(Number(row.q), Number(row.r)), [code, step]);
  }
  return out;
}

/**
 * Жила клетки для packCells. Под куполом у игрока клетка пустая — и жила тоже
 * не уезжает (hidden — ключи спрятанных клеток из voidSanitize). Таблицы нет —
 * undefined: снимок без списка.
 */
export function veinLookup(
  veins: VeinCells | null,
  hidden: ReadonlySet<string>,
): ((q: number, r: number) => readonly [number, number] | undefined) | undefined {
  if (!veins) return undefined;
  return (q, r) => {
    const v = veins.get(veinKey(q, r));
    return v && !hidden.has(`${q},${r}`) ? v : undefined;
  };
}

/** Жилы карты; null — таблицы в базе ещё нет. */
export async function loadVeinCells(mapId: string): Promise<VeinCells | null> {
  if (!(await tableReady())) return null;
  const rows = (await mcpExec(
    `SELECT v.q, v.r, v.kind, v.rot FROM yuplink.raid_map_vein v
      WHERE v.map_id = ${sqlStr(mapId)};`,
    { wrapJson: true },
  )) as Array<{ q: number; r: number; kind: string; rot: number }> | null;
  return veinCellsFrom(rows ?? []);
}
