// Табло автомата: кредит, ставка за спин, выигрыш — цифры «накручиваются».
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useCountUp } from "@/lib/slot/useCountUp";

function Display({
  label,
  value,
  accent,
  animate,
}: {
  label: string;
  value: number;
  accent?: boolean;
  animate?: boolean;
}) {
  const shown = useCountUp(value, animate ? 900 : 0);
  return (
    <div className="slot-display px-2 py-1.5 text-center">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div
        className={cn(
          "font-display text-lg font-bold tabular-nums leading-tight",
          accent ? "text-neon drop-shadow-[0_0_8px_rgba(79,214,224,0.8)]" : "text-gold",
        )}
      >
        {animate ? shown : value}
      </div>
    </div>
  );
}

export function SlotDisplays({
  balance,
  stake,
  win,
}: {
  balance: number;
  stake: number;
  win: number;
}) {
  const t = useT();
  return (
    <div className="grid grid-cols-3 gap-2">
      {/* Золото в автомате — целым: дробная часть (с других механик) не показывается. */}
      <Display label={t("slot.credit")} value={Math.floor(balance)} animate />
      <Display label={t("slot.total_bet")} value={stake} />
      <Display label={t("slot.win")} value={Math.floor(win)} accent={win > 0} animate />
    </div>
  );
}
