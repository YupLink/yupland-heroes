// Выброс из рюкзака: сколько именно выкинуть.
//
// Раньше урна убирала ВЕСЬ вид: у железа на две ячейки игрок жал «выбросить»,
// рассчитывая освободить одну, и терял всё. Поэтому спрашиваем не только
// «точно?», но и «сколько». С 29.09.2026 выброшенное падает мешочком на
// клетке героя (ПРАВИЛА §8.21) — кроме изношенной штуки инструмента: при
// выбросе всего она уничтожается, и окно говорит это строкой. Само окно
// «сколько» — общее со складом (QtyDialog): поле с −/+, «Ячейку» и «Всё».
import { Trash2 } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { CELL_SIZE } from "@/lib/hero/backpackCells";
import { qtyText } from "@/lib/qtyPick";
import { shownDurability } from "@/lib/raid/mainTool";
import { QtyDialog } from "./QtyDialog";

export function BackpackDiscardModal({
  name,
  image,
  total,
  durability,
  busy,
  onDiscard,
  onClose,
}: {
  name: string;
  image: string | null;
  /** Сколько единиц вида лежит в рюкзаке. */
  total: number;
  /** Прочность текущей штуки инструмента, % (нет — не инструмент с износом). */
  durability?: number | null;
  busy: boolean;
  onDiscard: (qty: number) => void;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLang();
  // Сколько нужно выкинуть, чтобы освободить ОДНУ ячейку. Считаем от неполной:
  // у 25 единиц (20 + 5) хватит выбросить 5, а не 20 — расход идёт из меньшей
  // ячейки, иначе игрок терял бы полный стек ради того же места. Дробный
  // остаток (0,000178) — это и есть вся ячейка.
  const tail = total % CELL_SIZE || Math.min(total, CELL_SIZE);
  const cellsFreed = (qty: number) =>
    Math.ceil(total / CELL_SIZE) - Math.ceil(Math.max(0, total - qty) / CELL_SIZE);
  // Изношенная штука уходит только с «Всё» — и тогда сгорает, в мешочек не падает.
  const worn = durability != null && durability < 100;

  return (
    <QtyDialog
      name={name}
      image={image}
      haveKey="braid.backpack_have"
      total={total}
      cell={tail}
      icon={Trash2}
      label={t("braid.backpack_discard")}
      tone="danger"
      note={(qty) => (
        <>
          {t("braid.backpack_discard_note", { n: qtyText(qty, lang), cells: cellsFreed(qty) })}
          {worn && qty >= total && (
            <span className="mt-1 block font-semibold text-destructive">
              {t("braid.backpack_discard_worn", { n: shownDurability(durability ?? 0) })}
            </span>
          )}
        </>
      )}
      busy={busy}
      onSubmit={onDiscard}
      onClose={onClose}
    />
  );
}
