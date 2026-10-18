import { useQuery } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { myDaraiDeposits } from "@/server/api/chips-craft";

export function DepositHistory() {
  const t = useT();
  const history = useQuery({
    queryKey: ["my-darai-deposits"],
    queryFn: () => myDaraiDeposits(),
    staleTime: 30_000,
  });

  if ((history.data?.length ?? 0) === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-secondary/10 p-3 space-y-2">
      <div className="text-[11px] font-medium text-muted-foreground">{t("chips.my_deposits")}</div>
      <div className="max-h-40 space-y-1 overflow-y-auto">
        {history.data!.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between gap-2 rounded-md bg-card/60 px-2 py-1.5 text-[11px]"
          >
            <div className="min-w-0">
              <div className="font-mono font-bold text-neon">
                +{Number(d.amount).toLocaleString("ru-RU")}
              </div>
              <div className="truncate text-[9px] text-muted-foreground">
                {new Date(d.created_at).toLocaleString("ru-RU", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
            <div className="truncate font-mono text-[9px] text-muted-foreground" title={d.tx_hash}>
              {d.tx_hash.slice(0, 8)}…
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
