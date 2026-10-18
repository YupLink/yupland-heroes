// «Закопать» магический сундук (ПРАВИЛА §8.15 п. 10): без живой охраны — любой
// игрок вплотную (владелец, 30.09), хозяин и чужой — одной кнопкой. Лопата —
// основной инструмент (§8.24): кнопка общая с мешочком и обычным сундуком
// (ShovelButton) — «Взять <Лопата>», «Нужна лопата» или сразу действие.
// 2 энергии и износ лопаты — на сервере (pchest-dig), он же ещё раз проверит
// охрану и лопату в руках.
import { useBuryChest } from "@/components/beta-raid/plain-chest/usePlainChest";
import { ShovelButton } from "@/components/beta-raid/tool/ShovelButton";

export function ChestBuryButton({
  q,
  r,
  busy = false,
  onDone,
}: {
  q: number;
  r: number;
  /** Идёт другое дело окна («Забрать сундук») — не жмём. */
  busy?: boolean;
  /** Сундук ушёл в бугорок — окна больше нет. */
  onDone: () => void;
}) {
  const bury = useBuryChest(q, r, onDone);
  return (
    <ShovelButton
      label="bag.bury"
      busy={bury.isPending}
      disabled={busy}
      onDig={() => bury.mutate()}
      className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-border px-4 py-3 text-sm font-semibold disabled:opacity-50"
    />
  );
}
