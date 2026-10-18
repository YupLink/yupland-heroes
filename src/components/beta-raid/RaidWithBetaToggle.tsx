import { useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { RaidScreen } from "@/components/RaidScreen";
import { BetaRaidScreen } from "@/components/beta-raid/BetaRaidScreen";
import type { MyGift } from "@/server/api/gifts";

export function RaidWithBetaToggle({
  onClose,
  canBetaRaid,
  onOpenGiftPack,
}: {
  onClose: () => void;
  onOpenGiftPack?: (gift: MyGift) => void;
  /** Бета-рейд открыт: админ или тестер с включённой механикой. */
  canBetaRaid: boolean;
}) {
  const t = useT();
  const [mode, setMode] = useState<"raid" | "beta">("raid");

  return (
    <div className="space-y-3">
      {/* Переключатель (только для админов) */}
      {canBetaRaid && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setMode("raid")}
            className={cn(
              "rounded-lg px-4 py-1.5 text-xs font-bold transition",
              mode === "raid"
                ? "bg-gold/20 text-gold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("raid.title")}
          </button>
          <button
            onClick={() => setMode("beta")}
            className={cn(
              "rounded-lg px-4 py-1.5 text-xs font-bold transition",
              mode === "beta"
                ? "bg-rose-500/20 text-rose-300"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("braid.beta_raid")}
          </button>
        </div>
      )}
      {mode === "raid" ? <RaidScreen onClose={onClose} /> : <BetaRaidScreen onClose={onClose} onOpenGiftPack={onOpenGiftPack} />}
    </div>
  );
}
