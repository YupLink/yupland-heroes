// Рефка золотом на экране «Друзья» (ПРАВИЛА §8.101): доля с покупок друзей,
// сколько придёт ночью и сколько золота с друзей меняется на DARAI без лимита.
import { useQuery } from "@tanstack/react-query";
import { HandCoins } from "lucide-react";
import { getRefGold } from "@/server/api/referral-gold/ref-gold-read";

const fmt = (n: number) => Math.floor(n).toLocaleString("ru-RU");

export function RefGoldCard({ ru }: { ru: boolean }) {
  const q = useQuery({ queryKey: ["ref-gold"], queryFn: () => getRefGold(), staleTime: 60_000 });
  const d = q.data;
  if (!d) return null;
  const until = d.swapUntil
    ? new Date(d.swapUntil).toLocaleDateString(ru ? "ru-RU" : "en-GB", {
        day: "numeric",
        month: "short",
      })
    : null;
  const row = (label: string, value: string) => (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
  return (
    <div className="mb-4 rounded-2xl border border-gold/30 bg-gold/5 p-5">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-gold shadow-gold">
          <HandCoins className="h-6 w-6 text-gold-foreground" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {ru ? "С покупок друзей" : "From friends' purchases"}
          </div>
          <div className="font-display text-3xl font-bold text-gradient-gold">{d.pct} %</div>
        </div>
      </div>
      <div className="space-y-1.5">
        {row(ru ? "Друзья купили, золота" : "Friends bought, gold", fmt(d.friendsGold))}
        {d.pending > 0 && row(ru ? "Придёт этой ночью" : "Arrives tonight", `+${fmt(d.pending)}`)}
        {d.earned > 0 && row(ru ? "Получено всего" : "Received in total", fmt(d.earned))}
        {d.swappable > 0 &&
          row(
            ru ? `В DARAI без лимита — до ${until}` : `To DARAI with no limit — until ${until}`,
            fmt(d.swappable),
          )}
      </div>
    </div>
  );
}
