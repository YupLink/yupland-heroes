// Заготовки для тестов автораздачи: план по умолчанию и поддельные справочники.
//
// Живут отдельно от тестов, потому что нужны двоим (сборка плана и отчёт), а
// копия справочника в каждом файле разъехалась бы с первой правкой.
//
// В базу не ходит НИЧЕГО: строки лежат тут же, а сам модуль базы подменяется в
// каждом тесте через vi.mock — эти данные и есть весь «сервер».
import type { ScatterPlan } from "@/lib/raid/scatterPlan";

/** Строки, как их отдаёт SELECT из raid_boss_template. */
export type BossRow = { id: string; land: string | null; level: number; reward_tiers: unknown };
/** Строки шаблонов кучек: `cfg` — meta->'rewardConfig'. */
export type PileRow = { id: string; land: string | null; cfg: unknown };
/** Артефакты: имя и местность, награды у них своей нет. */
export type ArtRow = { id: string; land: string | null };

export type FakeTables = { boss?: BossRow[]; chest?: PileRow[]; coin?: PileRow[]; art?: ArtRow[] };

/**
 * Ответ поддельной базы на запросы справочников (scatter-tpl).
 *
 * Разбираем по тексту запроса: другого способа отличить «сундуки» от «монеток»
 * нет — таблица и вид у них общие, различает их ровно `NOT` перед правилом
 * монетки (pile-kind).
 */
export function answerTplSql(sql: string, tables: FakeTables): unknown[] {
  if (sql.includes("raid_boss_template")) return tables.boss ?? [];
  if (sql.includes("kind = 'artifact'")) return tables.art ?? [];
  if (sql.includes("t.kind = 'chest'")) {
    return (sql.includes("AND NOT COALESCE") ? tables.chest : tables.coin) ?? [];
  }
  return [];
}

/** Награда шаблона кучки: номинал = потолок одной кучки по этой валюте. */
export const pileCfg = (kind: string, token: string | null, amount: number) => ({
  fillers: [{ kind, token, amount }],
  split: [100],
});

/** План, в котором ничего не включено, — от него пляшут все тесты. */
export function emptyPlan(): ScatterPlan {
  const pile = () => ({
    enabled: false,
    removeKilled: false,
    count: 0 as number | null,
    point: null as number | null,
    funds: [],
    templateIds: [],
    lands: [],
  });
  return {
    boss: {
      enabled: false,
      removeKilled: false,
      count: 0,
      levelMin: 1,
      levelMax: 100,
      funds: [],
      packs: [],
      arts: [],
      lands: [],
    },
    chests: pile(),
    coins: pile(),
    artifacts: {
      enabled: false,
      removeKilled: false,
      count: 0,
      rarities: [],
      templateIds: [],
      lands: [],
    },
  };
}
