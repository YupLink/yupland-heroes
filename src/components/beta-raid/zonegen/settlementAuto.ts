// Живой рост и автоподбор в панели поселений: чистая арифметика без React.
//
// Владелец, 25.09.2026: «нужно, чтобы ты рандомно делал подборки; чтобы
// предустановки расставлялись автоматически и работали как следует». При живом
// росте состав подбирает сервер от сида (docs/town-generation-algorithm.json,
// шаг 1: канон разблокировки служб + модели жребием без повторов), а панели
// остаётся решить, КОГДА показывать ручной список и как назвать итог.
import type { BlueprintBody } from "@/lib/raid/zonegen/blueprint-types";
import type { SettlementLayout, SettlementRecipe } from "@/lib/raid/zonegen/settlement-types";
import { activeSlots } from "./settlementSlots";

/** Границы «Сколько построек» — те же, что у settlementRecipeSchema.buildings. */
export const BUILDINGS_MIN = 3;
export const BUILDINGS_MAX = 40;

/** Тема обликов из справочника: слово из имён обликов и у скольких ролей города она есть. */
export type ZoneTheme = { theme: string; coverage: number };

/**
 * Ручной состав в игре, когда планировка трафаретная (кольцо, крест, кварталы
 * и россыпь собирают город только из списка) или живой рост без автоподбора.
 */
export const usesManualSet = (s: Pick<SettlementRecipe, "layout" | "auto">): boolean =>
  s.layout !== "organic" || !s.auto;

/**
 * Живой рост сам выводит поперечник и плотность из числа построек: радиус —
 * минимальный R, при котором 3R²+3R+1 клеток с долей ρ(N) вмещают N (шаг 2
 * спецификации). Ручки «Поперечник» и «Плотность» тогда только спорили бы с ним.
 */
export const derivesShape = (layout: SettlementLayout): boolean => layout === "organic";

/** Строка темы в селекте: «Кабан · 14» — у скольких ролей города есть её облик. */
export const themeLabel = (t: ZoneTheme): string => `${t.theme} · ${t.coverage}`;

/**
 * Темы для селекта: справочник плюс выбранная, если её там уже нет (облики
 * переименовали). Без неё select молча показал бы «Случайная», а на сервер
 * ушло бы старое слово — экран и прогон разошлись бы.
 */
export function themeChoices(themes: ZoneTheme[], current: string): ZoneTheme[] {
  if (current === "" || themes.some((t) => t.theme === current)) return themes;
  return [...themes, { theme: current, coverage: 0 }];
}

/** Поле ввода числа построек → число в границах; мусор — null (ждём ввода дальше). */
export function parseBuildings(raw: string): number | null {
  const n = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(n)) return null;
  const whole = Math.round(n);
  return whole >= BUILDINGS_MIN && whole <= BUILDINGS_MAX ? whole : null;
}

/** Ключ словаря формы поселения (лагерь, хутор, уличная деревня…). */
export const formKey = (form: string): string => `zonegen.form_${form}`;

/**
 * Шаблон → правка рецепта. Автоподбор переносится как сохранён: живые шаблоны
 * (25.09) приезжают с auto и масштабом, а свои шаблоны до 25.09 сервер отдаёт
 * с auto = false — это ручные наборы владельца («наборы я уже сделал, а потом
 * просто расположение менять», 24.09), и автоподбор их не затирает.
 *
 * У готовых шаблонов дороги нет (справочник дорог на каждой карте свой), но и
 * обнулять уже выбранную мостовую глупо — город без улиц выглядит пустырём.
 * Свой шаблон «без дороги» сохранён осознанно и переносится как есть.
 */
export function blueprintPatch(
  body: BlueprintBody,
  current: Pick<SettlementRecipe, "roadId">,
  preset: boolean,
): Partial<SettlementRecipe> {
  const roadId = preset && body.roadId === null ? current.roadId : body.roadId;
  return { ...body, roadId };
}

/**
 * Есть ли что сохранить шаблоном. При автоподборе состав — это число построек
 * и тема, пустой список не пустота; при ручном — без строк сохранять нечего.
 */
export const canSaveBlueprint = (s: Pick<SettlementRecipe, "layout" | "auto" | "slots">): boolean =>
  !usesManualSet(s) || activeSlots(s.slots) > 0;
