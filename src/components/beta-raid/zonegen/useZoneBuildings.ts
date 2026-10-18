// Справочник построек и дорог для блока поселений.
//
// Отдельный запрос, а не useAssets("building"): палитре хватает картинки и
// имени, а генератору нужно знать ЭФФЕКТ (шахта это или дом), число тиров
// (ставить достроенной) и требует ли постройка своего building_config —
// всё это лежит в meta шаблона и считается на сервере.
//
// Справочник меняется раз в неделю, а панель открывают десятки раз за сессию:
// пять минут свежести — это ноль лишних запросов при переключении кисти.
import { useQuery } from "@tanstack/react-query";
import type { BuildingOption } from "@/lib/raid/zonegen/settlement-types";
import { adminZoneBuildings } from "@/server/api/beta-raid/zonegen/catalog-api";

/** Дорога для связки построек: id + имя, больше генератору не нужно. */
export type ZoneRoadOption = { id: string; name: string };

export type ZoneBuildingsData = { buildings: BuildingOption[]; roads: ZoneRoadOption[] };

export function useZoneBuildings(enabled = true) {
  return useQuery<ZoneBuildingsData>({
    queryKey: ["zonegen-buildings"],
    queryFn: () => adminZoneBuildings(),
    staleTime: 5 * 60_000,
    enabled,
  });
}
