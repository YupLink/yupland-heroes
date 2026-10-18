// Справочники для автораздачи: чем именно можно ставить и что у шаблона внутри.
//
// Только чтение таблиц шаблонов — ни клеток, ни записи. Отдельно от счёта
// (scatter-build), потому что вопросов к базе тут четыре, а правил раздачи —
// ни одного.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr, parseRewardConfig, type RewardConfig } from "../raid-shared";
import { tplIsCoin } from "./pile-kind";
import type { ScatterFund } from "@/lib/raid/scatterPlan";

/** Шаблон, из которого делается заготовка объекта. */
export type Tpl = {
  id: string;
  land: string | null;
  level: number;
  /** Процентовка мест из шаблона: её владелец просил сохранять как есть. */
  split: number[];
  cfg: RewardConfig;
};

const idList = (ids: string[]) => ids.map((s) => sqlStr(s)).join(",");

/**
 * Процентовка мест ПРЯМО из шаблона.
 *
 * Через parseRewardConfig её не достать: тот читает `split` только внутри ветки
 * с `fillers` и на шаблоне с процентовкой, но без наполнителей молча
 * подставляет общий DEFAULT_SPLIT. Для раздачи это чужая процентовка на чужом
 * боссе, а владелец просил сохранять авторскую. Общий разбор не трогаем — на
 * него завязана выдача наград.
 */
function splitOf(raw: unknown, fallback: number[]): number[] {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const s = (raw as Record<string, unknown>).split;
    if (Array.isArray(s) && s.length > 0) return s.map((x) => Number(x) || 0);
  }
  return fallback;
}

// Все выборки шаблонов идут ORDER BY id. Без него порядок строк — на усмотрение
// Postgres (он меняется после обновления таблицы, VACUUM и смены плана), а
// раздача берёт из списка жребием: с сидом «та же раскладка» держалась бы ровно
// до первой правки справочника, и повторить вчерашнюю раздачу стало бы нельзя.
function toTpl(id: string, land: string | null, level: number, raw: unknown): Tpl {
  const cfg = parseRewardConfig(raw);
  return { id, land: land || null, level, split: splitOf(raw, cfg.split), cfg };
}

/** Боссы нужного уровня. */
export async function loadBossTpl(min: number, max: number): Promise<Tpl[]> {
  const rows = (await mcpExec(
    `SELECT id, land, COALESCE(level, 1) AS level, reward_tiers
       FROM yuplink.raid_boss_template
      WHERE COALESCE(level, 1)
            BETWEEN ${Math.floor(Math.min(min, max))} AND ${Math.floor(Math.max(min, max))}
      ORDER BY id;`,
    { wrapJson: true },
  )) as Array<{ id: string; land: string | null; level: number; reward_tiers: unknown }>;
  return (rows ?? []).map((r) => toTpl(r.id, r.land, Number(r.level) || 1, r.reward_tiers));
}

/** Кучки: сундук и монетка — один вид `chest`, различает их запас HP (pile-kind). */
export async function loadPileTpl(group: "chest" | "coin", ids: string[]): Promise<Tpl[]> {
  const rows = (await mcpExec(
    `SELECT t.id, t.land, t.meta->'rewardConfig' AS cfg
       FROM yuplink.mystic_item_template t
      WHERE t.kind = 'chest' AND t.active = true
        AND ${group === "coin" ? "" : "NOT "}${tplIsCoin("t")}
        ${ids.length > 0 ? `AND t.id IN (${idList(ids)})` : ""}
      ORDER BY t.id;`,
    { wrapJson: true },
  )) as Array<{ id: string; land: string | null; cfg: unknown }>;
  return (rows ?? []).map((r) => toTpl(r.id, r.land, 1, r.cfg));
}

/**
 * ДОБЫЧА одним списком: сундуки и монетки вместе, с пометкой вида.
 *
 * Владелец просил один раздел на двоих: «разница только в том, что монеткам я
 * не задаю паки и артефакты». Но на карте они всё равно расходятся по двум
 * группам — по ним устроены снятие отработавших и отчёт, а их трогать нельзя.
 * Поэтому вид решает сам шаблон (запас HP), а не отдельный раздел панели.
 */
export async function loadLootTpl(
  ids: string[],
): Promise<Array<Tpl & { group: "chest" | "coin" }>> {
  const rows = (await mcpExec(
    `SELECT t.id, t.land, t.meta->'rewardConfig' AS cfg, ${tplIsCoin("t")} AS is_coin
       FROM yuplink.mystic_item_template t
      WHERE t.kind = 'chest' AND t.active = true
        ${ids.length > 0 ? `AND t.id IN (${idList(ids)})` : ""}
      ORDER BY t.id;`,
    { wrapJson: true },
  )) as Array<{ id: string; land: string | null; cfg: unknown; is_coin: boolean }>;
  return (rows ?? []).map((r) => ({
    ...toTpl(r.id, r.land, 1, r.cfg),
    group: r.is_coin ? ("coin" as const) : ("chest" as const),
  }));
}

/** Артефакты поимённо или по редкости; поимённый список сильнее. */
export async function loadArtTpl(rarities: string[], ids: string[]): Promise<Tpl[]> {
  const filter =
    ids.length > 0
      ? `AND id IN (${idList(ids)})`
      : rarities.length > 0
        ? `AND rarity IN (${idList(rarities)})`
        : "";
  const rows = (await mcpExec(
    `SELECT id, land FROM yuplink.mystic_item_template
      WHERE kind = 'artifact' AND active = true ${filter}
      ORDER BY id;`,
    { wrapJson: true },
  )) as Array<{ id: string; land: string | null }>;
  return (rows ?? []).map((r) => toTpl(r.id, r.land, 1, null));
}

/**
 * Потолок шаблона по этому фонду: сколько такой кучки максимум влезает.
 *
 * 0 значит «шаблон про такой ресурс НЕ знает» — не «потолка нет». Разница
 * дорогая: rollPiles читает нулевой потолок как безграничный, и монетка с
 * проектным номиналом 10 набрала бы миллионы. Кто как поступает с этим нулём —
 * решает раздача (scatter-build.shareByCap).
 */
export function capOf(tpl: Tpl, f: ScatterFund): number {
  const tok = (v: string | null | undefined) => (v ?? "").toLowerCase();
  const same = tpl.cfg.fillers.find(
    (x) => x.kind === f.kind && (f.kind !== "token" || tok(x.token) === tok(f.token)),
  );
  return same && same.amount > 0 ? same.amount : 0;
}
