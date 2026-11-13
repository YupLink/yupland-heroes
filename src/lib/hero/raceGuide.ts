type RaceDetail = { strength: string; effect: string };

const details: Record<string, Record<"ru" | "en", RaceDetail>> = {
  Пчела: {
    ru: { strength: "Скорость", effect: "На шаги по суше уходит меньше энергии. Ты можешь пройти дальше до отдыха." },
    en: { strength: "Speed", effect: "Moving on land costs less energy, so you can travel farther before resting." },
  },
  Кабан: {
    ru: { strength: "Броня", effect: "Враги чаще промахиваются по фишкам твоего отряда." },
    en: { strength: "Armor", effect: "Enemies are more likely to miss the units in your squad." },
  },
  ДраКошка: {
    ru: { strength: "Атака", effect: "Фишки твоего отряда сильнее бьют врагов." },
    en: { strength: "Attack", effect: "The units in your squad deal more damage." },
  },
  Юпик: {
    ru: { strength: "Интеллект", effect: "Больше энергии, она быстрее восстанавливается. Заклинания дешевле и быстрее готовы к применению." },
    en: { strength: "Intellect", effect: "You have more energy and recover it faster. Spells cost less and are ready to use sooner." },
  },
  Единорог: {
    ru: { strength: "Удача", effect: "Фишки чаще наносят дополнительный урон в бою. На награды удача не влияет." },
    en: { strength: "Luck", effect: "Your units deal bonus damage more often in combat. Luck does not affect rewards." },
  },
  Дракон: {
    ru: { strength: "Здоровье", effect: "У фишек твоего отряда больше здоровья — они дольше держатся в бою." },
    en: { strength: "Health", effect: "The units in your squad have more health and last longer in combat." },
  },
};

export const raceGuide = (race: string, lang: "ru" | "en"): RaceDetail | undefined =>
  Object.hasOwn(details, race) ? details[race][lang] : undefined;
