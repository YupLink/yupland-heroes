// Сетка ячеек одного хранилища героя — рюкзака или сумки зелий.
//
// Вынесено из BackpackGrid.tsx: хранилищ стало два, а сетка у них одна и та же
// (занятые клетки + пустые до ёмкости, раскладка — bagLayout). Сама ничего не
// решает — что выбросить и что выпить, говорит родитель.
import { LockKeyhole } from "lucide-react";
import { EmptyCell, FilledCell } from "./BackpackCell";
import type { Cell } from "./backpackCellList";
import { boostListText } from "@/lib/hero/boost";
import { isDaraiMineKey } from "@/lib/daraiMine";

export function BackpackCellsGrid({
  cells,
  lang,
  heroId = null,
  readOnly,
  allowUse,
  busy,
  onTrash,
  onUse,
  onInfo,
  chestKeys,
  onPlace,
  lockedCount = 0,
}: {
  cells: ReadonlyArray<Cell | null>;
  lang: "ru" | "en";
  /** Чей рюкзак — таймер гриба этого героя (нет — выбранного). */
  heroId?: string | null;
  readOnly: boolean;
  allowUse: boolean;
  busy: boolean;
  onTrash: (stackKey: string) => void;
  onUse: (stackKey: string) => void;
  onInfo: (stackKey: string) => void;
  /** Стеки-сундуки: у них кнопка «Поставить». */
  chestKeys?: ReadonlySet<string>;
  onPlace?: (stackKey: string) => void;
  lockedCount?: number;
}) {
  // Четыре колонки на телефоне, шире на десктопе. Пустые ячейки видны —
  // игрок сразу понимает, сколько ещё влезет.
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6">
      {cells.map((c, i) =>
        c ? (
          <FilledCell
            key={c.key}
            cell={c}
            heroId={heroId}
            // DARAI-шахту не выбрасывают — только размещают (lib/daraiMine).
            onTrash={readOnly || isDaraiMineKey(c.stackKey) ? null : () => onTrash(c.stackKey)}
            onUse={
              allowUse && c.boost?.length && c.usable && !busy ? () => onUse(c.stackKey) : null
            }
            onInfo={c.boost?.length || c.tool || c.apply ? () => onInfo(c.stackKey) : null}
            giftLine={c.boost?.length ? boostListText(c.boost, lang) : undefined}
            onPlace={
              !readOnly && onPlace && chestKeys?.has(c.stackKey) && !busy
                ? () => onPlace(c.stackKey)
                : null
            }
          />
        ) : (
          <EmptyCell key={`empty-${i}`} />
        ),
      )}
      {Array.from({ length: lockedCount }, (_, i) => (
        <div data-bag-locked role="img" aria-label={lang === "ru" ? "Ячейка недоступна" : "Slot unavailable"} key={`locked-${i}`}>
          <LockKeyhole aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}
