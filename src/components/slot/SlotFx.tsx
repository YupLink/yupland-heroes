// Эффекты выигрыша: конфетти, золотой дождь, плашка уровня, вспышка «Бонус-игра!».
// Чисто CSS, без зависимостей; перерисовка по ключу `trigger`.
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { WinTier } from "@/lib/slot/winTier";

const COLORS = ["#f5b301", "#ffd54a", "#4fd6e0", "#ff5470", "#a78bfa", "#ffffff"];

function Pieces({ trigger, count, coin }: { trigger: number; count: number; coin: boolean }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: `${trigger}-${i}`,
        left: Math.random() * 100,
        size: coin ? 8 + Math.random() * 8 : 5 + Math.random() * 7,
        color: coin ? "#f5b301" : COLORS[i % COLORS.length],
        delay: Math.random() * 0.8,
        dur: 1.8 + Math.random() * 1.4,
        round: coin || Math.random() < 0.3,
      })),
    [trigger, count, coin],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className={cn("absolute top-0", p.round ? "rounded-full" : "rounded-sm")}
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: coin ? p.size : p.size * 0.6,
            background: p.color,
            boxShadow: coin ? "0 0 8px #f5b301, inset -2px -2px 0 #d9891f" : undefined,
            animation: `${coin ? "slot-coin" : "slot-confetti"} ${p.dur}s linear ${p.delay}s both`,
          }}
        />
      ))}
    </div>
  );
}

export function SlotWinFx({ tier, trigger, win }: { tier: WinTier; trigger: number; win: number }) {
  const t = useT();
  if (tier === 0 || !trigger) return null;
  const label = tier === 3 ? t("slot.fx.mega") : tier === 2 ? t("slot.fx.big") : t("slot.fx.nice");
  return (
    <>
      {tier >= 2 && <Pieces trigger={trigger} count={tier === 3 ? 90 : 50} coin={false} />}
      {tier === 3 && <Pieces trigger={trigger * 7 + 1} count={40} coin />}
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
        <div
          key={trigger}
          className="animate-slot-pop rounded-2xl border-2 border-gold/70 bg-black/80 px-5 py-3 text-center shadow-[0_0_40px_rgba(245,179,1,0.6)]"
        >
          <div className="font-display text-lg font-bold uppercase tracking-widest text-gold">
            {label}
          </div>
          <div className="font-display text-3xl font-bold tabular-nums text-white drop-shadow-[0_0_10px_#f5b301]">
            {win}
          </div>
        </div>
      </div>
    </>
  );
}

export function SlotBonusFx({ show }: { show: boolean }) {
  const t = useT();
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/40">
      <div className="animate-slot-pop flex flex-col items-center gap-1 rounded-2xl border-2 border-gold/70 bg-black/85 px-6 py-4 shadow-[0_0_50px_rgba(245,179,1,0.7)]">
        <img
          src="/slot/bonus.webp"
          alt=""
          className="animate-slot-pulse h-20 w-20 object-contain"
        />
        <div className="font-display text-xl font-bold uppercase tracking-widest text-gold">
          {t("slot.fx.bonus")}
        </div>
      </div>
    </div>
  );
}
