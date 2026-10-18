// Ратуша замка → «Банк» (владелец, 14.10.2026): пока только админам — остальным
// карточки нет. Постройка за ресурсы, без уровней (потом она же — лицензия на
// продажу золота за DARAI). «Открыть» — пулы банка; админу доступно и до постройки.
// Цена — lib/castleBank.ts.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Hammer, Landmark, Loader2 } from "lucide-react";
import { buildCastleBank } from "@/server/api/bank/castle-bank";
import type { BankCost } from "@/lib/castleBank";
import { openBank } from "@/lib/bankBus";
import { BANK_LOOK } from "./modularBank";
import { CASTLE_BANK_KEY, useCastleBank } from "./useWithBank";

const RES: Array<{ key: keyof BankCost; icon: string }> = [
  { key: "wood", icon: "/resources/wood.webp" },
  { key: "stone", icon: "/resources/stone.webp" },
  { key: "gold", icon: "/resources/gold.webp" },
  { key: "diamonds", icon: "/resources/crystal.webp" },
];

export function TownHallBank({ ru }: { ru: boolean }) {
  const qc = useQueryClient();
  const q = useCastleBank();
  const refresh = () =>
    void Promise.allSettled([
      qc.invalidateQueries({ queryKey: CASTLE_BANK_KEY }),
      qc.invalidateQueries({ queryKey: ["my-resources"] }),
    ]);
  const build = useMutation({
    mutationFn: () => buildCastleBank({ data: { opId: crypto.randomUUID() } }),
    onSuccess: () => {
      toast.success(ru ? "Банк построен" : "Bank built");
      refresh();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : String(e));
      refresh();
    },
  });
  const c = q.data;
  if (!c?.visible) return null;
  const short = (k: keyof BankCost) => (c.resources[k] ?? 0) < c.cost[k];
  return (
    <section className="town-hall-build" aria-label={ru ? "Банк" : "Bank"}>
      <div className="town-hall-build__looks">
        <img className={c.built ? undefined : "town-hall-build__next"} src={BANK_LOOK} alt="" />
      </div>
      <div className="town-hall-build__info">
        <h2>{ru ? "Банк" : "Bank"}</h2>
        <p>
          <span>{c.built ? (ru ? "построен" : "built") : ru ? "не построен" : "not built"}</span>
        </p>
      </div>
      {!c.built && (
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
      <button type="button" className="town-hall-build__go" onClick={() => openBank()}>
        <Landmark aria-hidden="true" />
        {ru ? "Открыть" : "Open"}
      </button>
    </section>
  );
}
