import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы сумки зелий: второе хранилище героя рядом с рюкзаком. Зелье — свой
// товар с галочкой «зелье»; ячейки — по редкости героя и Алхимии.
// Отдельный файл — braid-castle.ts и braid-market.ts уже за лимитом строк.
export const dict: Record<string, Entry> = {
  "braid.potion_bag": { ru: "Сумка зелий", en: "Potion bag" },
  "braid.alchemy_stat": { ru: "Алхимия", en: "Alchemy" },
  "braid.potion_alchemy_bonus": { ru: "+{n} за алхимию", en: "+{n} from alchemy" },
  // «Алхимия» боевого стата не даёт, зато растит сумку зелий — как Торговля рюкзак.
  "braid.gear_alchemy_hint": { ru: "растит сумку зелий", en: "grows the potion bag" },
  // Выпить сразу несколько штук одного зелья.
  "braid.boost_item_use_n": { ru: "Использовать {n} шт", en: "Use {n}" },
  "braid.potion_all": { ru: "Все ({n})", en: "All ({n})" },
  // Еда (товар с сытостью) — не «использовать», а съесть.
  "braid.boost_item_eat": { ru: "Съесть", en: "Eat" },
  "braid.boost_item_eat_n": { ru: "Съесть {n} шт", en: "Eat {n}" },
  // Отказы сервера: зелья живут только в сумке (в рюкзак не переливаются) /
  // сколько ячеек сумки освободить.
  "market.potion_bag_full": {
    ru: "Нет места в сумке зелий",
    en: "No room in the potion bag",
  },
  "market.potion_bag_need": {
    ru: "Нет места в сумке зелий: нужно {need} яч., свободно {free}",
    en: "No room in the potion bag: {need} cell(s) needed, {free} free",
  },
};
