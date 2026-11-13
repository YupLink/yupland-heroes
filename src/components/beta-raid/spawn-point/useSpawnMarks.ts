// Точки спавна карты для значков режима бога: пока режим бога включён — список
// с сервера в spawnMarks (кадр карты рисует сам), выключили — значков нет.
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminListSpawnPoints } from "@/server/api/beta-raid/spawn-point/spawn-template-api";
import { setSpawnMarks } from "./spawnMarks";

export const SPAWN_POINTS_KEY = ["admin-spawn-points"] as const;

export function useSpawnMarks(on: boolean): void {
  const list = useQuery({
    queryKey: SPAWN_POINTS_KEY,
    queryFn: () => adminListSpawnPoints(),
    enabled: on,
    staleTime: 30_000,
  });
  const data = on ? list.data : undefined;
  useEffect(() => {
    setSpawnMarks(data?.mapId ?? null, data?.points ?? null);
  }, [data]);
  useEffect(() => () => setSpawnMarks(null, null), []);
}
