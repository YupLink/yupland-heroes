// Пропуск Прихожей: новичок попадает сразу в игру.
//
// Прихожая задумывалась как вход, а работала как порог: из 90 заведённых юпиков
// выпустились семеро, остальные 79 остались на коврике (замер 01.09.2026).
// Владелец решил проще: новый игрок считается прошедшим Прихожую и идёт сразу
// в Фишки, а вместо накопленного добра получает стартовый набор — коммон-героя
// и десять тренировочных фишек со случайной звёздностью (владелец, 06.10.2026;
// было три фишки и без героя). Героя с 22.10.2026 здесь не дают: новичок
// выбирает расу в меню входа («Начать игру», game-start.ts), и герой ложится
// через starter-kit.ts.
//
// Продать их за билеты нельзя (см. exchangeTrainingForTickets): это плата за
// пропуск, а не капитал. Воевать ими можно — бой на гекс-карте (босс, охрана
// шахты) и старый рейд ищут их по аккаунту владельца.
//
// Владелец — аккаунт, и он заводится ЗДЕСЬ, до выдачи. Раньше строки
// вставлялись без account_id в расчёте на триггер stamp_acc, а тот берёт
// users.account_id — которого у новичка ещё не было: аккаунт появлялся
// лениво, при первом чтении энергии, через долю секунды ПОСЛЕ выдачи. С
// миграции acc-07 (04.09) все чтения идут по account_id, и стартовый набор
// каждого новичка оказывался ничьим: пикер пуст, «Нет фишек для боя».
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import { resolveAccountId } from "./user-claims-core";

/** Источник фишек, выданных за пропуск Прихожей. По нему же закрыта продажа. */
export const SKIP_CHIP_SOURCE = "skip_pass";
export const SKIP_CHIP_COUNT = 10;
/**
 * Фишки, которыми старых игроков добили до 10 разовой раздачей стартового
 * набора (migrations/starter-01-backfill.sql). Тоже плата за вход, не капитал.
 */
export const STARTER_TOPUP_SOURCE = "starter_topup";

/** Стартовая фишка — за билеты не продаётся (exchangeTrainingForTickets). */
export const isStarterChip = (source: string | null | undefined): boolean =>
  source === SKIP_CHIP_SOURCE || source === STARTER_TOPUP_SOURCE || source === "island_pack";

/** Звёздности как у гачи прихожей: равные шансы на 1…3★. */
const STARS = [1, 1.5, 2, 2.5, 3];

/** Случайная звёздность на crypto-RNG — Math.random здесь не нужен. */
function randomStar(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return STARS[buf[0] % STARS.length];
}

/**
 * Аккаунт новичка. Именно создающий resolveAccountId (user-claims-core), а не
 * одноимённый из user-shared: тот при отсутствии аккаунта вернул бы адрес
 * кошелька, и он лёг бы в account_id.
 *
 * Не смог — выдаём без владельца: второго вызова не будет (нас зовут только
 * при создании строки users), а бэкфилл по acc_of(wallet) дотянет.
 */
async function accountForStarter(wallet: string, tgId: number | null): Promise<string | null> {
  try {
    return await resolveAccountId({ wallet, telegram_id: tgId, account_id: null });
  } catch (err) {
    console.warn("[hallway-skip] аккаунт не завёлся, набор выдаём без владельца:", err);
    return null;
  }
}

/** Юпик аккаунта: по аккаунту, своему кошельку или сестринскому (одна прихожая на Telegram). */
async function findYupik(wallet: string, tgId: number | null, accountId: string | null) {
  if (accountId) {
    const mine = await pg.hallwayYupiks.findOne({ account_id: accountId });
    if (mine) return mine;
  }
  const own = await pg.hallwayYupiks.findOne({ wallet });
  if (own) return own;
  if (tgId == null) return null;
  const { data } = await pg.hallwayYupiks
    .raw()
    .select("*")
    .eq("telegram_id", tgId)
    .order("created_at", { ascending: true })
    .limit(1);
  return ((data ?? [])[0] as typeof own | undefined) ?? null;
}

/**
 * Уже выдавали набор за пропуск этому аккаунту?
 *
 * Сверяем и по аккаунту, не только по кошелькам одного Telegram: вход по
 * кошельку без TG-намерения приходит с tgId=null, и один аккаунт получал
 * набор трижды (9 живых skip_pass на acc_KTpa…, 20.09).
 */
