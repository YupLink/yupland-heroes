// Строка «Возрождение» в окне клетки (режим бога): точка, где моб сам встаёт
// после смерти и бродит вокруг. Три списка и две кнопки — правила в
// server/api/beta-raid/mob-spawn/mob-spawn.ts. Сохраняется сразу, без «Выгрузить»:
// это не слой клетки, а настройка моба.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import {
  MOB_SPAWN_DEFAULT,
  RESPAWN_MIN,
  ROAM_CELLS,
  STEP_MIN,
  minutesText,
} from "@/lib/raid/mobSpawn";
import {
  adminMobSpawnAt,
  adminRemoveMobSpawn,
  adminSaveMobSpawn,
} from "@/server/api/beta-raid/mob-spawn/mob-spawn-api";
import { Row, btn } from "./AdminCellRow";

const field = "rounded-lg border border-border bg-background px-1.5 py-1 text-[11px]";

export function AdminMobSpawnRow({ q, r }: { q: number; r: number }) {
  const en = useLang() === "en";
  const p = (ru: string, e: string) => (en ? e : ru);
  const qc = useQueryClient();
  const key = ["admin-mob-spawn", q, r];
  const at = useQuery({ queryKey: key, queryFn: () => adminMobSpawnAt({ data: { q, r } }) });
  const spawn = at.data?.spawn ?? null;

  const [respawnMin, setRespawn] = useState<number>(MOB_SPAWN_DEFAULT.respawnMin);
  const [roam, setRoam] = useState<number>(MOB_SPAWN_DEFAULT.roam);
  const [stepMin, setStep] = useState<number>(MOB_SPAWN_DEFAULT.stepMin);
  useEffect(() => {
    if (!spawn) return;
    setRespawn(spawn.respawnMin);
    setRoam(spawn.roam);
    setStep(spawn.stepMin);
  }, [spawn]);

  const done = (text: string) => {
    toast.success(text);
    void qc.invalidateQueries({ queryKey: key });
  };
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e));
  const save = useMutation({
    mutationFn: () => adminSaveMobSpawn({ data: { q, r, respawnMin, roam, stepMin } }),
    onSuccess: () => done(p("Возрождение сохранено", "Respawn saved")),
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: () => adminRemoveMobSpawn({ data: { id: spawn!.id } }),
    onSuccess: () => done(p("Возрождение убрано", "Respawn removed")),
    onError: fail,
  });

  if (!spawn && !at.data?.canCreate) return null;
  const changed =
    !spawn || spawn.respawnMin !== respawnMin || spawn.roam !== roam || spawn.stepMin !== stepMin;
  const busy = save.isPending || remove.isPending;

  return (
    <Row label={p("Возрождение", "Respawn")}>
      <select className={field} value={respawnMin} onChange={(e) => setRespawn(+e.target.value)}>
        {RESPAWN_MIN.map((m) => (
          <option key={m} value={m}>
            {p("через", "in")} {minutesText(m, en)}
          </option>
        ))}
      </select>
      <select className={field} value={roam} onChange={(e) => setRoam(+e.target.value)}>
        {ROAM_CELLS.map((n) => (
          <option key={n} value={n}>
            {n === 0 ? p("стоит", "stays") : p(`бродит ${n} кл.`, `roams ${n} tiles`)}
          </option>
        ))}
      </select>
      {roam > 0 && (
        <select className={field} value={stepMin} onChange={(e) => setStep(+e.target.value)}>
          {STEP_MIN.map((m) => (
            <option key={m} value={m}>
              {p("шаг", "step")} {minutesText(m, en)}
            </option>
          ))}
        </select>
      )}
      {spawn && !spawn.alive && (
        <span className="text-[11px] text-muted-foreground">
          {spawn.dueInMin
            ? p(
                `встанет через ${minutesText(spawn.dueInMin, en)}`,
                `back in ${minutesText(spawn.dueInMin, en)}`,
              )
            : p("ждёт свободную клетку", "waiting for a free tile")}
        </span>
      )}
      {changed && (
        <button type="button" className={btn} disabled={busy} onClick={() => save.mutate()}>
          {spawn ? p("сохранить", "save") : p("включить", "turn on")}
        </button>
      )}
      {spawn && (
        <button type="button" className={btn} disabled={busy} onClick={() => remove.mutate()}>
          {p("убрать", "remove")}
        </button>
      )}
    </Row>
  );
}
