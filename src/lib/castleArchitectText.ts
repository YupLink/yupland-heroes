// Отказы Архитектора — ключами `architect.*` (сервер, castle-architect/*), текст
// игроку — здесь, ru+en. Прочие ключи (рюкзак полон, нет героя) переводит общий
// humanError. Метку «оплату вернули» (castleArchitectMark) снимаем: игрок видит
// исходный текст.
import { humanError } from "@/lib/humanError";
import { OP_REFUNDED, unmarkRefunded } from "@/lib/castleArchitectMark";

const TEXT: Record<string, [string, string]> = {
  "architect.level_moved": [
    "Уровень Архитектора уже изменился — обнови окно",
    "The Architect's level has changed — reopen the window",
  ],
  "architect.max_level": [
    "Архитектор уже на последнем уровне",
    "The Architect is already at the top level",
  ],
  "architect.no_resources": ["Не хватает ресурсов", "Not enough resources"],
  "architect.boost_max": [
    "Чертёж уже усилен до предела",
    "The blueprint is already at the top boost",
  ],
  "architect.boost_moved": [
    "Усиление уже изменилось — обнови окно",
    "The boost has changed — reopen the window",
  ],
  "architect.soon": ["Эти заготовки пока не делаются", "These blueprints are not available yet"],
  "architect.bad_good": [
    "Такого товара нет в справочнике — выбери из списка",
    "This item is not in the catalog — pick one from the list",
  ],
  [OP_REFUNDED]: [
    "Эта попытка уже отменена — нажми ещё раз",
    "This attempt was cancelled — try again",
  ],
};

/** Текст ошибки Архитектора для игрока. */
export function architectErrorText(e: unknown, ru: boolean): string {
  const { refunded, message: raw } = unmarkRefunded(
    e instanceof Error ? e.message : String(e ?? ""),
  );
  const need = /^architect\.level_needed:(\d+)$/.exec(raw);
  if (need) {
    return ru
      ? `Нужен Архитектор ${need[1]}-го уровня или выбранный герой-Строитель`
      : `Needs an Architect of level ${need[1]} or a selected Builder hero`;
  }
  // Список недостающего собирает сервер: «Доска ×3, Гвоздь ×1».
  const goods = /^architect\.no_goods:(.+)$/.exec(raw);
  if (goods) {
    return ru
      ? `Не хватает товаров в рюкзаке героя: ${goods[1]}`
      : `Not enough items in the hero's backpack: ${goods[1]}`;
  }
  const t = TEXT[raw];
  if (t) return t[ru ? 0 : 1];
  return humanError(refunded ? new Error(raw) : e);
}
