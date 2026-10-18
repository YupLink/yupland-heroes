// Ратуша замка → «Казино» (владелец, 14.10.2026): постройка за ресурсы, без
// уровней. Построено (у админа — сразу) — здание стоит на площади замка
// (useWithCasino), тут же кнопка «Играть». Цена — lib/castleCasino.ts.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dices, Hammer, Loader2 } from "lucide-react";
import { buildCastleCasino, getCastleCasino } from "@/server/api/slot/castle-casino";
import type { CasinoCost } from "@/lib/castleCasino";
import { CasinoOverlay } from "@/components/beta-raid/CasinoOverlay";
import { CASINO_LOOK } from "./modularCasino";
import { CASTLE_CASINO_KEY } from "./useWithCasino";

const RES: Array<{ key: keyof CasinoCost; icon: string }> = [
  { key: "wood", icon: "/resources/wood.webp" },
  { key: "stone", icon: "/resources/stone.webp" },
  { key: "gold", icon: "/resources/gold.webp" },
  { key: "diamonds", icon: "/resources/crystal.webp" },
];

export function TownHallCasino({ ru }: { ru: boolean }) {
  const qc = useQueryClient();
  const [playing, setPlaying] = useState(false);
  const q = useQuery({ queryKey: CASTLE_CASINO_KEY, queryFn: () => getCastleCasino() });
  const refresh = () =>
    void Promise.allSettled([
      qc.invalidateQueries({ queryKey: CASTLE_CASINO_KEY }),
      qc.invalidateQueries({ queryKey: ["my-resources"] }),
    ]);
  const build = useMutation({
    mutationFn: () => buildCastleCasino({ data: { opId: crypto.randomUUID() } }),
    onSuccess: () => {
      toast.success(ru ? "Казино построено" : "Casino built");
      refresh();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : String(e));
      refresh();
    },
  });
  const c = q.data;
  if (!c) {
    return (
      <section className="town-hall-build town-hall-build--loading">
        <Loader2 className="town-hall-build__spin animate-spin" aria-hidden="true" />
      </section>
    );
  }
  const short = (k: keyof CasinoCost) => (c.resources[k] ?? 0) < c.cost[k];
  return (
    <section className="town-hall-build" aria-label={ru ? "Казино" : "Casino"}>
      <div className="town-hall-build__looks">
        <img className={c.built ? undefined : "town-hall-build__next"} src={CASINO_LOOK} alt="" />
      </div>
      <div className="town-hall-build__info">
        <h2>{ru ? "Казино" : "Casino"}</h2>
        <p>
          <span>{c.built ? (ru ? "построено" : "built") : ru ? "не построено" : "not built"}</span>
        </p>
      </div>
      {c.built ? (
        <button type="button" className="town-hall-build__go" onClick={() => setPlaying(true)}>
          <Dices aria-hidden="true" />
          {ru ? "Играть" : "Play"}
        </button>
      ) : (
        <>
          <div className="town-hall-build__cost">
            {RES.map((r) => (
              <span key={r.key} className={short(r.key) ? "town-hall-build__lack" : undefined}>
                <img src={r.icon} alt="" />
                {c.cost[r.key].toLocaleString(ru ? "ru-RU" : "en-US")}
              </span>
            ))}
          </div>
          <button
            type="button"
            className="town-hall-build__go"
            disabled={build.isPending || RES.some((r) => short(r.key))}
            onClick={() => build.mutate()}
          >
            {build.isPending ? (
              <Loader2 className="town-hall-build__spin animate-spin" />
            ) : (
              <Hammer aria-hidden="true" />
            )}
            {ru ? "Построить" : "Build"}
          </button>
        </>
      )}
      <CasinoOverlay open={playing} onClose={() => setPlaying(false)} />
    </section>
  );
}
