// Общее для модулей героев: гейт доступа, тип строки и списание лайков.
//
// ⚠️ Механика в закрытом тесте: доступна админам и тестерам, которым владелец
// включил её переключателем в разделе «Тестеры» (см. api/testers.ts).
import { pg } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";
import { heroItemLockSql } from "./hero-item-lock";
import { requireFeature } from "./testers";
import type { HeroRarity } from "@/lib/heroLevels";

/** Превращение фишки в героя. */
export function requireHeroConvert(): Promise<string> {
  return requireFeature("heroes");
}

/** Прокачка уровня героя за лайки. */
export function requireHeroLevelUp(): Promise<string> {
  return requireFeature("hero_levels");
}

export type HeroRow = {
  id: string;
  account_id: string;
  wallet: string;
  template_id: string;
  /** Копия предмета, из которой этот герой (NULL — герой из фишки). */
  item_id?: string | null;
  rarity: string;
  level: number;
  likes_spent: number;
  equipped: Record<string, string>;
  created_at: string;
  /** Отдых после снятия с грядки издалека (hero-rest.ts). */
  rest_until?: string | null;
  /** Вложенные очки навыков (jsonb; разбирает parseSkills). */
  skills?: unknown;
};

/**
 * Списывает лайки со счёта аккаунта.
 *
 * Одним UPDATE с условием в самом запросе. Прежняя тройка «прочитал — сравнил —
 * записал абсолютом» пропускала два параллельных нажатия по одному балансу, а
 * запись абсолютом ещё и затирала соседнее списание: дорогая покупка (5000)
 * исчезала под дешёвой (50), которая прочитала баланс раньше.
 */
export async function spendLikes(
  wallet: string,
  amount: number,
  /** За что списали — попадёт в журнал трат (like_spend_log). */
  reason = "spend",
  /** Ссылка на операцию: id постройки, портала, товара. */
  ref: string | null = null,
): Promise<number> {
  const { likeAccountId } = await import("../likesAccount");
  const account = await likeAccountId(wallet);
  const { guardedSpend } = await import("./guarded-spend");
  const { sqlStr } = await import("./chips-utils");
  const spent = await guardedSpend({
    table: "yuplink.user_like_balance",
    where: `account_id = ${sqlStr(account)}`,
    set: `available = available - ${Number(amount)}, lifetime_spent = lifetime_spent + ${Number(amount)}`,
    cond: `available >= ${Number(amount)}`,
    ret: "available",
  });
  if (!spent.ok) {
    const bal = await pg.userLikeBalance.findOne({ account_id: account });
    const avail = Number(bal?.available ?? 0);
    throw new Error(`Нужно ${amount} лайков, у тебя ${avail.toFixed(2)}`);
  }
  // Журнал трат: без него на «куда делись лайки» отвечал только счётчик
  // lifetime_spent — он знает сумму, но не знает, за что и когда.
  // Запись диагностическая: её падение не имеет права рушить операцию.
  const { mcpExec: exec } = await import("../db/mcpClient");
  await exec(
    `INSERT INTO yuplink.like_spend_log (account_id, wallet, amount, reason, ref)
     VALUES (${sqlStr(account)}, ${sqlStr(wallet)}, ${Number(amount)},
             ${sqlStr(reason)}, ${ref ? sqlStr(ref) : "NULL"});`,
  ).catch(() => undefined);
  return Number(spent.row?.available ?? 0);
}

/** Диагностическая запись траты лайков в журнал: без неё крупнейший сток
 *  (прокачка/создание героя) был невидим в «куда делись лайки». Падение записи
 *  не имеет права рушить операцию — как и в spendLikes. */
async function logLikeSpend(
  account: string,
  wallet: string,
  amount: number,
  reason: string,
  ref?: string,
): Promise<void> {
  const { mcpExec: exec } = await import("../db/mcpClient");
  await exec(
    `INSERT INTO yuplink.like_spend_log (account_id, wallet, amount, reason, ref)
     VALUES (${sqlStr(account)}, ${sqlStr(wallet)}, ${Number(amount)},
             ${sqlStr(reason)}, ${ref ? sqlStr(ref) : "NULL"});`,
  ).catch(() => undefined);
}

/** Отказ ключом словаря: уровень героя сменился между чтением и записью. */
export const HERO_LEVEL_CHANGED = "hero.level_changed";

type AtomicRow = { new_level: number | null; likes_left: number | null; avail_before: number };

/** Единый разбор результата атомарных стейтментов ниже. */
function readAtomic(rows: unknown[]): { newLevel: number; likesLeft: number } | { avail: number } {
  const r = (rows?.[0] ?? {}) as AtomicRow;
  if (r.new_level != null)
    return { newLevel: Number(r.new_level), likesLeft: Number(r.likes_left) };
  return { avail: Number(r.avail_before ?? 0) };
}

/**
 * Повышение уровня СУЩЕСТВУЮЩЕГО героя за лайки — атомарно.
 *
 * Раньше это были две отдельные записи: сначала spendLikes (списание лайков),
 * потом pg.heroInstances.update (уровень). Шим update молча проглатывает
 * попадание в 0 строк (pg.ts) и не откатывает списание — если апдейт не
 * применился, лайки уже ушли, а уровень остался прежним (жалоба SeD 27.08:
 * «лайки списались, уровень тот же»). Теперь один стейтмент: герой поднимается
 * ТОЛЬКО если баланс ≥ цены, а лайки списываются ТОЛЬКО если герой поднялся.
 * Частичного состояния нет.
 *
 * Цена считается по уровню, прочитанному ДО запроса, поэтому подъём условный:
 * уровень всё ещё fromLevel и ниже потолка. Без этого два одновременных запроса
 * (две вкладки, повтор моста) оба проходили — лег уезжал на 61/60 за 800 000.
 */
