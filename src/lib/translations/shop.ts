import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: Магазин билетов
// Часть src/lib/translations.ts — разбита на субдомены.
// Импортируется через src/lib/translations/index.ts
export const dict: Record<string, Entry> = {
  // Shop modal
  "shop.title": { ru: "Магазин билетов", en: "Ticket shop" },
  "shop.tab_energy": { ru: "Энергия", en: "Energy" },
  "shop.buy": { ru: "Купить", en: "Buy" },
  "shop.energy_label": { ru: "Энергия:", en: "Energy:" },
  "shop.disconnect_link": { ru: "отключить", en: "disconnect" },
  "shop.empty": { ru: "Офферов пока нет.", en: "No offers yet." },
  "shop.tickets_label_n": { ru: "+{n}", en: "+{n}" },
  "shop.for_label": { ru: "за", en: "for" },
};
