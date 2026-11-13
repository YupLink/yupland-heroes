// Клад дня (lib/treasure, §8.117): тост находки, «Добыча», письмо бота и вкладка «$ Экономика → Клад».
import type { Lang } from "../store";

export const dict: Record<string, Record<Lang, string>> = {
  "treasure.found": { ru: "Клад! {prize} — в «Добыче»", en: "Treasure! {prize} — in Harvest" },
  "harvest.source.treasure": { ru: "Клад", en: "Treasure" },
  "treasure.dm_found": {
    ru: "🗝 <b>Ты нашёл клад!</b>\n{prize} — в «Добыче», забери его.",
    en: "🗝 <b>You found the treasure!</b>\n{prize} is waiting in Harvest — claim it.",
  },
  "treasure.dm_open": { ru: "В «Добычу»", en: "Open Harvest" },
  "treasure.pay_later": {
    ru: "Клад пока не выдался — забери чуть позже",
    en: "The treasure couldn't be paid yet — claim it a bit later",
  },
  "econ.tab.treasure": { ru: "Клад", en: "Treasure" },
  "treasure.fund": { ru: "Фонд", en: "Fund" },
  "treasure.fund_days": { ru: "на {n} дн.", en: "for {n} days" },
  "treasure.fund_empty": { ru: "Фонд пуст", en: "The fund is empty" },
  "treasure.add": { ru: "В фонд", en: "Add to fund" },
  "treasure.bury_now": { ru: "Закопать сейчас", en: "Bury now" },
  "treasure.buried": {
    ru: "Клад закопан — скрин в Telegram",
    en: "Treasure buried — screenshot sent",
  },
  "treasure.live_exists": {
    ru: "Клад уже лежит — второй не закопать",
    en: "A treasure is already buried",
  },
  "treasure.fund_empty_err": { ru: "Фонд пуст", en: "The fund is empty" },
  "treasure.no_spot": {
    ru: "Не нашлось клетки — попробуй ещё раз",
    en: "No cell found — try again",
  },
  "treasure.added": { ru: "Приз в фонде", en: "Prize added" },
  "treasure.buried_now": { ru: "закопан", en: "buried" },
  "treasure.list": { ru: "Клады", en: "Treasures" },
  "treasure.none": { ru: "Кладов ещё не было", en: "No treasures yet" },
  "treasure.st_live": { ru: "лежит до {t}", en: "until {t}" },
  "treasure.st_found": { ru: "нашёл {who}", en: "found by {who}" },
  "treasure.st_expired": { ru: "не нашли", en: "not found" },
  "treasure.shot": { ru: "Скрин", en: "Screenshot" },
  "treasure.bad_kind": { ru: "Такой приз кладом не бывает", en: "This can't be a treasure prize" },
  "treasure.bad_amount": { ru: "Неверное количество", en: "Invalid amount" },
  "treasure.bad_ref": { ru: "Выбери предмет или токен", en: "Pick an item or a token" },
  "treasure.no_usdt": { ru: "USDT кладом не выдаётся", en: "USDT can't be a treasure" },
  "treasure.not_admin": {
    ru: "Клад — только у владельца и Ярослава",
    en: "Treasure is for the owner and Yaroslav only",
  },
  "treasure.prize_busy": {
    ru: "Этот приз уже закопан — его ищут",
    en: "This prize is buried right now",
  },
};
