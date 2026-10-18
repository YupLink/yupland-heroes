// Грид инвентаря отряд-пикера: плитки «фишка × сколько свободно» плюс метки отдыха и
// оглушения. Разметка перенесена из ChipSquadPicker без изменений (файл там перевалил за
// 250 строк), правила доступности — тоже: пикер считает по ним автозаполнение и подрезку
// состава, и второй копии этих правил быть не должно.
import { GraduationCap, Moon, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { ChipImage, chipPanelClasses } from "@/components/ChipImage";
import { labelForLevel } from "@/components/chips/levelLabel";
import { CHIP_BUSY_HINT, chipBusyUntil, fmtBusyLeft } from "@/components/chips/chipBusy";

// Занятость считает общий модуль (components/chips/chipBusy.ts) — инвентарь,
// замок и бой обязаны говорить о фишке одно и то же. Реэкспорт остаётся ради
// тех, кто уже импортирует правило отсюда.
export { chipBusyUntil };

/** Экземпляр фишки: по нему видно, свободна она или «в ремонте». */
export type InvChipInstance = {
  id: string;
  serialNo: number | null;
  restUntil?: string | null;
  stunUntil?: string | null;
  /** Учится в университете: в бой не идёт, пока её оттуда не заберут. */
  studying?: boolean;
};

export type InvChip = {
  templateId: string;
  templateName: string;
  imageUrl: string;
  level: number;
  count: number;
  restingCount?: number;
  stunnedCount?: number;
  /** Сколько таких фишек учится в университете. */
  studyingCount?: number;
  tirage?: number | null;
  isPremium?: boolean;
  chips?: InvChipInstance[];
};
export const readyChipsOf = (c: InvChip, nowTick: number) =>
  (c.chips ?? []).filter(
    (ch) =>
      // Учащуюся в университете не берём вовсе: у отдыха и оглушения срок
      // кончится сам, а эта не выйдет в бой, пока игрок её не заберёт. Без
      // этой проверки «Авто» и «Заменить выбывших» ставили её в строй, а
      // сервер молча выкидывал — состав выходил неполным.
      !ch.studying &&
      !chipBusyUntil(ch.restUntil, nowTick) &&
      !chipBusyUntil(ch.stunUntil, nowTick),
  );
// Готовых считаем ПО фишкам: одна может и отдыхать, и быть оглушена — вычитать
// счётчики по отдельности значило бы посчитать её дважды.
export const readyCountOf = (c: InvChip, nowTick: number) =>
  (c.chips?.length ?? 0) > 0 ? readyChipsOf(c, nowTick).length : c.count;
/** Сколько таких фишек есть ВООБЩЕ, вместе с занятыми: состав на будущее (замок). */
export const totalCountOf = (c: InvChip) => c.chips?.length || c.count;

export function SquadInventoryGrid({
  chips,
  nowTick,
  usedOf,
  full,
  show,
  onShowMore,
  onAdd,
  allowBusy = false,
}: {
  chips: InvChip[];
  nowTick: number;
  /** Сколько таких фишек уже в отряде; full — отряд набран, добавлять некуда. */
  usedOf: (templateId: string, level: number) => number;
  full: boolean;
  show: number;
  onShowMore: () => void;
  onAdd: (c: InvChip) => void;
  /**
   * Замок: состав закрепляют НА БУДУЩЕЕ, поэтому оглушённые и отдыхающие тоже
   * кладутся в отряд — значки занятости остаются, а кнопка не гаснет.
   * По умолчанию выключено: в бою занятая фишка недоступна, как и была.
   */
  allowBusy?: boolean;
}) {
  const t = useT();
  if (chips.length === 0) {
    return <p className="py-1 text-center text-xs text-muted-foreground">{t("squad.no_chips")}</p>;
  }
  return (
    <>
      <div className="grid grid-cols-5 gap-1.5">
        {chips.slice(0, show).map((c) => {
          const have = allowBusy ? totalCountOf(c) : readyCountOf(c, nowTick);
          const left = have - usedOf(c.templateId, c.level);
          const resting = nowTick > 0 ? (c.restingCount ?? 0) : 0;
          const stunned =
            nowTick > 0
              ? (c.chips ?? []).filter((ch) => chipBusyUntil(ch.stunUntil, nowTick)).length
              : 0;
          // Учащиеся в университете: срока нет, считаем ровно те, что помечены
          // studying. Без этого «на карточке луна и подпись отдыха» — а на
          // самом деле фишка учится (studyingCount заведён в chips-pack).
          const studying =
            c.studyingCount ?? (c.chips ?? []).filter((ch) => ch.studying).length;
          const disabled = left <= 0 || full;
          // Гасим плитку, когда драться некому: в замке left считает и занятых,
          // поэтому по нему одному выбитая фишка выглядела бы боеспособной —
          // ровно на это и жаловался владелец, придя в замок после боя.
          const noneReady = nowTick > 0 && readyCountOf(c, nowTick) === 0;
          // Ближайшее снятие: список уже отфильтрован, дат-строк ISO хватает обычной сортировки.
          const busyDates = (pick: (ch: InvChipInstance) => string | null | undefined) =>
            (c.chips ?? [])
              .map(pick)
              .filter((v): v is string => chipBusyUntil(v, nowTick))
              .sort()[0] ?? null;
          const nextRest = resting > 0 ? busyDates((ch) => ch.restUntil) : null;
          const nextStun = stunned > 0 ? busyDates((ch) => ch.stunUntil) : null;
          return (
            <button
              key={`${c.templateId}-${c.level}`}
              disabled={disabled}
              onClick={() => onAdd(c)}
              className={cn(
                "group relative overflow-hidden rounded-xl p-1 text-left transition",
                chipPanelClasses(c.level),
                disabled ? "opacity-30" : "hover:brightness-110 active:scale-95",
              )}
            >
              <ChipImage
                src={c.imageUrl}
                level={c.level}
                alt={c.templateName}
                className={cn(
                  "w-full transition group-hover:scale-105",
                  // Недоступна: оглушение — сепия, отдых — серый.
                  noneReady && stunned > 0 && "sepia brightness-75",
                  // Обесцвечиваем и для отдыхающих, и для учащихся: обе не в
                  // строю. У stun своя сепия — не перекрываем.
                  noneReady && stunned === 0 && (resting > 0 || studying > 0) && "grayscale",
                )}
              />
              <span className="mt-0.5 block truncate text-center text-[9px] font-medium text-gold">
                {labelForLevel(c.level)}
              </span>
              {left > 0 && (
                <span className="absolute right-0.5 top-0.5 rounded-md bg-gold/90 px-1 text-[9px] font-bold text-gold-foreground">
                  ×{left}
                </span>
              )}
              {/* Оглушённые важнее показать (их «оживит» только время),
                  отдыхающие — вторым приоритетом. */}
              {/* Порядок важнее всего: оглушение → обучение → отдых. Оглушение
                   снимет только время, у обучения срока нет, отдых пройдёт сам. */}
              {stunned > 0 ? (
                <span
                  title={t(CHIP_BUSY_HINT.stun)}
                  className="absolute inset-x-0 bottom-0 inline-flex items-center justify-center gap-0.5 bg-amber-500/85 px-0.5 py-px text-center text-[8px] font-bold text-black"
                >
                  {/* Тот же значок, что «Оглушение» у способностей босса. */}
                  <Sparkles className="h-2.5 w-2.5 shrink-0" />
                  {stunned > 1 ? `×${stunned} ` : ""}
                  {fmtBusyLeft(nextStun, nowTick, t)}
                </span>
              ) : studying > 0 ? (
                <span
                  title={t(CHIP_BUSY_HINT.study)}
                  className="absolute inset-x-0 bottom-0 inline-flex items-center justify-center gap-0.5 bg-black/70 px-0.5 py-px text-center text-[8px] font-bold text-slate-300"
                >
                  <GraduationCap className="h-2.5 w-2.5 shrink-0" />
                  {studying > 1 ? `×${studying} ` : ""}
                  {t("squad.busy_study")}
                </span>
              ) : resting > 0 ? (
                <span
                  title={t(CHIP_BUSY_HINT.rest)}
                  className="absolute inset-x-0 bottom-0 inline-flex items-center justify-center gap-0.5 bg-black/70 px-0.5 py-px text-center text-[8px] font-bold text-slate-300"
                >
                  <Moon className="h-2.5 w-2.5 shrink-0" />
                  {resting > 1 ? `×${resting} ` : ""}
                  {fmtBusyLeft(nextRest, nowTick, t)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {chips.length > show && (
        <button
          onClick={onShowMore}
          className="mt-2 w-full rounded-lg border border-border py-1.5 text-xs text-muted-foreground transition hover:border-gold/40"
        >
          {t("squad.show_more", { n: chips.length - show })}
        </button>
      )}
    </>
  );
}
