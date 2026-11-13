// Точка «за друзей есть что забрать»: на кнопке «Друзья» и на входе в профиль.
// Гаснет сама, когда всё забрано (ключ referral-rewards).
import { memo } from "react";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useReferralRewardsPending } from "./useReferralRewards";

function ReferralRewardDotView({ className }: { className?: string }) {
  const ru = useLang() === "ru";
  const n = useReferralRewardsPending();
  if (n <= 0) return null;
  return (
    <span
      role="status"
      aria-label={ru ? `Награды за друзей: ${n}` : `Friend rewards: ${n}`}
      className={cn(
        "inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-destructive ring-2 ring-background",
        className,
      )}
    />
  );
}

// memo: экран рейда перерисовывается на каждый шаг героя, а этому компоненту
// шаг ни при чём — без memo он с иконками шёл следом (замер 06.11.2026).
export const ReferralRewardDot = memo(ReferralRewardDotView);
