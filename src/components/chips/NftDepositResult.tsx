// Экран итога ввода NFT. Один и тот же и в модалке, и как «квитанция» при
// следующем заходе (см. NftInputReceipt) — чтобы игрок читал одно и то же
// сообщение, где бы оно его ни догнало.
import { CheckCircle2, AlertCircle, AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ChipsSubTab } from "@/lib/chipsNav";
import type { DepositOutcome } from "./nftDepositOutcome";
import { viewOutcome } from "./nftDepositText";
import "./nft-input-game.css";

export function NftDepositResult({
  outcome,
  position = "absolute",
  hint,
  onGo,
  onDismiss,
  onClose,
}: {
  outcome: DepositOutcome;
  /** внутри модалки — absolute, отдельной квитанцией — fixed */
  position?: "absolute" | "fixed";
  /** приписка «это результат прошлого ввода» */
  hint?: string;
  onGo?: (sub: ChipsSubTab) => void;
  onDismiss: () => void;
  onClose?: () => void;
}) {
  const t = useT();
  const v = viewOutcome(outcome, t);
  const Icon = v.ok ? CheckCircle2 : v.lines.length > 0 ? AlertTriangle : AlertCircle;
  const tone = v.ok ? "text-success" : v.lines.length > 0 ? "text-gold" : "text-destructive";

  return (
    <div
      className={cn(
        // Своя прокрутка + запас под нижнюю панель: на узком телефоне длинный
        // список выдачи иначе уезжает под навигацию.
        "nft-deposit-result inset-0 z-[120] overflow-y-auto overscroll-contain",
        position === "fixed" ? "fixed" : "absolute",
      )}
      // Клик по экрану результата не должен доходить до подложки модалки:
      // иначе «промахнулся мимо кнопки» = окно закрылось вместе с итогом.
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex min-h-full flex-col items-center justify-center gap-3 p-6 pb-[calc(env(safe-area-inset-bottom)+96px)] text-center sm:pb-6">
        <Icon className={cn("h-11 w-11 shrink-0", tone)} />
        <div className="text-base font-bold text-white">{v.title}</div>

        {v.lines.length > 0 && (
          <ul className="w-full max-w-xs space-y-1 rounded-xl border border-white/10 bg-white/5 p-3">
            {v.lines.map((l) => (
              <li key={l} className="text-sm font-semibold text-white">
                {l}
              </li>
            ))}
          </ul>
        )}

        {v.where && <div className="max-w-xs text-xs leading-snug text-white/70">{v.where}</div>}
        {/* Ожидание — спокойным тоном и со «спиннером»: это не проблема, а
            обещание. Красный и янтарный тут читались бы как отказ. */}
        {v.pendingLine && (
          <div className="flex max-w-xs items-start gap-2 text-xs leading-snug text-white/70">
            <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-[#f3ca62]" />
            <span>{v.pendingLine}</span>
          </div>
        )}
        {v.failLine && (
          <div className="max-w-xs text-xs leading-snug text-amber-300/90">{v.failLine}</div>
        )}
        {hint && <div className="max-w-xs text-[11px] text-white/45">{hint}</div>}

        <div className="mt-1 flex w-full max-w-xs flex-col gap-2">
          {v.target && v.cta && onGo && (
            <button
              type="button"
              onClick={() => onGo(v.target as ChipsSubTab)}
              className="nft-input-primary inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-sm transition active:scale-[0.98]"
            >
              {v.cta}
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className={cn(
              "w-full rounded-xl px-4 py-2.5 text-sm font-bold transition active:scale-[0.98]",
              v.target && onGo
                ? "border border-border/60 text-white/75 hover:text-white"
                : "nft-input-primary",
            )}
          >
            {t("common.ok")}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl px-4 py-2 text-xs font-medium text-white/55 transition hover:text-white"
            >
              {t("common.close")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
