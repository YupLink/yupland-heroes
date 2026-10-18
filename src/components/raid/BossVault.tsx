import { useState, useEffect } from "react";
import { useT, useLang } from "@/lib/i18n";
import { localizeAssetName } from "@/lib/translations/assetNames";
import { cn } from "@/lib/utils";
import { BossScene } from "@/components/game/BossScene";

export function BossVault({
  boss,
  isFinal,
  alive,
  locationBg,
  hitTick,
  badgeTone,
}: {
  boss: {
    name: string;
    imageUrl: string | null;
    backgroundUrl?: string | null;
    removeWhite?: boolean;
    badgeLabel?: string | null;
    maxHp: number;
    currentHp: number;
  };
  isFinal: boolean;
  alive: boolean;
  locationBg?: string | null;
  hitTick?: number;
  badgeTone?: "boss" | "loot";
}) {
  const t = useT();
  const lang = useLang();
  const hpPct = Math.max(0, Math.min(100, (boss.currentHp / boss.maxHp) * 100));
  const dead = !alive;
  const [sway, setSway] = useState(false);
  useEffect(() => {
    if (!hitTick) return;
    setSway(true);
    const tm = setTimeout(() => setSway(false), 600);
    return () => clearTimeout(tm);
  }, [hitTick]);
  return (
    <div className="space-y-2">
      <BossScene
        imageUrl={boss.imageUrl}
        backgroundUrl={boss.backgroundUrl}
        removeWhite={boss.removeWhite}
        locationBg={locationBg}
        badgeTone={badgeTone}
        hpPct={hpPct}
        dead={dead}
        isFinal={isFinal}
        anim={sway ? "hit" : "breathe"}
        label={boss.badgeLabel}
      />
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 className="font-display text-2xl font-extrabold tracking-tight">
          {localizeAssetName(boss.name, lang)}
        </h2>
        <span
          className={cn(
            "shrink-0 text-sm font-bold",
            dead ? "text-neon" : "text-red-300"
          )}
        >
          {dead ? t("raid.defeated_check") : t("raid.hp_pct", { n: Math.round(hpPct) })}
        </span>
      </div>
      <div className="px-1 font-mono text-xs text-muted-foreground">
        {boss.currentHp.toLocaleString()} / {boss.maxHp.toLocaleString()} HP
      </div>
    </div>
  );
}
