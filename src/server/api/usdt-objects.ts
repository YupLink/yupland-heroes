// Сколько USDT обещают объекты карты — для проверки ПЕРЕД записью (ПРАВИЛА §8.49а):
// кисть, правка клетки, сохранение редактора, оживление, восстановление, возрождение,
// правка шаблона босса. Награда читается тем же порядком, что у «Свободно USDT»
// и выдачи (token-fillers-sql): своя настройка → шаблон босса → снимок → шаблон предмета.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";
import { assertSpendableUsdt } from "./usdt-guard";
import {
  AMOUNT_SQL,
  FILLERS_SQL,
  TEMPLATE_JOINS_SQL,
  TOKEN_FILLER_SQL,
} from "./token-fillers-sql";

export type UsdtObject = { object_id: string | null; object_config?: unknown };

const USDT = sqlStr("USDT");

async function sumOf(sql: string): Promise<number> {
  const rows = (await mcpExec(sql, { wrapJson: true })) as Array<{ usdt: string }> | null;
  if (!rows?.[0]) throw new Error("Сумма USDT в наградах не прочиталась — запись отложена");
  const n = Number(rows[0].usdt);
  return Number.isFinite(n) ? n : 0;
}

/** USDT, которые пообещают эти объекты, если встанут живыми. */
export async function usdtOfObjects(objs: UsdtObject[]): Promise<number> {
  const rows = objs
    .filter((o) => o.object_id)
    .map((o) => ({ object_id: o.object_id, object_config: o.object_config ?? {} }));
  if (rows.length === 0) return 0;
  return sumOf(
    `SELECT COALESCE(sum(${AMOUNT_SQL}), 0)::text AS usdt
       FROM jsonb_to_recordset(${sqlStr(JSON.stringify(rows))}::jsonb)
            AS o(object_id text, object_config jsonb)${TEMPLATE_JOINS_SQL("o")},
            LATERAL jsonb_array_elements(${FILLERS_SQL("o")}) f
      WHERE ${TOKEN_FILLER_SQL(USDT)};`,
  );
}

/** USDT, которые уже обещают ЖИВЫЕ объекты на этих клетках карты (слой клеток). */
export async function usdtOnCells(
  mapId: string,
  cells: Array<{ q: number; r: number }>,
): Promise<number> {
  if (cells.length === 0) return 0;
  const coords = cells.map((c) => `(${Number(c.q)}, ${Number(c.r)})`).join(", ");
  return sumOf(
    `SELECT COALESCE(sum(${AMOUNT_SQL}), 0)::text AS usdt
       FROM yuplink.raid_map_cells c${TEMPLATE_JOINS_SQL("c")}
       LEFT JOIN yuplink.beta_raid_object_hp hp
              ON hp.map_id = c.map_id AND hp.q = c.q AND hp.r = c.r AND hp.cycle_no = 0,
            LATERAL jsonb_array_elements(${FILLERS_SQL("c")}) f
      WHERE c.map_id = ${sqlStr(mapId)} AND (c.q, c.r) IN (${coords})
        AND c.object_id IS NOT NULL AND hp.killed_at IS NULL
        AND ${TOKEN_FILLER_SQL(USDT)};`,
  );
}

/**
 * Пропустить запись, только если прирост обещанного USDT помещается в свободное с
 * запасом. Обещаний стало меньше или столько же — без похода в сеть.
 */
export async function assertUsdtGrowth(before: number, after: number, what: string): Promise<void> {
  const grow = after - before;
  if (grow > 1e-9) await assertSpendableUsdt(grow, what);
}

/** Частый случай: клетки карты переписываются объектами `next`. */
export async function assertUsdtCells(
  mapId: string,
  next: Array<UsdtObject & { q: number; r: number }>,
  what: string,
): Promise<void> {
  const after = await usdtOfObjects(next);
  const before = await usdtOnCells(mapId, next);
  await assertUsdtGrowth(before, after, what);
}
