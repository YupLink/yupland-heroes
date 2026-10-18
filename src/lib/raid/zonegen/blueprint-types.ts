// Шаблон города: СОСТАВ плюс ПЛАНИРОВКА, сохранённые под именем.
//
// Владелец, 24.09.2026: «Надо составлять шаблоны городов: примерные
// расположения, что должно быть в городе и какие их виды — условно
// город-подземелье, город адский. Наборы я уже сделал, их бы в шаблоны, а
// потом просто расположение менять».
//
// Что шаблон НЕ помнит: сид, число поселений по зоне и сами клетки. «Что
// стоит и как стоит» — это шаблон, «где стоит» — выделение на карте. Поэтому
// один «адский город» разворачивается и в углу карты, и на острове.
//
// Тип живёт в lib, а не в server: панель импортирует его отсюда, и серверный
// модуль (а с ним мост к базе) в клиентский бандл не утекает.
import { z } from "zod";
import { settlementRecipeSchema } from "./settlement-types";

/** Имя шаблона в списке: длиннее шестидесяти — это уже не имя, а описание. */
export const BLUEPRINT_NAME_MAX = 60;

/**
 * Тело шаблона — ровно те поля рецепта, которые переносятся между зонами.
 * `pick` от общей схемы, а не копия: добавят поле в рецепт — здесь не забудут.
 * Нет `enabled` (шаблон включают выбором), `preset` (он уже развёрнут в слоты)
 * и `count` (сколько поселений — решение конкретного прогона, не шаблона).
 *
 * `auto`, `buildings`, `kind`, `theme` (25.09) — автоподбор органического роста:
 * «Живой городок» хранит не состав, а масштаб и тему, и каждый сид собирает
 * новую подборку. Ручной состав (`slots`) остаётся на случай «автоподбор выкл.».
 */
export const blueprintBodySchema = settlementRecipeSchema.pick({
  layout: true,
  size: true,
  density: true,
  slots: true,
  roadId: true,
  built: true,
  auto: true,
  buildings: true,
  kind: true,
  theme: true,
});
export type BlueprintBody = z.infer<typeof blueprintBodySchema>;

export type TownBlueprint = BlueprintBody & {
  id: string;
  name: string;
  /** Пометка автора: «адский, под вулкан» — чтобы не гадать по имени. */
  note: string | null;
  /** Когда переписали. У предустановленных — null: их никто не пишет. */
  updatedAt: string | null;
};

/**
 * Предустановленные шаблоны в базе не лежат — они считаются из справочника
 * при каждом открытии списка (справочник меняется, «Городок» должен меняться
 * вместе с ним). Отсюда и префикс: по нему сервер отказывает в перезаписи и
 * удалении, а панель предлагает «сохранить как свой».
 */
export const PRESET_BLUEPRINT_PREFIX = "preset:";
export const isPresetBlueprint = (id: string): boolean => id.startsWith(PRESET_BLUEPRINT_PREFIX);

/** Ключ перевода имени предустановленного шаблона: `preset:town-organic` → `zonegen.bp.town_organic`. */
export const presetNameKey = (id: string): string =>
  `zonegen.bp.${id.slice(PRESET_BLUEPRINT_PREFIX.length).replace(/-/g, "_")}`;
