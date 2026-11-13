// Строка окна «Управление шахтами»: шахта, карта и клетка, уровень, запас
// службы, сколько готово к сбору и «Собрать» (когда есть что). У своей
// работающей шахты мира — режим (с тем же подтверждением, что в окне шахты:
// срок до поломки пересчитается) и «Починить за …». Остров (§8.59 п. 11) —
// режим не меняют, свою не чинят. Сломанная — без режима и починки.
import { useState } from "react";
import { HandCoins, Loader2, Wrench } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatQty } from "@/lib/formatQty";
import { mineRowReady } from "@/lib/mineLost";
import { MINE_MODES, type MineMode } from "@/lib/mineV2";
import { mineBrokenNow, mineLeftAfterSwitch } from "@/lib/mineV2Clock";
import { blueprintLabel } from "@/lib/mineBlueprint";
import { marketResourceIconSrc } from "@/lib/resourceIcons";
import type { OfficeMine } from "@/server/api/mine-office/mine-office-list";
import { MineLifeBar } from "@/components/beta-raid/mine/MineLifeBar";
import { MineLevelBadge } from "@/components/beta-raid/mine/MineLevelBadge";
import { MineModeConfirm } from "@/components/beta-raid/mine/MineModePicker";
import { MineRepairLabel } from "@/components/beta-raid/mine/MineRepairLabel";
import { useOfficeClaim, useOfficeRepair, useOfficeSetMode } from "./useMineOffice";

function OfficeModes({ m, now }: { m: OfficeMine; now: number }) {
  const t = useT();
  const [pick, setPick] = useState<MineMode | null>(null);
  const set = useOfficeSetMode(m);
  return (
    <div className="space-y-1.5">
      <div
        role="radiogroup"
        aria-label={t("mine2.mode_label")}
        className="grid grid-cols-3 gap-0.5 rounded-lg border border-border/70 p-0.5"
      >
        {MINE_MODES.map((x) => {
          const on = x.id === m.view.mode;
          return (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={set.isPending}
              onClick={() => setPick(on ? null : x.id)}
              className={cn(
                "flex min-w-0 items-center justify-center gap-1 rounded-md px-1 py-1.5 text-[11px] font-semibold disabled:opacity-60",
                on ? "bg-amber-500/20 text-amber-200" : pick === x.id ? "bg-gold/10 text-foreground" : "text-muted-foreground",
              )}
            >
              <span className="truncate">{t(`mine2.mode.${x.id}`)}</span>
              <span className="shrink-0 tabular-nums opacity-70">×{x.mult}</span>
            </button>
          );
        })}
      </div>
      {pick && (
        <MineModeConfirm
          pick={pick}
          v2={m.view}
          now={now}
          busy={set.isPending}
          onApply={() =>
            set.mutate(
              { mode: pick, leftMs: mineLeftAfterSwitch(m.view, pick, now) },
              { onSuccess: () => setPick(null) },
            )
          }
          onCancel={() => setPick(null)}
        />
      )}
    </div>
  );
}

function OfficeRepair({ m }: { m: OfficeMine }) {
  const repair = useOfficeRepair(m);
  return (
    <button
      type="button"
      onClick={() => repair.mutate()}
      disabled={repair.isPending}
      className="flex w-full flex-wrap items-center justify-center gap-1.5 rounded-xl border border-amber-400/50 px-3 py-2 text-xs font-semibold text-amber-200 disabled:opacity-50"
    >
      {repair.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
      <MineRepairLabel textKey="mine2.repair_for" cost={m.view.repairCost} />
    </button>
  );
}

/** «Собрать» — только когда есть что: тем же сбором, что в «Добыче». */
function OfficeCollect({ m }: { m: OfficeMine }) {
  const t = useT();
  const claim = useOfficeClaim(m);
  return (
    <button
      type="button"
      onClick={() => claim.mutate()}
      disabled={claim.isPending}
      className="mt-1 inline-flex items-center gap-1 rounded-lg gradient-gold px-2.5 py-1 text-[11px] font-bold text-gold-foreground disabled:opacity-50"
    >
      {claim.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <HandCoins className="h-3 w-3" />}
      {t("mineoffice.collect")}
    </button>
  );
}

export function MineOfficeRow({ m, now }: { m: OfficeMine; now: number }) {
  const t = useT();
  const ru = useLang() !== "en";
  const broken = mineBrokenNow(m.view, now);
  const icon = marketResourceIconSrc(m.kind);
  const ready = mineRowReady(m, now);
  return (
    <div className="space-y-2 rounded-xl border border-border px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            {icon && <img src={icon} alt="" className="h-4 w-4 shrink-0" decoding="async" />}
            <span className="truncate">{blueprintLabel(m.kind, ru)}</span>
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {m.place ? `${m.place} · ` : ""}
            {t("harvest.cell", { q: m.q, r: m.r })}
          </div>
        </div>
        <div className="shrink-0 text-right text-xs font-bold tabular-nums text-amber-300">
          {t("harvest.ready", { n: formatQty(ready) })}
          {ready > 0 && (
            <div>
              <OfficeCollect m={m} />
            </div>
          )}
        </div>
      </div>
      {broken ? (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
          {!m.view.island && <MineLevelBadge level={m.level} />}
          {t("mine2.broken")}
        </p>
      ) : (
        <MineLifeBar v2={m.view} now={now} />
      )}
      {!broken && !m.view.island && (
        <>
          <OfficeModes m={m} now={now} />
          <OfficeRepair m={m} />
        </>
      )}
    </div>
  );
}
