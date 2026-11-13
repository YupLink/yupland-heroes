// СТОЛБ ЗАКЛИНАНИЙ: окно постройки, витрина и отказы сервера.
//
// Отдельный файл от книги заклинаний (её экран делают параллельно): ключи
// столба начинаются со `spellpillar.`, а `spell.*` здесь — только те отказы,
// которыми отвечают getSpellPillarOffer / learnSpell / forgetSpell. Сервер
// языка игрока не знает и присылает ключ, а не фразу.
import type { Lang } from "../store";

export const dict: Record<string, Record<Lang, string>> = {
  // ── Окно постройки и витрина ──
  "spellpillar.title": { ru: "Столб заклинаний", en: "Spell pillar" },
  "spellpillar.open": { ru: "Подойти к столбу", en: "Approach the pillar" },
  "spellpillar.learn_price": { ru: "Изучение: {price}", en: "Learning: {price}" },
  "spellpillar.forget_price": { ru: "забвение: {price}", en: "forgetting: {price}" },
  "spellpillar.learn": { ru: "Выучить", en: "Learn" },
  "spellpillar.forget": { ru: "Забыть", en: "Forget" },
  "spellpillar.learned": { ru: "выучено", en: "learned" },
  "spellpillar.hero": { ru: "Книга героя {name}:", en: "{name}'s spellbook:" },
  "spellpillar.slots": { ru: "занято {used} из {total}", en: "{used} of {total} slots used" },
  "spellpillar.empty": {
    ru: "Этот столб пока ничему не учит.",
    en: "This pillar teaches nothing yet.",
  },
  "spellpillar.energy": { ru: "{n} энергии", en: "{n} energy" },
  "spellpillar.req_int": { ru: "интеллект от {n}", en: "intellect {n}+" },
  "spellpillar.no_cooldown": { ru: "без отката", en: "no cooldown" },
  "spellpillar.cd_min": { ru: "откат {n} мин", en: "{n} min cooldown" },
  "spellpillar.cd_h": { ru: "откат {n} ч", en: "{n} h cooldown" },
  "spellpillar.cd_hm": { ru: "откат {h} ч {m} мин", en: "{h} h {m} min cooldown" },
  "spellpillar.kind_ship": {
    ru: "Призывает ближайший свободный корабль к герою",
    en: "Summons the nearest free ship to the hero",
  },
  "spellpillar.kind_big_ship_create": {
    ru: "Спускает большой корабль на воду рядом с героем, и в океан тоже",
    en: "Launches a big ship next to the hero, ocean included",
  },
  "spellpillar.kind_ship_create": {
    ru: "Спускает новый корабль на воду рядом с героем",
    en: "Launches a new ship on the water next to the hero",
  },
  "spellpillar.kind_ship_repair": {
    ru: "Чинит корабль героя или разбитый рядом до полного запаса хода",
    en: "Fully repairs the hero's ship or a damaged one nearby",
  },
  "spellpillar.kind_teleport": {
    ru: "Переносит героя к своему замку",
    en: "Teleports the hero to their castle",
  },
  "spellpillar.learned_toast": { ru: "Выучено: {name}", en: "Learned: {name}" },
  "spellpillar.forgot_toast": { ru: "Забыто: {name}", en: "Forgotten: {name}" },

  // ── Отказы сервера (spell-pillar.ts / spell-learn.ts) ──
  "spell.pillar_not_here": { ru: "Здесь нет столба заклинаний", en: "No spell pillar here" },
  "spell.pillar_unbuilt": { ru: "Столб ещё строится", en: "The pillar is still being built" },
  "spell.pillar_no_price": {
    ru: "Столб не настроен: цена изучения не задана",
    en: "The pillar is not set up: no learning price",
  },
  // Забвение без цены — не «бесплатно», а «этот столб забывать не умеет»:
  // иначе выученное сдувалось бы даром и место в книге ничего не стоило.
  "spell.pillar_no_forget": {
    ru: "Этот столб не помогает забывать заклинания",
    en: "This pillar does not unlearn spells",
  },
  // Общие отказы книги (spell.no_hero, low_int, no_slots, unknown, …) живут в
  // braid-spell.ts: два словаря на один ключ — это два разных текста на один
  // отказ, и какой победит, решал бы порядок склейки в index.ts.
};
