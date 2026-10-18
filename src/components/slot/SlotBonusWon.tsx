// Окно «Ты выиграл бонус-игру»: барабаны докрутились, выигрыш линий зачислен,
// вход в раскоп — только по кнопке.
import { useT } from "@/lib/i18n";

export function SlotBonusWon({ count, onEnter }: { count: number; onEnter: () => void }) {
  const t = useT();
  return (
    <div className="flex justify-center">
      <div className="slot-panel animate-slot-pop w-full space-y-3 p-4 text-center shadow-[0_0_40px_rgba(243,202,98,0.45)]">
        <div className="flex items-center justify-center gap-1">
          {Array.from({ length: Math.min(5, count) }, (_, i) => (
            <img
              key={i}
              src="/slot/bonus.webp"
              alt=""
              className="animate-slot-pulse h-12 w-12 object-contain"
              style={{ animationDelay: `${i * 0.12}s` }}
            />
          ))}
        </div>
        <div className="font-display text-xl text-[#f3ca62]">{t("slot.fx.bonus_won")}</div>
        <button
          type="button"
          onClick={onEnter}
          className="slot-start w-full py-3 text-base uppercase"
        >
          {t("slot.fx.bonus_enter")}
        </button>
      </div>
    </div>
  );
}
