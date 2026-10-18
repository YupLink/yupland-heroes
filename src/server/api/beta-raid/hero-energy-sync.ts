// Интеллект героя в энергии: максимум и скорость добычи.
//
// По спеке владельца одна единица интеллекта даёт +1 к максимуму энергии и
// +2% к скорости её добычи. Пример из спеки: 65 интеллекта → максимум 95/95,
// и за десять минут приходит 1 + 130% = 2.3 энергии. Сами числа считает
// heroPowerCurve (energyMaxBonus / energyRegenBonusPct) — здесь только доставка
// их в базу, чтобы у спеки остался один экран.
//
// Считать это в JS нельзя: энергия целиком живёт в SQL (touch_energy_atomic,
// compute_energy, add_energy), и любой второй источник максимума разъехался бы
// с настоящим списанием — игрок видел бы 95, а тратил из 30. Поэтому герой не
// «применяется» в момент шага, а СКЛАДЫВАЕТСЯ в саму строку user_energy двумя
// колонками, которые читают уже сами функции:
//   hero_max_bonus  integer — прибавка к max_energy;
//   hero_regen_pct  numeric — на сколько процентов быстрее капает.
//
// Смена бонуса идёт через yuplink.energy_set_hero_bonus: она закрепляет уже
// натикавшее по прежней скорости, а потом ставит новые числа. Падение
// проглатывается молча (catch ниже): энергия обязана работать даже если герой
// временно недоступен.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import type { HeroField } from "@/lib/hero/heroPowerCurve";

export type HeroEnergyBonus = { maxBonus: number; regenPct: number };

/** Что из поля героя попадает в строку user_energy. Нет героя — нули. */
export function heroEnergyOf(field: HeroField | null | undefined): HeroEnergyBonus {
  return {
    maxBonus: Math.max(0, Math.round(Number(field?.energyMaxBonus) || 0)),
    // Два знака хватает: интеллект целый, процент кратен двум.
    regenPct: Math.max(0, Math.round((Number(field?.energyRegenBonusPct) || 0) * 100) / 100),
  };
}

/**
 * Игрок = аккаунт: бонус кладём в строку энергии аккаунта, а не кошелька.
 * Ключ на входе может быть и адресом (пока не весь код переехал) — acc_of
 * переведёт его в аккаунт, и бонус попадёт ровно туда, откуда энергия
 * тратится.
 */
const accKey = (key: string): string => `yuplink.acc_of(${sqlStr(key)})`;

/**
 * Не долбим базу на каждый опрос рейда: состояние карты дёргают на каждый шаг
 * и по таймеру, а герой меняется раз в сессию. Ключ — кошелёк, значение —
 * последние успешно записанные числа.
 */
const TTL_MS = 60_000;
const lastSync = new Map<string, { at: number; key: string }>();

/**
 * Переложить интеллект выбранного героя в колонки user_energy.
 *
 * Зовётся лениво из состояния рейда (move-hero-state) — и должна вызываться
 * там же, где сбрасывается кэш силы героя: смена героя, прокачка, надевание
 * артефакта (invalidateHeroPower). Ленивый вызов — подстраховка: даже если
 * какую-то точку забыли, бонус доедет со следующим опросом карты.
 *
 * field = null означает «героя нет»: колонки обнуляются, максимум возвращается
 * к базовому. Иначе снятый герой навсегда оставлял бы за собой чужой запас.
 */
export async function syncHeroEnergy(
  wallet: string,
  field: HeroField | null | undefined,
): Promise<void> {
  const { maxBonus, regenPct } = heroEnergyOf(field);
  const key = `${maxBonus}:${regenPct}`;
  const hit = lastSync.get(wallet);
  if (hit && hit.key === key && Date.now() - hit.at < TTL_MS) return;

  try {
    // RETURNING нужен, чтобы отличить «записали» от «строки ещё нет»: строку
    // user_energy заводит первая трата, и до неё писать бонус некуда. Кэш
    // ставим только по факту записи — иначе первый шаг игрока создал бы
    // строку с нулями, а мы бы ещё минуту считали, что бонус уже там.
    // Через функцию, а не голым UPDATE: она сперва ЗАКРЕПЛЯЕТ натикавшее по
    // прежней скорости и только потом меняет бонусы. Иначе снятие интеллекта
    // пересчитывало весь прошедший период по новой, медленной скорости — и
    // уже показанная сотня превращалась в восемьдесят.
    const rows = (await mcpExec(
      `SELECT yuplink.energy_set_hero_bonus(${accKey(wallet)}, ${maxBonus}, ${regenPct})
              AS applied, ${accKey(wallet)} AS account_id`,
      { wrapJson: true },
    )) as Array<{ account_id: string | null }>;
    if (rows.length > 0 && rows[0]?.account_id) lastSync.set(wallet, { at: Date.now(), key });
  } catch {
    // Колонок ещё нет (миграция не применена) или база недоступна. Молчим:
    // энергия обязана работать по-старому, а не падать из-за героя. Кэш при
    // этом НЕ обновляем — следующий заход попробует снова.
  }
}

/** Забыть кэш записи: после смены героя следующий sync обязан дойти до базы. */
export function invalidateHeroEnergy(): void {
  lastSync.clear();
}
