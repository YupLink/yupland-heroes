// Строка «Точка спавна» в окне клетки (режим бога): есть точка — сколько мобов
// живы и «настроить», нет — «поставить». Настройка — окно SpawnPointEditor
// (правила — lib/raid/spawnPoint). Ставится на любую клетку.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLang } from "@/lib/i18n";
import { adminSpawnPointAt } from "@/server/api/beta-raid/spawn-point/spawn-point-api";
import { Row, btn } from "@/components/beta-raid/AdminCellRow";
import { SpawnPointEditor } from "./SpawnPointEditor";

export function AdminSpawnPointRow({ q, r }: { q: number; r: number }) {
  const en = useLang() === "en";
  const p = (ru: string, e: string) => (en ? e : ru);
  const [open, setOpen] = useState(false);
  const at = useQuery({
    queryKey: ["admin-spawn-point", q, r],
    queryFn: () => adminSpawnPointAt({ data: { q, r } }),
  });
  if (at.isLoading) return null;
  const point = at.data?.point ?? null;

  return (
    <Row label={p("Точка спавна", "Spawn point")}>
      {point && (
        <span className="text-[11px] text-muted-foreground">
          {p(
            `на карте ${point.alive} из ${point.slots}`,
            `${point.alive} of ${point.slots} on the map`,
          )}
        </span>
      )}
      <button type="button" className={btn} onClick={() => setOpen(true)}>
        {point ? p("настроить", "set up") : p("поставить", "place")}
      </button>
      {open && (
        <SpawnPointEditor q={q} r={r} point={point} en={en} onClose={() => setOpen(false)} />
      )}
    </Row>
  );
}
