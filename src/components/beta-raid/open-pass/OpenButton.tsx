// Кнопка «Открыть · N⚡» (ПРАВИЛА §8.23): цена — от сервера, та же, что он
// спишет: мешочек 1, сундук — занятые ячейки, но не меньше 1 (lib/openPass;
// ответ прошлой версии с нулём — тоже 1). Каждое новое открытие платит.
// Показанную цену кнопка отдаёт в onOpen: сервер не спишет больше неё (сундук
// наполнили под рукой — отказ «Цена изменилась», окно покажет новую). Энергии
// меньше цены — кнопка неактивна и говорит, сколько нужно: сервер всё равно
// проверит сам (отказ «Нужно N энергии»).
import { Loader2, LockOpen } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useEnergy } from "@/lib/hooks/useEnergy";
import { chestOpenPrice } from "@/lib/openPass";

export function OpenButton({
  price,
  busy,
  onOpen,
}: {
  price: number;
  busy: boolean;
  /** Нажали: price — цена, которую кнопка показала игроку. */
  onOpen: (price: number) => void;
}) {
  const t = useT();
  const energy = useEnergy().data?.energy;
  const n = chestOpenPrice(price);
  const short = energy != null && energy < n;
  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      disabled={busy || short}
      className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />}
      {short ? t("braid.need_energy", { n }) : t("pass.open", { n })}
    </button>
  );
}
