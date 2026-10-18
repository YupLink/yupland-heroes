// Места под обучение — сеткой, как слоты в прежнем стейкинге.
//
// Три состояния ячейки, и все три узнаваемы с первого взгляда:
//   • занятая — картинка фишки и её доход; нажатие забирает её домой;
//   • открытая пустая — плюс на неоне; нажатие открывает выбор фишки;
//   • закрытая — замок и цена в билетах; нажатие открывает место.
//
// Так же, как на экране майнинга: игрок уже знает этот интерфейс, и объяснять
// ему заново, что такое «место», не нужно.
import { Lock, Plus, Ticket, Loader2 } from "lucide-react";
import { ChipImage } from "@/components/ChipImage";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { likesLabel } from "@/lib/university";

export type SlotChip = {
  chipId: string;
  level: number;
  name: string;
  imageUrl: string | null;
  serialNo: number | null;
  ratePerDay: number;
};

export function UniversitySlots({
  chips,
  slots,
  maxSlots,
  slotPrice,
  busy,
  onPick,
  onTake,
  onBuySlot,
}: {
  chips: SlotChip[];
  slots: number;
  maxSlots: number;
  slotPrice: number | null;
  busy: boolean;
  onPick: () => void;
  onTake: (chipId: string) => void;
  onBuySlot: () => void;
}) {
  const t = useT();
  // Рисуем ВСЕ места до предела: закрытые видно так же, как в стейкинге, —
  // иначе непонятно, сколько их вообще бывает и куда расти.
  const cells = Array.from({ length: maxSlots }, (_, i) => i);

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {cells.map((i) => {
        const chip = chips[i];
        if (chip) {
          return (
            <button
              key={chip.chipId}
              type="button"
              disabled={busy}
              onClick={() => onTake(chip.chipId)}
              title={t("braid.uni_take_hint")}
              className="overflow-hidden rounded-2xl border border-gold/40 bg-gold/5 transition hover:border-gold disabled:opacity-60"
            >
              <ChipImage src={chip.imageUrl ?? ""} level={chip.level} alt={chip.name} className="w-full" />
              <div className="px-1 py-0.5 text-[9px] text-muted-foreground">
                {chip.level}★{chip.serialNo ? ` #${chip.serialNo}` : ""}
              </div>
              <div className="px-1 pb-1 text-[9px] font-bold text-gold">
                {t("braid.uni_per_day", { n: likesLabel(chip.ratePerDay) })}
              </div>
            </button>
          );
        }
        if (i < slots) {
          return (
            <button
              key={`free-${i}`}
              type="button"
              disabled={busy}
              onClick={onPick}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border border-neon/30 bg-neon/5 transition hover:bg-neon/10 disabled:opacity-60"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-neon text-background">
                <Plus className="h-5 w-5" strokeWidth={3} />
              </span>
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                {t("braid.uni_slot")}
              </span>
            </button>
          );
        }
        // Первое закрытое место и есть то, что можно открыть сейчас.
        const isNext = i === slots;
        return (
          <button
            key={`locked-${i}`}
            type="button"
            disabled={!isNext || busy || slotPrice === null}
            onClick={onBuySlot}
            className={cn(
              "flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border border-dashed text-center transition",
              isNext && slotPrice !== null
                ? "border-gold/40 bg-gold/5 hover:bg-gold/10"
                : "border-border/40 bg-secondary/20 opacity-60",
            )}
          >
            {busy && isNext ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <Lock className="h-5 w-5 text-muted-foreground" />
            )}
            {isNext && slotPrice !== null ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-gold">
                <Ticket className="h-3 w-3" />
                {slotPrice}
              </span>
            ) : (
              <span className="text-[9px] text-muted-foreground">{t("braid.uni_slot_locked")}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
