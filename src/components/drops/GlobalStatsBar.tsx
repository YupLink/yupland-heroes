import { Flame, Zap, Coins } from "lucide-react";
import { useT } from "@/lib/i18n";
import { shortAmount } from "./shop-shared";

export function GlobalStatsBar({
  energyBurned,
  tokens,
  ticketsSold,
}: {
  energyBurned: number;
  tokens: Array<{ symbol: string; amount: number }>;
  ticketsSold: number;
}) {
  const t = useT();
  if (energyBurned <= 0 && tokens.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-secondary/20 px-3 py-2 text-[11px]">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        <Flame className="h-3 w-3 text-orange-400" />
        {t("mynfts.burned_via_shop_total")}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {energyBurned > 0 && (
          <span className="inline-flex items-center gap-1">
            <Zap className="h-3 w-3 text-gold" />
            <span className="font-mono font-medium text-foreground">
              {shortAmount(energyBurned)}
            </span>
            <span className="text-muted-foreground">{t("mynfts.energy_word")}</span>
          </span>
        )}
        {tokens.map((tok) => (
          <span key={tok.symbol} className="inline-flex items-center gap-1">
            <Coins className="h-3 w-3 text-neon" />
            <span className="font-mono font-medium text-foreground">
              {shortAmount(tok.amount)}
            </span>
            <span className="text-muted-foreground">{tok.symbol}</span>
          </span>
        ))}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {t("mynfts.bought_n_tickets", { n: shortAmount(ticketsSold) })}
        </span>
      </div>
    </div>
  );
}
