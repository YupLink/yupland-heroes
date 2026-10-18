import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: таяние энергии выше лимита (acc-45-energy-decay).
// Отдельный файл: chips.ts давно перерос лимит строк. Подписи регена
// («+1 через …») остались на своих местах в chips.ts и braid.ts — здесь их
// зеркальные «−1 через …», которые HUD-ы показывают, когда запас тает.
export const dict: Record<string, Entry> = {
  // Карточка энергии в шапке (StatsBar): подпись под числом.
  "chips.energy_decay_in": { ru: "−1 через {time}", en: "−1 in {time}" },
  // Главная (HomeTab): минуты до следующей единицы вниз.
  "chips.next_unit_down_in": { ru: "· −1 через {n}мин", en: "· −1 in {n}min" },
  // Полоса ресурсов бета-рейда: таймер по тапу на энергии.
  "braid.energy_decay_next": {
    ru: "−1 через {time} · до {max}",
    en: "−1 in {time} · down to {max}",
  },
};
