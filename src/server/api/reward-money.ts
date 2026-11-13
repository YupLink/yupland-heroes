// Деньги в фонде босса, мини-босса, рейд-босса, локации, сундука и шаблона
// босса (аудит 11.11.2026). Токены фонда босса начисляются игрокам из воздуха
// (boss.ts distributeBossRewards — без списания из пула карты), поэтому токены
// в фонде заводит и меняет только админ выплат, как и бокс с деньгами
// (mystic-money). Правка конфига, где токены и паки те же (настроил владелец,
// админ меняет другое), и конфиг без токенов — любой админ, как раньше.
import { DEFAULT_SPLIT, sqlStr } from "./raid-shared";

/** Не деньги; остальное — kind "token" или старый kind-символ монеты. */
const NOT_MONEY: ReadonlySet<string> = new Set([
  "likes",
  "tickets",
  "energy",
  "resource",
  "custom",
]);

type Raw = Record<string, unknown>;

function rec(v: unknown): Raw {
  let x = v;
  if (typeof x === "string") {
    try {
      x = JSON.parse(x);
    } catch {
      return {};
    }
  }
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Raw) : {};
}

/**
 * Отпечаток денег конфига: ненулевые наполнители по порядку до последнего
 * денежного (не-деньги — «x»: сундук отдаёт первый ненулевой) и доли мест.
 * Без токенов — пустая строка.
 */
export function moneyKey(cfg: unknown): string {
  const o = rec(cfg);
  const seq: string[] = [];
  let last = 0;
  for (const raw of Array.isArray(o.fillers) ? (o.fillers as unknown[]) : []) {
    const f = rec(raw);
    const amount = Number(f.amount) || 0;
    if (!(amount > 0)) continue;
    const kind = typeof f.kind === "string" && f.kind ? f.kind : "likes";
    if (NOT_MONEY.has(kind)) {
      seq.push("x");
      continue;
    }
    const sym = kind === "token" && typeof f.token === "string" && f.token ? f.token : kind;
    seq.push(`${sym.toLowerCase()}:${amount}`);
    last = seq.length;
  }
  if (last === 0) return "";
  const split =
    Array.isArray(o.split) && o.split.length
      ? (o.split as unknown[]).map((x) => Number(x) || 0)
      : DEFAULT_SPLIT;
  const sum = split.reduce((a, x) => a + x, 0);
  const shares = split.map((x) => (sum > 0 ? Math.round((x / sum) * 1e6) : 0));
  return JSON.stringify([seq.slice(0, last), shares]);
}

/** Конфиг добавляет или меняет токены против сохранённого (prev). */
export function addsMoney(next: unknown, prev: unknown): boolean {
  const key = moneyKey(next);
  return key !== "" && key !== moneyKey(prev);
}

const packsOf = (cfg: unknown): Array<{ packId: string; toPlace: number }> => {
  const p = rec(cfg).packs;
  return (Array.isArray(p) ? (p as unknown[]) : []).map((x) => ({
    packId: String(rec(x).packId ?? ""),
    toPlace: Number(rec(x).toPlace) || 0,
  }));
};

/** Паки, вставшие заново, сдвинутые или с большим числом мест — против prev. */
export function changedPacks(next: unknown, prev: unknown): string[] {
  const before = packsOf(prev);
  return packsOf(next)
    .filter((p, i) => {
      const b = before[i];
      return !!p.packId && (!b || b.packId !== p.packId || b.toPlace < p.toPlace);
    })
    .map((p) => p.packId);
}

const STORED = {
  chip_boss: "reward_tiers",
  raid_location: "reward_tiers",
  raid_boss_template: "reward_tiers",
  raid_node: "chest_config",
} as const;
export type RewardTable = keyof typeof STORED;

/**
 * Сохранение фонда: токены добавились или поменялись против строки в базе
 * (нет id — новая строка) — только админ выплат; новый пак-бокс с деньгами —
 * тоже (mystic-money).
 */
export async function assertRewardMoneyRight(
  next: unknown,
  table: RewardTable,
  id?: string | null,
): Promise<void> {
  if (moneyKey(next) === "" && packsOf(next).length === 0) return;
  let prev: unknown = null;
  if (id) {
    const { mcpExec } = await import("../db/mcpClient");
    const rows = (await mcpExec(
      `SELECT ${STORED[table]} AS cfg FROM yuplink.${table} WHERE id = ${sqlStr(id)} LIMIT 1;`,
      { wrapJson: true },
    )) as Array<{ cfg: unknown }> | null;
    prev = rows?.[0]?.cfg ?? null;
  }
  const { assertPackMoneyRight } = await import("./mystic-money");
  for (const packId of changedPacks(next, prev)) await assertPackMoneyRight(packId);
  if (!addsMoney(next, prev)) return;
  const { requirePayoutsAdmin } = await import("../auth");
  requirePayoutsAdmin();
}
