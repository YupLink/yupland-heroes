// Этажи и комнаты порталов — общее для сервера и редактора.
//
// Этаж — карта с номером и названием (первый — главный мир). Комната — номер
// сети портала на этаже: подпись «2.3» значит этаж 2, комната 3. Комната на
// карте, которая не этаж (черновик), подписывается одним номером.
import type { PortalGroupNames } from "@/lib/portal";

export type Floor = { mapId: string; num: number; name: string; mapName: string };

export type FloorPlaces = {
  /** Карта, на которой настраивают портал: её комнаты предлагаются первыми. */
  here: string;
  floors: Floor[];
  /** Карты, из которых можно сделать новый этаж. */
  free: Array<{ id: string; name: string }>;
};

/** Комнаты этажа: имена с преднастройками и сколько порталов в каждой. */
export type PortalRooms = { names: PortalGroupNames; counts: Record<string, number> };

/** Подпись комнаты: «2.3», а на карте-черновике — просто «3». */
export function roomLabel(floors: readonly Floor[], mapId: string, group: number): string {
  const f = floors.find((x) => x.mapId === mapId);
  return f ? `${f.num}.${group}` : String(group);
}

/** Этаж в списке: «2 · Мир лабиринта». */
export const floorLabel = (f: Floor): string => `${f.num} · ${f.name}`;

/** Номера комнат этажа по порядку: названные и те, где уже стоят порталы. */
export function roomNumbers(rooms: PortalRooms): number[] {
  const nums = [...Object.keys(rooms.names), ...Object.keys(rooms.counts)].map(Number);
  return [...new Set(nums)].filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
}