export async function levelUpHeroAtomic(
  wallet: string,
  heroId: string,
  cost: number,
  at: { fromLevel: number; maxLevel: number },
): Promise<{ newLevel: number; likesLeft: number }> {
  const { likeAccountId } = await import("../likesAccount");
  const acc = await likeAccountId(wallet);
  const w = sqlStr(acc);
  const rows = await mcpExec(
    `WITH cur AS (
       -- FOR UPDATE: две прокачки разом ждут друг друга и видят уже списанное
       -- (аудит 11.11.2026: без замка баланс лайков уходил в минус).
       SELECT available FROM yuplink.user_like_balance WHERE account_id = ${w} FOR UPDATE
     ), lvl AS (
       UPDATE yuplink.hero_instance
          SET level = level + 1, likes_spent = likes_spent + ${cost}, updated_at = now()
        WHERE id = ${sqlStr(heroId)} AND account_id = ${w}
          AND level = ${Math.floor(Number(at.fromLevel) || 0)}
          AND level < ${Math.floor(Number(at.maxLevel) || 0)}
          AND coalesce((SELECT available FROM cur), 0) >= ${cost}
        RETURNING level
     ), deb AS (
       UPDATE yuplink.user_like_balance
          SET available = available - ${cost}, lifetime_spent = lifetime_spent + ${cost}, updated_at = now()
        WHERE account_id = ${w} AND EXISTS (SELECT 1 FROM lvl)
        RETURNING available
     )
     SELECT (SELECT level FROM lvl)::int AS new_level,
            (SELECT available FROM deb)::float8 AS likes_left,
            coalesce((SELECT available FROM cur), 0)::float8 AS avail_before;`,
  );
  const res = readAtomic(rows);
  if ("newLevel" in res) {
    await logLikeSpend(acc, wallet, cost, "hero_levelup", heroId);
    return res;
  }
  // Лайков хватало, а героя не подняли — уровень успел смениться (или потолок).
  if (res.avail >= cost) throw new Error(HERO_LEVEL_CHANGED);
  throw new Error(`Нужно ${cost} лайков, у тебя ${res.avail.toFixed(2)}`);
}

/**
 * Создание героя ПЕРВОГО уровня из шаблона за лайки — атомарно (та же причина,
 * что и у levelUpHeroAtomic). Герой вставляется ТОЛЬКО если баланс ≥ цены, и
 * лайки списываются ТОЛЬКО если вставка прошла. С копией — под замком копии
 * (hero-item-lock, его же держит ломбард) и только пока копия на месте: сданного
 * в ломбард за миг до нас не создать.
 */
export async function createHeroAtomic(args: {
  wallet: string;
  heroId: string;
  templateId: string;
  /** Копия предмета, из которой герой. Без неё вторая копия сливалась с первой. */
  itemId?: string | null;
  rarity: HeroRarity;
  cost: number;
}): Promise<{ newLevel: number; likesLeft: number }> {
  const { likeAccountId } = await import("../likesAccount");
  const accId = await likeAccountId(args.wallet);
  const account = sqlStr(accId);
  const w = sqlStr(args.wallet);
  const lock = args.itemId ? `${heroItemLockSql(args.itemId)}\n` : "";
  // Копия — своя: выставленная на рынок героев за миг до нас лежит в залоге
  // (account_id '_hero_market') — экземпляр на ней не заводим.
  const itemHere = args.itemId
    ? `AND EXISTS (SELECT 1 FROM yuplink.user_game_item u
                    WHERE u.id = ${sqlStr(args.itemId)} AND u.kind = 'hero'
                      AND u.account_id = ${account}
                      AND u.template_id = ${sqlStr(args.templateId)})`
    : "";
  const rows = await mcpExec(
    `${lock}WITH cur AS (
       SELECT available FROM yuplink.user_like_balance WHERE account_id = ${account} FOR UPDATE
     ), ins AS (
       INSERT INTO yuplink.hero_instance
         (id, wallet, template_id, item_id, rarity, level, likes_spent, equipped, source, source_chip_id)
       SELECT ${sqlStr(args.heroId)}, ${w}, ${sqlStr(args.templateId)},
              ${args.itemId ? sqlStr(args.itemId) : "NULL"}, ${sqlStr(args.rarity)},
              1, ${args.cost}, '{}'::jsonb, 'inventory_item', NULL
        WHERE coalesce((SELECT available FROM cur), 0) >= ${args.cost} ${itemHere}
        RETURNING level
     ), deb AS (
       UPDATE yuplink.user_like_balance
          SET available = available - ${args.cost}, lifetime_spent = lifetime_spent + ${args.cost}, updated_at = now()
        WHERE account_id = ${account} AND EXISTS (SELECT 1 FROM ins)
        RETURNING available
     )
     SELECT (SELECT level FROM ins)::int AS new_level,
            (SELECT available FROM deb)::float8 AS likes_left,
            coalesce((SELECT available FROM cur), 0)::float8 AS avail_before;`,
  );
  const res = readAtomic(rows);
  if ("newLevel" in res) {
    await logLikeSpend(accId, args.wallet, args.cost, "hero_create", args.heroId);
    return res;
  }
  // Лайков хватало, а героя не создали — копии уже нет (сдана, продана).
  if (args.itemId && res.avail >= args.cost) throw new Error("Этого героя у тебя нет");
  throw new Error(`Нужно ${args.cost} лайков, у тебя ${res.avail.toFixed(2)}`);
}
