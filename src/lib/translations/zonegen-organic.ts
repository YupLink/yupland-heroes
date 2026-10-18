// Живой рост в панели генератора (владелец, 25.09.2026 — «чтобы был АЛГОРИТМ,
// а не придуманный рандомный расстановочный паттерн»): «Как строить»,
// автоподбор состава, темы обликов и формы поселений в отчёте.
//
// Отдельный словарь: zonegen.ts упирается в потолок 250 строк, а zonegen-town.ts
// — про шаблоны города. Формы — по классификации сельских форм из
// docs/town-generation-algorithm.json (forms): ключ `zonegen.form_<форма>`.
import type { Lang } from "../store";

export const dict: Record<string, Record<Lang, string>> = {
  // ─── Как строить ───
  "zonegen.set_how": { ru: "Как строить", en: "How to build" },
  "zonegen.layout_organic": { ru: "Живой рост", en: "Organic growth" },
  "zonegen.layout_organic_hint": {
    ru: "растёт от въездов к площади, как настоящие поселения",
    en: "grows from the entrances to the square, like real settlements",
  },

  // ─── Автоподбор состава ───
  "zonegen.set_auto": { ru: "Автоподбор состава", en: "Auto-pick the set" },
  "zonegen.set_n_buildings": { ru: "Сколько построек", en: "Buildings" },
  "zonegen.set_kind": { ru: "Что строим", en: "What to build" },
  "zonegen.kind_auto": { ru: "по месту", en: "by the site" },
  "zonegen.kind_camp": { ru: "лагерь", en: "camp" },
  "zonegen.kind_hamlet": { ru: "хутор", en: "hamlet" },
  "zonegen.kind_village": { ru: "деревня", en: "village" },
  "zonegen.kind_town": { ru: "городок", en: "town" },
  "zonegen.kind_port": { ru: "порт", en: "port" },
  "zonegen.set_theme": { ru: "Тема", en: "Theme" },
  "zonegen.set_theme_random": { ru: "Случайная", en: "Random" },
  "zonegen.set_theme_none": { ru: "без обликов", en: "no skins" },
  "zonegen.set_reroll": { ru: "Другая подборка", en: "Another pick" },
  "zonegen.set_reroll_title": {
    ru: "новый сид и сразу генерация: другой состав, тема и расстановка",
    en: "a new seed and generate right away: another set, theme and layout",
  },

  // ─── Отчёт: форма выходит из числа построек, въездов и воды ───
  "zonegen.set_report_form": {
    ru: "Форма: {form} · тема: {theme} · въездов: {gates} · построек: {buildings} · улиц: {road} кл.",
    en: "Form: {form} · theme: {theme} · entrances: {gates} · buildings: {buildings} · streets: {road} cells",
  },
  "zonegen.form_camp": { ru: "лагерь", en: "camp" },
  "zonegen.form_hamlet": { ru: "хутор", en: "hamlet" },
  "zonegen.form_street": { ru: "уличная деревня", en: "street village" },
  "zonegen.form_round": { ru: "круглая деревня", en: "round village" },
  "zonegen.form_green": { ru: "луговая деревня", en: "village green" },
  "zonegen.form_cluster": { ru: "кучевая деревня", en: "clustered village" },
  "zonegen.form_town": { ru: "городок с площадью", en: "town with a square" },
  "zonegen.form_port": { ru: "порт", en: "port" },
};