async function hasSkipChips(wallets: string[], accountId: string | null): Promise<boolean> {
  const { data } = await pg.hallwayTrainingChips
    .raw()
    .select("id")
    .in("wallet", wallets)
    .eq("source", SKIP_CHIP_SOURCE)
    .limit(1);
  if ((data ?? []).length > 0) return true;
  if (!accountId) return false;
  const { data: byAcc } = await pg.hallwayTrainingChips
    .raw()
    .select("id")
    .eq("account_id", accountId)
    .eq("source", SKIP_CHIP_SOURCE)
    .limit(1);
  return (byAcc ?? []).length > 0;
}

/**
 * Отметить Прихожую пройденной и выдать стартовый набор.
 *
 * Зовётся один раз — при создании строки users; повторного входа сюда нет,
 * поэтому ошибки не пробрасываем (вход в игру важнее стартовых фишек), а
 * набор дедуплицируем сами.
 */
export async function skipHallwayForNewPlayer(
  wallet: string,
  tgId: number | null,
): Promise<{ released: boolean; chips: number }> {
  const now = new Date().toISOString();
  let released = false;
  let chips = 0;
  try {
    const accountId = await accountForStarter(wallet, tgId);
    // Владельца пишем явно: триггер stamp_acc до этого места дотягивал только
    // старых игроков, у которых аккаунт уже был.
    const owner = accountId ? { account_id: accountId } : {};
    const existing = await findYupik(wallet, tgId, accountId);
    const yw = existing?.wallet ?? wallet;
    if (!existing) {
      // Юпик всё равно заводим: на нём висит уровень, и без него экраны
      // прихожей и обмена фишек спотыкались бы о пустую строку.
      await pg.hallwayYupiks.insert({
        ...owner,
        wallet,
        telegram_id: tgId,
        level: 1,
        exp: 0,
        awareness: 0,
        tap_pool: 0,
        last_regen_at: now,
        chest_open_count: 0,
        pending_chests: 0,
        marathon_day: 0,
        marathon_reward_days: [],
        marathon_last_claim_day: null,
        released: true,
        released_at: now,
        released_tickets: 0,
        last_collect_at: null,
        last_petting_at: null,
        last_daily_at: null,
        created_at: now,
        updated_at: now,
      });
      released = true;
    } else if (!existing.released) {
      await pg.hallwayYupiks.update(
        { wallet: yw },
        { released: true, released_at: now, updated_at: now },
      );
      released = true;
    }

    // Остров встречает новичков — 10 стартовых фишек им не нужны: паки из
    // первого сундука острова (владелец, 20.10.2026, §8.47; включено 06.11).
    // Остров не создался — фишки выдаст меню входа (game-start-core).
    const { islandNewbiesOn } = await import("./beta-raid/island/island-newbie");
    if (await islandNewbiesOn()) return { released, chips: 0 };
    chips = await grantSkipChips(wallet, tgId, accountId);
  } catch (err) {
    console.warn("[hallway-skip] не удалось выдать стартовый набор:", err);
  }
  return { released, chips };
}

/** 10 стартовых фишек — один набор на Telegram и аккаунт; был — 0. */
export async function grantSkipChips(
  wallet: string,
  tgId: number | null,
  accountId: string | null,
): Promise<number> {
  const owner = accountId ? { account_id: accountId } : {};
  const now = new Date().toISOString();
  // Кошельки аккаунта: набор один на Telegram, а не на каждый кош.
  const sisters =
    tgId == null ? [wallet] : (await pg.users.findMany({ telegram_id: tgId })).map((u) => u.wallet);
  const wallets = Array.from(new Set([wallet, ...sisters]));
  if (await hasSkipChips(wallets, accountId)) return 0;
  let chips = 0;
  for (let i = 0; i < SKIP_CHIP_COUNT; i++) {
    await pg.hallwayTrainingChips.insert({
      ...owner,
      id: `htc_${nanoid(10)}`,
      wallet,
      telegram_id: tgId,
      star: randomStar(),
      source: SKIP_CHIP_SOURCE,
      obtained_at: now,
      consumed_at: null,
    });
    chips++;
  }
  return chips;
}
