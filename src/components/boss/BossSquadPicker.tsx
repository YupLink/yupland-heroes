import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Swords, Shield, ChevronDown, Moon, Sparkles } from "lucide-react";
import { ChipImage, chipPanelClasses } from "@/components/ChipImage";
import { labelForLevel } from "@/components/chips/levelLabel";
import { CHIP_BUSY_HINT, chipBusyOf, fmtBusyLeft } from "@/components/chips/chipBusy";
import { FIELD_SLOTS, MAX_LINEUP } from "./boss-screen-types";
import type { InvChip, LineChip } from "./boss-screen-types";

/**
 * Экземпляр фишки так, как его отдаёт myChipInventory: кроме отдыха у него
 * есть оглушение боссом. Классический пикер знал только rest_until, поэтому
 * выбитая боссом фишка выглядела боеспособной — игрок ставил её в строй, а в
 * бой она не выходила. Тип расширяем здесь: BossScreen шлёт те же данные.
 */
type BusyChipInstance = {
  id: string;
  serialNo: number | null;
  restUntil?: string | null;
  stunUntil?: string | null;
};
type PickerChip = Omit<InvChip, "chips"> & { chips?: BusyChipInstance[] };

export function BossSquadPicker({
  lineup,
  setLineup,
  invChips,
  invOpen,
  setInvOpen,
  invShow,
  setInvShow,
  autoFill,
  readyCountOf,
  readyChipsOf,
  usedOf,
  nowTick,
}: {
  lineup: LineChip[];
  setLineup: React.Dispatch<React.SetStateAction<LineChip[]>>;
  invChips: PickerChip[];
  invOpen: boolean;
  setInvOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  invShow: number;
  setInvShow: React.Dispatch<React.SetStateAction<number>>;
  autoFill: () => void;
  readyCountOf: (c: InvChip) => number;
  readyChipsOf: (c: InvChip) => Array<{ id: string; serialNo: number | null; restUntil?: string | null }>;
  /** Считает только отдых — занятость берём из chipBusy.ts, эти двое остались ради вызова сверху. */
  chipResting: (u?: string | null) => boolean;
  fmtRest: (u?: string | null) => string;
  usedOf: (templateId: string, level: number) => number;
  nowTick: number;
}) {
  const t = useT();
  // Готовность считаем ПО экземплярам: одна фишка может и отдыхать, и лежать
  // без сознания, а счётчики родителя знают только про отдых.
  const readyOf = (c: PickerChip) => (c.chips ?? []).filter((ch) => !chipBusyOf(ch, nowTick));
  const haveOf = (c: PickerChip) => (c.chips?.length ? readyOf(c).length : readyCountOf(c));
  return (
    <div className="rounded-3xl border border-border bg-card p-3.5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <Shield className="h-4 w-4 text-gold" /> {t("boss.squad")}
          <span className="text-muted-foreground">({lineup.length}/{MAX_LINEUP} · {t("boss.field_count", { n: FIELD_SLOTS })})</span>
          <button onClick={autoFill} disabled={invChips.length === 0}
            title={t("boss.pick_strongest")}
            className="ml-1 inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/5 px-2 py-0.5 text-[11px] font-medium text-gold transition enabled:hover:bg-gold/15 disabled:opacity-40">
            <Swords className="h-3 w-3" /> {t("boss.autofill")}
          </button>
        </span>
        <div className="flex items-center gap-3">
          {lineup.length > 0 && <button onClick={() => setLineup((_p: LineChip[]) => [])} className="text-xs text-muted-foreground transition hover:text-destructive">{t("boss.clear")}</button>}
          <button onClick={() => setInvOpen((v) => !v)} className="inline-flex items-center gap-1 text-xs font-medium text-gold">
            {invOpen ? t("boss.hide_chips") : t("boss.pick_chips")}
            <ChevronDown className={cn("h-3.5 w-3.5 transition", invOpen && "rotate-180")} />
          </button>
        </div>
      </div>

      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gold/80">{t("boss.on_field_in_order")}</div>
      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: FIELD_SLOTS }).map((_, i) => {
          const l = lineup[i];
          return (
            <button key={i} disabled={!l} onClick={() => l && setLineup((p) => p.filter((_, j) => j !== i))}
              title={l ? t("boss.remove_from_field") : t("boss.empty")}
              className={cn(
                "group relative aspect-square overflow-hidden rounded-xl p-1 transition",
                l ? cn(chipPanelClasses(l.level), "animate-count-pop") : "border-2 border-dashed border-border/70 bg-secondary/30",
              )}>
              {l ? (
                <>
                  <ChipImage src={l.image} level={l.level} alt={l.name} className="w-full transition group-hover:scale-105" />
                  <span className="absolute left-1 top-1 grid h-4 w-4 place-items-center rounded-md bg-black/70 text-[8px] font-bold text-white">{i + 1}</span>
                  {l.serialNo != null && (
                    <span className="absolute right-1 top-1 rounded-md bg-black/70 px-1 py-0.5 text-[8px] font-bold text-white">#{l.serialNo}</span>
                  )}
                </>
              ) : (
                <span className="grid h-full w-full place-items-center text-muted-foreground/40"><Swords className="h-4 w-4" /></span>
              )}
            </button>
          );
        })}
      </div>

      {lineup.length > FIELD_SLOTS && (
        <>
          <div className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("boss.reserve_swap")}</div>
          <div className="flex flex-wrap gap-1.5">
            {lineup.slice(FIELD_SLOTS).map((l, i) => {
              const idx = i + FIELD_SLOTS;
              return (
                <button key={idx} onClick={() => setLineup((p) => p.filter((_, j) => j !== idx))} title={t("boss.remove_from_reserve")}
                  className={cn("relative h-11 w-11 shrink-0 overflow-hidden rounded-lg p-0.5 opacity-90 transition hover:opacity-100", chipPanelClasses(l.level))}>
                  <ChipImage src={l.image} level={l.level} alt={l.name} className="w-full" />
                  {l.serialNo != null && (
                    <span className="absolute right-0.5 top-0.5 rounded bg-black/70 px-0.5 text-[7px] font-bold text-white">#{l.serialNo}</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {lineup.length === 0 && (
        <p className="mt-2.5 text-center text-xs text-muted-foreground">{t("boss.pick_chips_hint", { n: MAX_LINEUP })}</p>
      )}

      {invOpen && (
        <div className="mt-3 border-t border-border/60 pt-3">
          {invChips.length === 0 ? (
            <p className="py-1 text-center text-xs text-muted-foreground">{t("boss.no_chips_open_pack")}</p>
          ) : (
            <>
              <div className="grid grid-cols-5 gap-1.5">
                {invChips.slice(0, invShow).map((c) => {
                  const left = haveOf(c) - usedOf(c.templateId, c.level);
                  const disabled = left <= 0 || lineup.length >= MAX_LINEUP;
                  // Занятые — по общему правилу: оглушение важнее отдыха, одна
                  // фишка считается один раз.
                  const busy = (c.chips ?? [])
                    .map((ch) => chipBusyOf(ch, nowTick))
                    .filter((b): b is NonNullable<typeof b> => !!b);
                  const nextOf = (kind: "stun" | "rest") =>
                    busy.filter((b) => b.kind === kind).map((b) => b.until).sort();
                  const stuns = nextOf("stun");
                  const rests = nextOf("rest");
                  const noneReady = nowTick > 0 && (c.chips?.length ?? 0) > 0 && readyOf(c).length === 0;
                  return (
                    <button key={`${c.templateId}-${c.level}`} disabled={disabled}
                      onClick={() => setLineup((p) => {
                        const used = p.filter((x) => x.templateId === c.templateId && x.level === c.level).length;
                        // Серийник берём только у свободной фишки: с оглушённой
                        // сервер бой не начнёт.
                        const ready = c.chips?.length ? readyOf(c) : readyChipsOf(c);
                        return [...p, { templateId: c.templateId, serialNo: ready[used]?.serialNo ?? null, level: c.level, image: c.imageUrl, name: c.templateName }];
                      })}
                      className={cn(
                        "group relative overflow-hidden rounded-xl p-1 text-left transition",
                        chipPanelClasses(c.level),
                        disabled ? "opacity-30" : "hover:brightness-110 active:scale-95",
                      )}>
                      <ChipImage src={c.imageUrl} level={c.level} alt={c.templateName}
                        className={cn(
                          "w-full transition group-hover:scale-105",
                          // Драться некому: оглушение — сепия, отдых — серый.
                          noneReady && stuns.length > 0 && "sepia brightness-75",
                          noneReady && stuns.length === 0 && rests.length > 0 && "grayscale",
                        )} />
                      <span className="mt-0.5 block truncate text-center text-[9px] font-medium text-gold">{labelForLevel(c.level)}</span>
                      {left > 0 && (
                        <span className="absolute right-0.5 top-0.5 rounded-md bg-gold/90 px-1 text-[9px] font-bold text-gold-foreground">×{left}</span>
                      )}
                      {stuns.length > 0 ? (
                        <span title={t(CHIP_BUSY_HINT.stun)}
                          className="absolute inset-x-0 bottom-0 inline-flex items-center justify-center gap-0.5 bg-amber-500/85 px-0.5 py-px text-center text-[8px] font-bold text-black">
                          <Sparkles className="h-2.5 w-2.5 shrink-0" />
                          {stuns.length > 1 ? `×${stuns.length} ` : ""}
                          {fmtBusyLeft(stuns[0], nowTick, t)}
                        </span>
                      ) : rests.length > 0 ? (
                        <span title={t(CHIP_BUSY_HINT.rest)}
                          className="absolute inset-x-0 bottom-0 inline-flex items-center justify-center gap-0.5 bg-black/70 px-0.5 py-px text-center text-[8px] font-bold text-slate-300">
                          <Moon className="h-2.5 w-2.5 shrink-0" />
                          {rests.length > 1 ? `×${rests.length} ` : ""}
                          {fmtBusyLeft(rests[0], nowTick, t)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {invChips.length > invShow && (
                <button onClick={() => setInvShow((n) => n + 10)} className="mt-2 w-full rounded-lg border border-border py-1.5 text-xs text-muted-foreground transition hover:border-gold/40">
                  {t("boss.show_more", { n: invChips.length - invShow })}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
