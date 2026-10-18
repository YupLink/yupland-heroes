// Справочник для панели поселений: что вообще можно поставить.
//
// Отдельной ручкой, а не довеском к генерации: панель показывает список ДО
// того, как админ нажмёт «Сгенерировать», — иначе выбирать постройки не из
// чего. Ответ маленький (82 постройки и 7 дорог) и кэширован на пять минут в
// catalog-buildings, так что открытая панель базу не тревожит.
import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/server/auth";
import type { BuildingOption } from "@/lib/raid/zonegen/settlement-types";
import { toRoleOptions } from "@/lib/raid/zonegen/town/roles";
import { themesOf } from "@/lib/raid/zonegen/town/theme";
import type { CatalogItem } from "./catalog";
import { loadBuildingOptions, loadRoadOptions } from "./catalog-buildings";

export type ZoneBuildingsOutput = { buildings: BuildingOption[]; roads: CatalogItem[] };

/** Постройки и дороги для панели «Генератор зоны» — под гардом админа. */
export const adminZoneBuildings = createServerFn({ method: "GET" }).handler(
  async (): Promise<ZoneBuildingsOutput> => {
    requireAdmin();
    const [buildings, roads] = await Promise.all([loadBuildingOptions(), loadRoadOptions()]);
    return { buildings, roads };
  },
);

export type ZoneThemesOutput = { themes: Array<{ theme: string; coverage: number }> };

/**
 * Темы обликов для выбора в панели: «Юпик», «Кабан», «Дракон»… с охватом — в
 * скольких РОЛЯХ города у темы есть облик. Считается из того же справочника
 * (облики групп владельца, raid_building_group.template_id), что и расстановка,
 * поэтому в списке ровно те темы, которыми генератор сможет покрасить город.
 */
export const adminZoneThemes = createServerFn({ method: "GET" }).handler(
  async (): Promise<ZoneThemesOutput> => {
    requireAdmin();
    return { themes: themesOf(toRoleOptions(await loadBuildingOptions())) };
  },
);
