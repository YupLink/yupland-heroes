// Поле отряда: 5 боевых слотов + резерв. Разметка перенесена из ChipSquadPicker —
// то же поле понадобилось окну боя, где состав закреплён в замке. Без onRemove слоты
// только показывают, а список out (оглушены, отдыхают, пропали) стоит отдельно: в
// боевой порядок он не входит, иначе номер слота врал бы.
import { Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { ChipImage, chipPanelClasses } from "@/components/ChipImage";
import type { LineChip } from "./ChipSquadPicker";
import type { SlotBusyKind, SlotBusyView } from "./squadBusy";

/** Сколько фишек бьётся одновременно; остальные ждут в резерве. */
export const FIELD_SLOTS = 5;

/** Почему фишка осталась вне боя — подпись под ней. */
export type OutReason = "stun" | "rest" | "gone";
export type OutChip = LineChip & { reason: OutReason };

const OUT_KEY = { stun: "squad.out_stunned", rest: "squad.out_resting", gone: "squad.out_gone" };

// Оглушение — сепия, отдых — серый: те же цвета, что в инвентаре. «Часть таких
// занята» — лёгкое приглушение: точный экземпляр неизвестен, и гасить слот
// наравне с выбитой фишкой значило бы соврать в другую сторону.
const BUSY_IMG: Record<SlotBusyKind, string> = {
  stun: "sepia brightness-75",
  rest: "grayscale",
  partial: "brightness-90",
};
const BUSY_TAG: Record<SlotBusyKind, string> = {
  stun: "bg-amber-500/85 text-black",
  rest: "bg-black/70 text-slate-300",
  partial: "bg-black/60 text-slate-300",
};

export function SquadField({
  lineup,
  onRemove,
  out,
  busyOf,
}: {
  lineup: LineChip[];
  onRemove?: (index: number) => void;
  out?: OutChip[];
  /**
   * Занятость фишки, уже стоящей в слоте (оглушена / отдыхает) — с таймером.
   * Нужна в замке: состав там собирают заранее, и без метки выбитая фишка
   * выглядит боеспособной до самого боя. Считает её пикер, у него инвентарь.
   */
  busyOf?: (l: LineChip) => SlotBusyView | null;
}) {
  const t = useT();
  return (
    <>
      {/* Боевое поле — 5 слотов */}
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gold/80">
        {t("squad.field_order")}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: FIELD_SLOTS }).map((_, i) => {
          const l = lineup[i];
          const busy = l ? (busyOf?.(l) ?? null) : null;
          return (
            <button
              key={i}
              disabled={!l || !onRemove}
              onClick={() => l && onRemove?.(i)}
              title={
                l
                  ? busy
                    ? busy.hint
                    : onRemove
                      ? t("squad.remove_from_field")
                      : l.name
                  : t("squad.empty_slot")
              }
              className={cn(
                "group relative aspect-square overflow-hidden rounded-xl p-1 transition",
                l
                  ? cn(chipPanelClasses(l.level), "animate-count-pop")
                  : "border-2 border-dashed border-border/70 bg-secondary/30",
              )}
            >
              {l ? (
                <>
                  <ChipImage
                    src={l.image}
                    level={l.level}
                    alt={l.name}
                    className={cn(
                      "w-full transition group-hover:scale-105",
                      busy && BUSY_IMG[busy.kind],
                    )}
                  />
                  <span className="absolute left-1 top-1 grid h-4 w-4 place-items-center rounded-md bg-black/70 text-[8px] font-bold text-white">
                    {i + 1}
                  </span>
                  {l.serialNo != null && !busy && (
                    <span className="absolute right-1 top-1 rounded-md bg-black/70 px-1 py-0.5 text-[8px] font-bold text-white">
                      #{l.serialNo}
                    </span>
                  )}
                  {busy && (
                    <span
                      className={cn(
                        "absolute inset-x-0 bottom-0 truncate px-0.5 text-center text-[7px] font-bold",
                        BUSY_TAG[busy.kind],
                      )}
                    >
                      {busy.left}
                    </span>
                  )}
                </>
              ) : (
                <span className="grid h-full w-full place-items-center text-muted-foreground/40">
                  <Swords className="h-4 w-4" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Резерв */}
      {lineup.length > FIELD_SLOTS && (
        <>
          <div className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("squad.reserve_hint")}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {lineup.slice(FIELD_SLOTS).map((l, i) => {
              const idx = i + FIELD_SLOTS;
              const busy = busyOf?.(l) ?? null;
              return (
                <button
                  key={idx}
                  disabled={!onRemove}
                  onClick={() => onRemove?.(idx)}
                  title={busy ? busy.hint : onRemove ? t("squad.remove_from_reserve") : l.name}
                  className={cn(
                    "relative h-11 w-11 shrink-0 overflow-hidden rounded-lg p-0.5 opacity-90 transition hover:opacity-100",
                    chipPanelClasses(l.level),
                  )}
                >
                  <ChipImage
                    src={l.image}
                    level={l.level}
                    alt={l.name}
                    className={cn("w-full", busy && BUSY_IMG[busy.kind])}
                  />
                  {l.serialNo != null && !busy && (
                    <span className="absolute right-0.5 top-0.5 rounded bg-black/70 px-0.5 text-[7px] font-bold text-white">
                      #{l.serialNo}
                    </span>
                  )}
                  {busy && (
                    <span
                      className={cn(
                        "absolute inset-x-0 bottom-0 truncate px-0.5 text-center text-[7px] font-bold",
                        BUSY_TAG[busy.kind],
                      )}
                    >
                      {busy.left}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Вне боя: серые, с причиной — иначе «9 из 10» читалось бы как пропажа фишки. */}
      {out && out.length > 0 && (
        <>
          <div className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("squad.out_of_fight")}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {out.map((l, i) => (
              <div
                key={`${l.templateId}-${l.serialNo ?? i}`}
                title={l.name}
                className={cn(
                  "relative h-11 w-11 shrink-0 overflow-hidden rounded-lg p-0.5 opacity-60",
                  chipPanelClasses(l.level),
                )}
              >
                {/* Оглушение — сепия, отдых и пропажа — серый: те же цвета, что в инвентаре. */}
                <ChipImage
                  src={l.image}
                  level={l.level}
                  alt={l.name}
                  className={cn("w-full", l.reason === "stun" ? "sepia" : "grayscale")}
                />
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-0.5 text-center text-[7px] font-bold text-slate-300">
                  {t(OUT_KEY[l.reason])}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
