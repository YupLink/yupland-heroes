// Строка «Добыча» в окне клетки (режим бога): точка, где в свою погоду появляется
// мешочек (lib/raid/lootSpawn, владелец 31.10.2026). Что класть — из списков, сколько —
// одно поле «1-10», через сколько и в какую погоду — списки. Сохраняется сразу.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { RESPAWN_MIN, SPAWN_WEATHER, minutesText, spawnWeatherName } from "@/lib/raid/mobSpawn";
import { LOOT_SPAWN_RESOURCES, amountRangeText, type LootSpawnKind } from "@/lib/raid/lootSpawn";
import { RESOURCE_LABELS_RU } from "@/lib/marketItem";
import { fetchRefs } from "./market/refPickerSources";
import {
  adminLootSpawnAt,
  adminRemoveLootSpawn,
  adminSaveLootSpawn,
} from "@/server/api/beta-raid/loot-spawn/loot-spawn-api";
import { Row, btn } from "./AdminCellRow";

const field = "rounded-lg border border-border bg-background px-1.5 py-1 text-[11px]";
const KIND_NAMES: Record<LootSpawnKind, [string, string]> = {
  resource: ["ресурс", "resource"],
  custom: ["товар", "item"],
  art: ["артефакт", "artifact"],
};

export function AdminLootSpawnRow({ q, r }: { q: number; r: number }) {
  const en = useLang() === "en";
  const p = (ru: string, e: string) => (en ? e : ru);
  const qc = useQueryClient();
  const key = ["admin-loot-spawn", q, r];
  const at = useQuery({ queryKey: key, queryFn: () => adminLootSpawnAt({ data: { q, r } }) });
  const spot = at.data?.spot ?? null;

  const [weather, setWeather] = useState<string>("");
  const [kind, setKind] = useState<LootSpawnKind>("resource");
  const [ref, setRef] = useState<string>("gold");
  const [range, setRange] = useState("1-10");
  const [respawnMin, setRespawn] = useState<number>(60);
  useEffect(() => {
    if (!spot) return;
    setWeather(spot.weather ?? "");
    setKind(spot.kind);
    setRef(spot.ref);
    setRange(amountRangeText(spot.min, spot.max));
    setRespawn(spot.respawnMin);
  }, [spot]);

  const refs = useQuery({
    queryKey: ["market-ref", kind, "no-any"],
    queryFn: () => fetchRefs(kind, true),
    enabled: kind !== "resource",
    staleTime: 60_000,
  });
  const options =
    kind === "resource"
      ? LOOT_SPAWN_RESOURCES.map((id) => ({ id, name: RESOURCE_LABELS_RU[id] }))
      : (refs.data ?? []).map((x) => ({ id: x.id, name: x.name }));

  const done = (text: string) => {
    toast.success(text);
    void qc.invalidateQueries({ queryKey: key });
  };
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e));
  const save = useMutation({
    mutationFn: () =>
      adminSaveLootSpawn({
        data: { q, r, weather: weather || null, kind, ref, range, respawnMin },
      }),
    onSuccess: () => done(p("Добыча сохранена", "Loot saved")),
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: () => adminRemoveLootSpawn({ data: { id: spot!.id } }),
    onSuccess: () => done(p("Добыча убрана", "Loot removed")),
    onError: fail,
  });
  if (!at.data) return null;
  const busy = save.isPending || remove.isPending;

  return (
    <Row label={p("Добыча", "Loot")}>
      <select
        className={field}
        value={kind}
        onChange={(e) => {
          const k = e.target.value as LootSpawnKind;
          setKind(k);
          setRef(k === "resource" ? "gold" : "");
        }}
      >
        {(Object.keys(KIND_NAMES) as LootSpawnKind[]).map((k) => (
          <option key={k} value={k}>
            {KIND_NAMES[k][en ? 1 : 0]}
          </option>
        ))}
      </select>
      <select
        className={`${field} max-w-[9rem]`}
        value={ref}
        onChange={(e) => setRef(e.target.value)}
      >
        {!ref && <option value="">—</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <input
        className={`${field} w-16`}
        value={range}
        inputMode="numeric"
        aria-label={p("Сколько", "Amount")}
        onChange={(e) => setRange(e.target.value)}
      />
      <select className={field} value={respawnMin} onChange={(e) => setRespawn(+e.target.value)}>
        {RESPAWN_MIN.map((m) => (
          <option key={m} value={m}>
            {p("через", "in")} {minutesText(m, en)}
          </option>
        ))}
      </select>
      {!at.data.island && (
        <select className={field} value={weather} onChange={(e) => setWeather(e.target.value)}>
          <option value="">{p("любая погода", "any weather")}</option>
          {SPAWN_WEATHER.map((w) => (
            <option key={w} value={w}>
              {spawnWeatherName(w, en)}
            </option>
          ))}
        </select>
      )}
      {spot?.out && <span className="text-[11px] text-gold">{p("лежит", "out")}</span>}
      <button type="button" className={btn} disabled={busy || !ref} onClick={() => save.mutate()}>
        {spot ? p("сохранить", "save") : p("включить", "turn on")}
      </button>
      {spot && (
        <button type="button" className={btn} disabled={busy} onClick={() => remove.mutate()}>
          {p("убрать", "remove")}
        </button>
      )}
    </Row>
  );
}
