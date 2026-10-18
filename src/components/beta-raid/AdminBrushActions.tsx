// Две кнопки режима бога, которые не про кисть, а про массовые действия:
// «Раздать» (переразложить объекты по карте) и «Создать» (завести новый
// шаблон прямо с карты). Вынесено из AdminBrushBar ради лимита ≤250 строк.
//
// Обе заперты, пока очередь правок не выгружена: они пишут в те же клетки,
// а ластик, уехавший ПОСЛЕ них, стёр бы свежепоставленный объект.
import { Plus, Shuffle } from "lucide-react";
import type { GodText } from "./adminCellText";

export function AdminBrushActions({
  t,
  blocked,
  onGiveaway,
  onCreate,
}: {
  t: GodText;
  /** Очередь не выгружена или идёт отправка — действия недоступны. */
  blocked: boolean;
  onGiveaway: () => void;
  onCreate: () => void;
}) {
  const btn =
    "inline-flex shrink-0 items-center gap-1 rounded-lg border border-gold/40 px-2 py-1 text-[11px] font-semibold text-gold disabled:opacity-40";
  return (
    <>
      <button
        type="button"
        onClick={onGiveaway}
        disabled={blocked}
        title={blocked ? t.giveawayBlocked : t.giveawayTitle}
        className={btn}
      >
        <Shuffle className="h-3.5 w-3.5" />
        {t.giveaway}
      </button>
      <button
        type="button"
        onClick={onCreate}
        disabled={blocked}
        title={blocked ? t.createBlocked : t.createTitle}
        className={btn}
      >
        <Plus className="h-3.5 w-3.5" />
        {t.create}
      </button>
    </>
  );
}
