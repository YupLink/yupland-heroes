// Темы обликов для автоподбора: «Юпик», «Кабан», «Дракон»… с покрытием.
//
// Тема — слово из имён обликов в наборах владельца (raid_building_group →
// raid_building_skin). Покрытие — у скольких ролей города у темы есть облик:
// «Кабан» одевает почти весь город, «Адский» — пару построек, и город в
// «адской» теме выйдет в основном в базовых картинках. Число в селекте это и
// говорит; считает его сервер из того же справочника, что и расстановка.
//
// Наборы обликов правят раз в неделю, а панель открывают десятки раз за
// сессию: пять минут свежести, как у справочника построек.
import { useQuery } from "@tanstack/react-query";
import { adminZoneThemes } from "@/server/api/beta-raid/zonegen/catalog-api";
import type { ZoneTheme } from "./settlementAuto";

export function useZoneThemes(enabled = true) {
  return useQuery<ZoneTheme[]>({
    queryKey: ["zonegen-themes"],
    queryFn: async () => (await adminZoneThemes()).themes,
    staleTime: 5 * 60_000,
    enabled,
  });
}
