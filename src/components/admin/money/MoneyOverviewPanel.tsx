// Вкладка «Счета» в «Магазине» (рядом с «Раздачей DARAI»): что где лежит,
// подписки, что готово к раздаче, что уже разослано, игроки и пул карты.
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { adminMoneyOverview } from "@/server/api/money-overview";
import { MoneyNow } from "./MoneyNow";
import { MoneySubs } from "./MoneySubs";
import { MoneyReady } from "./MoneyReady";
import { MoneyFlows, MoneySent } from "./MoneyHistory";

export function MoneyOverviewPanel() {
  const q = useQuery({
    queryKey: ["admin", "money-overview"],
    queryFn: () => adminMoneyOverview(),
    refetchInterval: 60_000,
  });
  const d = q.data;
  if (!d) {
    return (
      <div className="flex justify-center py-10">
        {q.isError ? (
          <span className="text-[13px] text-destructive">Не удалось загрузить</span>
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        )}
      </div>
    );
  }
  return (
    <div className="grid items-start gap-3 lg:grid-cols-2">
      <MoneyNow now={d.now} />
      {/* subs нет в ответе старого вида (сохранённый кэш) — покажем со свежим. */}
      {d.subs && <MoneySubs subs={d.subs} />}
      <MoneyReady ready={d.ready} />
      <MoneySent sent={d.sent} />
      <MoneyFlows players={d.players} map={d.map} />
    </div>
  );
}
