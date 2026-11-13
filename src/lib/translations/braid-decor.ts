import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Взаимодействие с декором (владелец, 25.09): за энергию декор уничтожается,
// свой товар (например «Дерево») уходит в рюкзак героя, не влезшее — мешочком
// на клетке (29.09, ПРАВИЛА §8.21).
export const dict: Record<string, Entry> = {
  // Игрок
  "braid.act_decor": { ru: "Уничтожить", en: "Destroy" },
  "braid.decor_done": { ru: "+{n} {item} — в рюкзак", en: "+{n} {item} — to the backpack" },
  // Мешочек не упал (сбой базы) — товар ждёт в «Добыче», как до мешочков.
  "braid.decor_loot": { ru: "+{n} {item} — в «Добычу»", en: "+{n} {item} — to Loot" },
  "braid.decor_gone": { ru: "Декор уже уничтожен", en: "Already destroyed" },
  "braid.decor_no_interact": {
    ru: "С этим декором взаимодействовать нельзя",
    en: "This decor can't be interacted with",
  },
  // Инструмент (27.09): «1 топор = 1 декор», имя — от товара-инструмента.
  "braid.decor_chop": { ru: "Срубить", en: "Chop" },
  "braid.decor_chop_cost": { ru: "−1 {tool}", en: "−1 {tool}" },
  "braid.decor_need_tool": { ru: "Требуется {tool}", en: "Need {tool}" },
  // Несколько инструментов (05.10): «Требуется Топор или Кирка».
  "braid.decor_tool_or": { ru: "или", en: "or" },
  // Прочность инструмента (28.09): «Износ за удар, %» у товара-инструмента.
  "braid.decor_chop_wear": { ru: "−{n}% прочности", en: "−{n}% durability" },
  "braid.tool_durability": { ru: "Прочность {n}%", en: "Durability {n}%" },
  "braid.decor_tool_busy": {
    ru: "Инструмент ещё в деле — повтори через пару секунд",
    en: "The tool is still in use — try again in a moment",
  },
  "braid.tool_worn_stays": {
    ru: "Изношенный инструмент остаётся в рюкзаке — доломай его или выброси всю стопку",
    en: "A worn tool stays in the backpack — use it up or discard the whole stack",
  },
  // Рубка руками (17.10, §8.56): без топора — за энергию и сытость героя.
  "braid.decor_hand": { ru: "Срубить руками", en: "Chop by hand" },
  "braid.decor_hand_hungry": {
    ru: "Рубить руками — нужно {n} сытости. Поешь",
    en: "Chopping by hand needs {n} satiety. Eat something",
  },
  "braid.decor_hand_no": { ru: "Это руками не срубить", en: "This can't be chopped by hand" },
  "braid.decor_hand_low_satiety": {
    ru: "Мало сытости — нужно {n}",
    en: "Not enough satiety — need {n}",
  },
  "braid.decor_hand_low_energy": {
    ru: "Мало энергии — нужно {n}",
    en: "Not enough energy — need {n}",
  },
  // Дорога до дерева в кнопке рубки (13.11.2026): энергия, чтобы подойти.
  "braid.decor_walk": { ru: "Дорога: ⚡{n}", en: "Walk there: ⚡{n}" },
  // Админ
  "decor.interact": { ru: "Взаимодействие", en: "Interaction" },
  "decor.energy": { ru: "Энергия", en: "Energy" },
  "decor.item": { ru: "Товар", en: "Item" },
  "decor.tool": { ru: "Инструмент", en: "Tool" },
  "decor.tool_remove": { ru: "Убрать инструмент", en: "Remove tool" },
  "decor.amount": { ru: "Количество", en: "Amount" },
  "decor.respawn": { ru: "Респавн, мин", en: "Respawn, min" },
  // Надпись действия (29.09): «Срубить» вместо «Уничтожить», своя у шаблона.
  "decor.label": { ru: "Надпись действия", en: "Action label" },
  "decor.off": { ru: "выкл", en: "off" },
  "decor.save": { ru: "Сохранить", en: "Save" },
  "decor.saved": { ru: "Сохранено", en: "Saved" },
};
