// Статистика сессии: спины, поставлено, выиграно, отдача, бонусы, лучший выигрыш.
import { useT } from "@/lib/i18n";
import type { SlotStats as Stats } from "@/lib/slot/state";

export function SlotStats({ stats, onReset }: { stats: Stats; onReset: () => void }) {
  const t = useT();
  const rtp = stats.wagered > 0 ? Math.round((stats.won / stats.wagered) * 1000) / 10 : 0;
  const cells: Array<[string, string | number]> = [
    [t("slot.stats.spins"), stats.spins],
    [t("slot.stats.wagered"), stats.wagered],
    [t("slot.stats.won"), stats.won],
    [t("slot.stats.rtp"), `${rtp}%`],
    [t("slot.stats.bonuses"), stats.bonuses],
    [t("slot.stats.best"), stats.bestWin],
  ];
  const riskNet = stats.riskOut - stats.riskIn;
  const riskCells: Array<[string, string | number]> = [
    [t("slot.stats.risk_games"), stats.riskGames],
    [t("slot.stats.risk_wins"), stats.riskWins],
    [t("slot.stats.risk_losses"), stats.riskLosses],
    [t("slot.stats.risk_net"), riskNet > 0 ? `+${riskNet}` : riskNet],
  ];
  const balanceCells: Array<[string, string | number]> = [
    [t("slot.stats.bal_start"), stats.spins ? stats.startBalance : "—"],
    [t("slot.stats.bal_min"), stats.spins ? stats.minBalance : "—"],
    [t("slot.stats.bal_max"), stats.spins ? stats.maxBalance : "—"],
    [t("slot.stats.topups"), stats.topups],
  ];
  return (
    <div className="slot-display p-2">
      <div className="grid grid-cols-6 gap-1 text-center">
        {cells.map(([label, value]) => (
          <div key={label}>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="font-display text-xs font-bold tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-4 gap-1 border-t border-[#655a43]/40 pt-1.5 text-center">
        {riskCells.map(([label, value]) => (
          <div key={label}>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="font-display text-xs font-bold tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 border-t border-[#655a43]/40 pt-1.5">
        <div className="mb-0.5 text-center text-[9px] uppercase tracking-wider text-muted-foreground">
          {t("slot.stats.balance")}
        </div>
        <div className="grid grid-cols-4 gap-1 text-center">
          {balanceCells.map(([label, value]) => (
            <div key={label}>
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                {label}
              </div>
              <div className="font-display text-xs font-bold tabular-nums">{value}</div>
            </div>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={onReset}
        className="mt-1 w-full text-center text-[10px] text-muted-foreground hover:text-foreground"
      >
        {t("slot.stats.reset")}
      </button>
    </div>
  );
}
