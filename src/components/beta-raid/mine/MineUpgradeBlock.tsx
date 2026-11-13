// Улучшение своей шахты v2 (владелец, 23.10.2026; ПРАВИЛА §8.74): добыча сейчас →
// на следующем уровне и «Улучшить за [цена]». Улучшает только Строитель: другой
// герой — кнопка выключена со статусом «Нужен Строитель». Предел — статус без
// кнопки. Остров не улучшают (блок не ставится). Перед улучшением — подтверждение
// (владелец, 26.10.2026): первое нажатие спрашивает, второе улучшает.
import { useState } from "react";
import { ArrowUpCircle, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { MineV2View } from "@/lib/mineExtra";
import { mineLevelYield, mineUpgradeCost } from "@/lib/mineLevels";
import { mineNatureMult, type MineV2Resource } from "@/lib/mineV2";
import { MineRepairLabel } from "./MineRepairLabel";
import { useMineUpgrade } from "./useMineV2Actions";

export function MineUpgradeBlock({
  q,
  r,
  kind,
  v2,
}: {
  q: number;
  r: number;
  kind: MineV2Resource;
  v2: MineV2View;
}) {
  const t = useT();
  const upgrade = useMineUpgrade(q, r);
  const [asking, setAsking] = useState(false);
  const level = v2.level ?? 1;
  const cost = mineUpgradeCost(kind, level);
  if (!cost) {
    return (
      <p className="text-center text-[11px] font-semibold text-amber-200/80">{t("mine2.up_max")}</p>
    );
  }
  const builder = v2.builder === true;
  // С окружением (§8.80): улучшение умножает уже урезанную или поднятую ставку.
  const k = mineNatureMult(kind, !!v2.island, v2.nature);
  const at = (lvl: number) => Math.round(mineLevelYield(kind, lvl) * k * 100) / 100;
  return (
    <div className="space-y-1">
      <p className="text-center text-[11px] tabular-nums text-muted-foreground">
        {t("mine2.up_yield", {
          now: at(level),
          next: at(level + 1),
        })}
      </p>
      {asking && builder ? (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => {
              setAsking(false);
              upgrade.mutate();
            }}
            disabled={upgrade.isPending}
            className="flex flex-1 flex-wrap items-center justify-center gap-1.5 rounded-xl gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50"
          >
            <ArrowUpCircle className="h-4 w-4" />
            {t("mine2.up_confirm", { n: level + 1 })}
          </button>
          <button
            type="button"
            onClick={() => setAsking(false)}
            className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground"
          >
            {t("common.cancel")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          disabled={!builder || upgrade.isPending}
          className="flex w-full flex-wrap items-center justify-center gap-1.5 rounded-xl border border-amber-400/50 px-3 py-2 text-xs font-semibold text-amber-200 disabled:opacity-50"
        >
          {upgrade.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUpCircle className="h-4 w-4" />
          )}
          {builder ? (
            <MineRepairLabel textKey="mine2.up_btn" cost={cost} />
          ) : (
            <span>{t("mine2.up_need_builder")}</span>
          )}
        </button>
      )}
    </div>
  );
}
