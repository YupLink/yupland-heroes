// Шаблоны города в панели генератора: строка выбора, имена готовых шаблонов и
// их пометки.
//
// Отдельный словарь, а не хвост zonegen.ts: тот упирался в потолок 250 строк.
// Имена готовых шаблонов считаются из id (presetNameKey), пометка — тот же
// ключ плюс `_note`; русские запасные тексты приезжают с сервера
// (blueprint-presets.ts), здесь их перевод.
import type { Lang } from "../store";

export const dict: Record<string, Record<Lang, string>> = {
  // ─── Шаблоны города ───
  "zonegen.bp_label": { ru: "Шаблон", en: "Template" },
  "zonegen.bp_pick": { ru: "выбери шаблон", en: "pick a template" },
  "zonegen.bp_presets": { ru: "Готовые", en: "Built-in" },
  "zonegen.bp_mine": { ru: "Свои", en: "Mine" },
  "zonegen.bp_apply": { ru: "Применить", en: "Apply" },
  "zonegen.bp_apply_title": {
    ru: "перенести в рецепт планировку, размер, плотность, дорогу и состав",
    en: "copy layout, size, density, road and set into the recipe",
  },
  "zonegen.bp_save": { ru: "Сохранить как…", en: "Save as…" },
  "zonegen.bp_save_do": { ru: "Сохранить", en: "Save" },
  "zonegen.bp_name": { ru: "имя шаблона", en: "template name" },
  "zonegen.bp_delete": { ru: "Удалить", en: "Delete" },
  "zonegen.bp_delete_confirm": { ru: "Точно удалить?", en: "Delete for sure?" },
  "zonegen.bp_applied": { ru: "Перенесено: {name}", en: "Applied: {name}" },
  // Имена готовых шаблонов: ключ считается из id (presetNameKey).
  "zonegen.bp.town_organic": { ru: "Живой городок", en: "Living town" },
  "zonegen.bp.village_organic": { ru: "Живая деревня", en: "Living village" },
  "zonegen.bp.port": { ru: "Порт", en: "Port" },
  "zonegen.bp.hamlet": { ru: "Хутор", en: "Hamlet" },
  "zonegen.bp.camp": { ru: "Лагерь", en: "Camp" },
  "zonegen.bp_empty_set": {
    ru: "состав пуст — сохранять нечего",
    en: "the set is empty — nothing to save",
  },

  // Пометки готовых: тексты те же, что фолбэк в blueprint-presets.ts.
  "zonegen.bp.town_organic_note": {
    ru: "Ратуша на площади, улицы от въездов, службы по соседству, дома к краю.",
    en: "Town hall on the square, streets from the gates, services side by side, houses to the edge.",
  },
  "zonegen.bp.village_organic_note": {
    ru: "Форму выбирает место: уличная, круглая или луговая — по въездам и воде.",
    en: "The site picks the shape: street, round or green village — by gates and water.",
  },
  "zonegen.bp.port_note": {
    ru: "Площадь у причала, склады и верфь на берегу, ремёсла — подальше от воды.",
    en: "Square by the pier, warehouses and shipyard on the shore, crafts away from the water.",
  },
  "zonegen.bp.hamlet_note": {
    ru: "Несколько дворов на отростке дороги, без площади и служб.",
    en: "A few yards on a road spur, no square and no services.",
  },
  "zonegen.bp.camp_note": {
    ru: "Тесный круг у костра, один въезд, найм у края.",
    en: "A tight ring around the fire, one gate, recruiters at the edge.",
  },
};
