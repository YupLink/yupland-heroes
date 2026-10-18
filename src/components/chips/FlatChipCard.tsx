import { GraduationCap, Moon, Sparkles } from "lucide-react";
import { ChipImage, chipPanelClasses } from "@/components/ChipImage";
import { cn } from "@/lib/utils";
import { useLang, useT } from "@/lib/i18n";
import { chipBusyView } from "./chipBusy";

export type FlatChip = {
  id: string;
  serialNo: number | null;
  templateId: string;
  templateNo: number;
  templateName: string;
  imageUrl: string;
  collectionId: string;
  collectionName: string;
  level: number;
  obtainedAt: string;
  restUntil?: string | null;
  /** Оглушение боссом: фишка «без сознания» и в бой не пойдёт, как и на отдыхе. */
  stunUntil?: string | null;
  /** Учится в университете: серая, не воюет и не продаётся, пока её не заберут. */
  studying?: boolean;
  isTraining?: boolean;
  sellTickets?: number;
  /** Тренировочная фишка за пропуск Прихожей: продаже не подлежит. */
  sellable?: boolean;
};

export function FlatChipCard({
  chip,
  onClick,
  nowTick = 0,
}: {
  chip: FlatChip;
  onClick: () => void;
  /** Тик держит список: один интервал на экран вместо таймера в каждой карточке. */
  nowTick?: number;
}) {
  const t = useT();
  const ru = useLang() === "ru";
  const busy = chipBusyView(chip, nowTick, t);
  const shownNumber = chip.isTraining ? chip.serialNo : chip.templateNo;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${chip.templateName}, ${chip.isTraining ? (ru ? "фишка" : "chip") : (ru ? "вид" : "type")} №${shownNumber ?? "?"}`}
      title={busy ? busy.hint : undefined}
      className={cn(
        "overflow-hidden rounded-2xl text-left backdrop-blur transition hover:brightness-110",
        chipPanelClasses(chip.level),
        // Занятая карточка выглядит выключенной: её не спутать с боеспособной.
        busy && "opacity-70",
      )}
    >
      <div className="relative p-2">
        <ChipImage
          src={chip.imageUrl}
          level={chip.level}
          alt={chip.templateName}
          className={cn(
            "w-full",
            // Те же цвета, что в замке: оглушение — сепия, отдых — серый.
            busy?.kind === "stun" && "sepia brightness-75",
            busy?.kind === "rest" && "grayscale",
            busy?.kind === "study" && "grayscale",
          )}
        />
        {busy && (
          <span
            className={cn(
              "absolute inset-x-2.5 bottom-2.5 inline-flex items-center justify-center gap-1 rounded-md px-1 py-0.5 text-[8px] font-bold backdrop-blur",
              busy.kind === "stun" ? "bg-amber-500/90 text-black" : "bg-black/75 text-slate-200",
            )}
          >
            {/* Три состояния — три значка. Луна была ЕДИНСТВЕННОЙ на всех
                небоевых, и учащаяся выглядела «спящей» — как раз то, о чём
                ругался владелец. */}
            {busy.kind === "stun" ? (
              <Sparkles className="h-2.5 w-2.5 shrink-0" />
            ) : busy.kind === "study" ? (
              <GraduationCap className="h-2.5 w-2.5 shrink-0" />
            ) : (
              <Moon className="h-2.5 w-2.5 shrink-0" />
            )}
            {busy.kind === "study" ? busy.hint : busy.left}
          </span>
        )}
        {chip.isTraining && (
          <span className="absolute left-2.5 top-2.5 inline-flex items-center justify-center rounded-full bg-sky-500/85 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white backdrop-blur">
            {t("chips.training_badge")}
          </span>
        )}
        <span className="absolute right-2.5 top-2.5 inline-flex items-center justify-center rounded-full bg-background/85 px-1.5 py-0.5 font-mono text-[12px] font-bold text-foreground backdrop-blur">
          №{shownNumber ?? "?"}
        </span>
      </div>
    </button>
  );
}
