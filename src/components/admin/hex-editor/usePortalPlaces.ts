// Этажи и комнаты для настройки портала: чтение и правки (server: floors.ts,
// portal-rooms.ts). Ключи общие: завёл этаж или комнату у одного портала —
// список обновился у всех открытых.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminCreateFloor,
  adminDropFloor,
  adminPortalPlaces,
  adminRenameFloor,
} from "@/server/api/beta-raid/floors";
import { adminPortalRooms } from "@/server/api/beta-raid/portal-rooms";
import type { FloorPlaces, PortalRooms } from "@/lib/portalFloors";

const placesKey = (mapId: string | null) => ["admin", "portal-places", mapId ?? "here"] as const;
export const roomsKey = (mapId: string) => ["admin", "portal-rooms", mapId] as const;

/** Запрос комнат этажа — и для хука, и для qc.fetchQuery при смене этажа. */
export const roomsQuery = (mapId: string) => ({
  queryKey: roomsKey(mapId),
  queryFn: (): Promise<PortalRooms> => adminPortalRooms({ data: { mapId } }),
  staleTime: 60_000,
});

/** mapId — карта, где стоит портал; пусто — та, где админ (решает сервер). */
export function usePortalPlaces(mapId: string | null) {
  return useQuery({
    queryKey: placesKey(mapId),
    queryFn: () => adminPortalPlaces({ data: mapId ? { mapId } : {} }),
    staleTime: 60_000,
  });
}

export function usePortalRooms(mapId: string | null) {
  return useQuery({ ...roomsQuery(mapId ?? "-"), enabled: !!mapId });
}

/** Создать, переименовать и снять этаж. Ответ — свежий список этажей. */
export function useFloorEdits(mapId: string | null, here: string) {
  const qc = useQueryClient();
  const onSuccess = (p: FloorPlaces) => {
    qc.setQueryData(placesKey(mapId), p);
    // Другие порталы держат список под своими ключами — пусть перечитают.
    void qc.invalidateQueries({ queryKey: ["admin", "portal-places"] });
  };
  const create = useMutation({
    mutationFn: (v: { mapId: string; name: string }) =>
      adminCreateFloor({ data: { here, mapId: v.mapId, name: v.name } }),
    onSuccess,
  });
  const rename = useMutation({
    mutationFn: (v: { mapId: string; name: string }) =>
      adminRenameFloor({ data: { here, mapId: v.mapId, name: v.name } }),
    onSuccess,
  });
  const drop = useMutation({
    mutationFn: (v: { mapId: string }) => adminDropFloor({ data: { here, mapId: v.mapId } }),
    onSuccess,
  });
  return { create, rename, drop };
}
