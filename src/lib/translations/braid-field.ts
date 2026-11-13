import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Грядка: снять своего героя с работы издалека — бесплатно, но потом герой
// отдыхает (владелец 29.09.2026; 27.09 было за DARAI). Отдыхающий серый, никуда
// не ставится и ничего не делает. Отдельный файл — braid-mine.ts, где живут
// остальные ключи грядки, у лимита строк.
export const dict: Record<string, Entry> = {
  "braid.field_recall_q": {
    ru: "Снять с работы · отдых {h} ч",
    en: "Recall from work · {h} h rest",
  },
  "braid.field_recall_at": { ru: "грядка {q}, {r}", en: "field {q}, {r}" },
  "braid.field_recalled": {
    ru: "{hero} снят с работы · отдыхает {h} ч",
    en: "{hero} is off work · resting {h} h",
  },
  "braid.field_recall_free": { ru: "Герой уже свободен", en: "The hero is already free" },
  "braid.field_recall_retry": {
    ru: "Снять не вышло — попробуй ещё раз",
    en: "Recall failed — try again",
  },
  "braid.field_recall_not_yours": { ru: "Это не твой герой", en: "This isn't your hero" },
  "braid.hero_resting": { ru: "Герой отдыхает", en: "The hero is resting" },
  // Основной не батрачит (владелец 29.09): работает — значит не основной.
  "braid.field_hero_is_main": {
    ru: "Основного героя на грядку не поставить — он основной",
    en: "Your main hero can't work the field — they're your main hero",
  },
  "braid.field_hero_main": { ru: "основной", en: "main" },
  "braid.field_place_retry": {
    ru: "Поставить не вышло — попробуй ещё раз",
    en: "Couldn't place the hero — try again",
  },
  "braid.hero_rest_left": { ru: "отдых {time}", en: "rest {time}" },
  // Отказы ручек героя ключом (heroes-skill.ts); hero.skill_* — в braid-hero-skill.ts.
  "hero.not_found": { ru: "Герой не найден", en: "Hero not found" },
  "hero.not_yours": { ru: "Это не твой герой", en: "This isn't your hero" },
  // Герой уже батрачит на другом поле — где именно (координаты поля).
  "braid.field_busy_at": { ru: "ферма {at}", en: "farm {at}" },
  // Улучшения игрока за алмаз (lib/accountUpgrade, 31.10.2026).
  "upgrade.buy": {
    ru: "Улучшить: фермы +{pct}% и +1 ячейка склада · 💎{n}",
    en: "Upgrade: farms +{pct}% and +1 storage cell · 💎{n}",
  },
  "upgrade.done": { ru: "Улучшено", en: "Upgraded" },
  "upgrade.no_diamonds": { ru: "Нужен алмаз", en: "You need a diamond" },
  "upgrade.failed": { ru: "Не удалось улучшить", en: "Upgrade failed" },
};
