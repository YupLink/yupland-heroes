// Иконка пункта нижнего меню портала. У «Друзей» — точка, пока за друзей есть
// незабранная награда (бонус-бокс или 10 % USDT); гаснет сама после «Забрать».
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReferralRewardDot } from "@/components/referrals/ReferralRewardDot";

export function BottomNavIcon({
  icon: Icon,
  active,
  refDot,
}: {
  icon: LucideIcon;
  active: boolean;
  refDot?: boolean;
}) {
  return (
    <span className="relative">
      <Icon className={cn("h-5 w-5 transition", active && "drop-shadow-[0_0_8px_var(--color-gold)]")} />
      {refDot && <ReferralRewardDot className="absolute -right-1.5 -top-1" />}
    </span>
  );
}
