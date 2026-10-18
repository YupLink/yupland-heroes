import { useState } from "react";
import { Swords, Zap, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { ChipSquadPicker, type LineChip } from "@/components/game/ChipSquadPicker";
import { BossVault } from "./BossVault";
import { BossRewardPool } from "./RaidRewards";
import type { RewardCfg } from "./raid-screen-types";
import type { NodeT } from "./raid-screen-types";

export function RaidBossBattle({
  cur,
  bossAlive,
  locationBg,
  hitTick,
  lineup,
  setLineup,
  fighting,
  energy,
  onFight,
}: {
  cur: NodeT;
  bossAlive: boolean;
  locationBg: string | null;
  hitTick: number;
  lineup: LineChip[];
  setLineup: React.Dispatch<React.SetStateAction<LineChip[]>>;
  fighting: boolean;
  energy: number;
  onFight: () => void;
}) {
  const t = useT();
  return (
    <>
      <BossVault
        boss={cur.boss!}
        isFinal={cur.type === "final"}
        alive={bossAlive}
        locationBg={locationBg}
        hitTick={hitTick}
      />
      {cur.boss!.rewardConfig && (
        <BossRewardPool cfg={cur.boss!.rewardConfig as RewardCfg} />
      )}
      {bossAlive && (
        <>
          {/* allowTraining: стартовый набор новичка обязан выходить и на этого босса. */}
          <ChipSquadPicker lineup={lineup} setLineup={setLineup} allowTraining />
          <button
            onClick={onFight}
            disabled={fighting || energy < 10 || lineup.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-2xl gradient-gold px-4 py-3.5 font-bold text-gold-foreground shadow-gold transition enabled:hover:scale-[1.01] disabled:opacity-50"
          >
            {fighting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> {t("raid.fighting")}
              </>
            ) : energy < 10 ? (
              <>
                <Zap className="h-4 w-4" /> {t("raid.low_energy", { n: 10 })}
              </>
            ) : lineup.length === 0 ? (
              <>
                <Swords className="h-4 w-4" /> {t("raid.build_squad")}
              </>
            ) : (
              <>
                <Swords className="h-4 w-4" /> {t("raid.attack")}
                <span className="inline-flex items-center gap-0.5 text-xs opacity-80">
                  <Zap className="h-3 w-3" />10
                </span>
              </>
            )}
          </button>
        </>
      )}
    </>
  );
}
