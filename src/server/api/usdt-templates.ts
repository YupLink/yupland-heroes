// Правка награды шаблона (босса или предмета) против «Свободно USDT» (ПРАВИЛА §8.49а):
// новая награда тут же становится обещанием каждого живого объекта, который берёт её
// из шаблона. Прирост USDT × столько объектов — только из свободного с запасом.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";
import { assertSpendableUsdt } from "./usdt-guard";

/** USDT в списке наполнителей (как AMOUNT_SQL: число или строка-число). */
export function usdtInFillers(fillers: unknown): number {
  if (!Array.isArray(fillers)) return 0;
  let sum = 0;
  for (const f of fillers as Array<Record<string, unknown>>) {
    if (f?.kind !== "token" || String(f.token ?? "").toLowerCase() !== "usdt") continue;
    const n = typeof f.amount === "number" ? f.amount : Number(String(f.amount ?? ""));
    if (Number.isFinite(n) && n > 0) sum += n;
  }
  return sum;
}

const OWN = (o: string) => `jsonb_typeof(${o}.object_config->'rewardConfig'->'fillers') = 'array'`;
const SNAP = (o: string) =>
  `jsonb_typeof(${o}.object_config->'tpl'->'rewardConfig'->'fillers') = 'array'`;

/** Живые объекты обоих слоёв, чья награда берётся из этого шаблона. */
function usersSql(kind: "boss" | "item", id: string): string {
  const one = (table: string, o: string, layer: number) => {
    const match =
      kind === "boss"
        ? `${o}.object_id = ${sqlStr(`boss:${id}`)} AND NOT (${OWN(o)})`
        : `(${o}.object_id = ${sqlStr(id)} OR split_part(${o}.object_id, ':', 2) = ${sqlStr(id)})
           AND ${o}.object_id NOT LIKE 'boss:%' AND NOT (${OWN(o)}) AND NOT (${SNAP(o)})`;
    return `SELECT count(*) AS n FROM ${table} ${o}
       LEFT JOIN yuplink.beta_raid_object_hp hp
              ON hp.map_id = ${o}.map_id AND hp.q = ${o}.q AND hp.r = ${o}.r AND hp.cycle_no = ${layer}
      WHERE ${match} AND hp.killed_at IS NULL`;
  };
  return `SELECT (SELECT n FROM (${one("yuplink.raid_map_cells", "c", 0)}) a)
               + (SELECT n FROM (${one("yuplink.beta_raid_runner", "rn", 1)}) b) AS n;`;
}

/**
 * Отказ, если новая награда шаблона поднимет обещанный USDT сверх свободного.
 * `before` / `after` — наполнители шаблона до и после правки.
 */
export async function assertTemplateUsdt(
  kind: "boss" | "item",
  id: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  const grow = usdtInFillers(after) - usdtInFillers(before);
  if (grow <= 1e-9) return;
  const rows = (await mcpExec(usersSql(kind, id), { wrapJson: true })) as Array<{ n: number }> | null;
  if (!rows?.[0]) throw new Error("Объекты шаблона не сосчитались — правка отложена");
  const n = Number(rows[0].n) || 0;
  if (n > 0) await assertSpendableUsdt(grow * n, `USDT в шаблоне (${n} живых)`);
}

const metaFillers = (m: unknown) =>
  (m as { rewardConfig?: { fillers?: unknown } } | null)?.rewardConfig?.fillers;

/** Шаблон предмета: meta целиком (как шлёт конструктор). */
export async function assertItemMetaUsdt(id: string, meta: unknown): Promise<void> {
  if (usdtInFillers(metaFillers(meta)) <= 0) return;
  const rows = (await mcpExec(
    `SELECT meta FROM yuplink.mystic_item_template WHERE id = ${sqlStr(id)};`,
    { wrapJson: true },
  )) as Array<{ meta: unknown }> | null;
  await assertTemplateUsdt("item", id, metaFillers(rows?.[0]?.meta), metaFillers(meta));
}

/** Шаблон босса: новые наполнители против сохранённых. */
export async function assertBossTemplateUsdt(id: string, fillers: unknown): Promise<void> {
  if (usdtInFillers(fillers) <= 0) return;
  const rows = (await mcpExec(
    `SELECT reward_tiers->'fillers' AS fillers FROM yuplink.raid_boss_template WHERE id = ${sqlStr(id)};`,
    { wrapJson: true },
  )) as Array<{ fillers: unknown }> | null;
  await assertTemplateUsdt("boss", id, rows?.[0]?.fillers, fillers);
}
