// Ячейки склада: сетка как в рюкзаке. Презентационный блок, отделён от
// WarehouseAction ради лимита ≤250 строк на файл. Ничего не считает и не ходит
// в сеть — стеки и ёмкость приходят готовыми из getWarehouse.
import { ArrowLeft, ArrowRight, Loader2, Package, Sprout } from "lucide-react";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { CELL_SIZE } from "@/lib/warehouseCells";
import { useLang } from "@/lib/i18n";
import { qtyText } from "@/lib/qtyPick";
import { marketResourceIconSrc } from "@/lib/resourceIcons";
import { isDaraiMineKey } from "@/lib/daraiMine";
import type { Cell } from "./warehouseGrid";
import { DaraiMineTimer } from "./dmine/DaraiMineTimer";

/** Иконка ячейки склада: у ресурса своя (по refId), у предмета — картинка snap. */
function slotIconSrc(s: {
  kind?: string;
  refId?: string | null;
  image: string | null;
}): string | null {
  if (s.image) return thumb(s.image, 120, "black");
  if (s.kind === "resource" && s.refId) return marketResourceIconSrc(s.refId);
  return null;
}

/** Ячейка с товаром: картинка, имя, счётчик и стрелка направления. */
export function FilledCell({
  cell,
  own,
  dir,
  busy,
  onClick,
  movable,
  bare,
}: {
  cell: Cell;
  /** Личная ячейка склада — подсвечиваем жёлтым. */
  own?: boolean;
  /** Куда переложит тап: `in` — на склад (стрелка вправо), `out` — в рюкзак. */
  dir: "in" | "out";
  busy: boolean;
  onClick: () => void;
  /** Сколько штук плитки уйдёт тапом (окно сундука: собранное) — число у стрелки. */
  movable?: number;
  /** Не ячейка, а счёт (ресурс в мешочке, §8.70): только число, без «/20». */
  bare?: boolean;
}) {
  const s = cell.stack;
  const lang = useLang();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={s.name}
      className={cn(
        "relative aspect-square overflow-hidden rounded-lg border bg-secondary/40 transition active:scale-95 disabled:opacity-60",
        own ? "border-gold/70 ring-1 ring-gold/50" : "border-border/60",
      )}
    >
      {(() => {
        const src = slotIconSrc(s);
        return src ? (
          <img
            src={src}
            alt=""
            className="h-full w-full object-cover [image-rendering:pixelated]"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted-foreground/40">
            <Package className="h-5 w-5" />
          </div>
        );
      })()}
      {/* Имя внизу поверх затемнения — читается на любой картинке. */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1 pb-0.5 pt-3">
        <div className="truncate text-[8px] font-semibold leading-tight text-white">{s.name}</div>
        {/* Гриб в рюкзаке (колонка героя — `in`): сколько ему лежать до выпадения. */}
        {dir === "in" && isDaraiMineKey(s.stackKey) && <DaraiMineTimer stackKey={s.stackKey} />}
      </div>
      {/* Сколько единиц вида в ячейке — тем же qtyText, что окно «сколько»
          (до сотых: плитка узкая), крошка 0,000455 — не «0». */}
      <span
        className={cn(
          "absolute left-0.5 top-0.5 rounded-full bg-black/75 px-1 text-[8px] font-extrabold",
          own ? "text-gold" : "text-white",
        )}
      >
        {qtyText(cell.units, lang, 2)}
        {!bare && `/${CELL_SIZE}`}
      </span>
      {/* Направление переноса — чтобы тап не был загадкой; у сундука рядом
          число: сколько штук плитки уйдёт (собранное). */}
      <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center gap-0.5 rounded-full bg-black/70 px-0.5 text-white">
        {movable !== undefined && movable > 0 && (
          <span className="text-[8px] font-extrabold leading-none text-emerald-300">
            {qtyText(movable, lang, 2)}
          </span>
        )}
        {busy ? (
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
        ) : dir === "in" ? (
          <ArrowRight className="h-2.5 w-2.5" />
        ) : (
          <ArrowLeft className="h-2.5 w-2.5" />
        )}
      </span>
    </button>
  );
}

/** Личный товар: то, что на полке, поверх дробного «зреет» с поля. */
export type OwnItem = {
  stackKey: string;
  name: string;
  image: string | null;
  /** Единиц НА ПОЛКЕ — может быть дробным (0,79 от босса); их и забираем. */
  whole: number;
  /** Дробный хвост, что ещё зреет на поле (< 1, ещё не на полке). */
  frac: number;
};

export function OwnCell({
  item,
  busy,
  onTake,
}: {
  item: OwnItem;
  busy: boolean;
  onTake: () => void;
}) {
  // Дробь на полке — реальный товар: 0,79 забирается так же, как 20. Раньше
  // порог был «≥ 1», и дробная полка рисовалась ростком «зреет» навсегда.
  const takeable = item.whole > 0;
  // Полочное и зреющее — раздельно: «0.79» и «+0.3», а не общее «1.09», из
  // которого забирается почему-то 0,79.
  // Пустая полка с ростком — только «+0,3», без нуля впереди. Числа — как в
  // окне «сколько» (qtyText до сотых): крошка 0,000455 не выглядит нулём.
  const lang = useLang();
  const label = item.whole > 0 ? qtyText(item.whole, lang, 2) : "";
  return (
    <button
      type="button"
      onClick={onTake}
      disabled={!takeable || busy}
      title={item.name}
      className={cn(
        "relative aspect-square overflow-hidden rounded-lg border bg-secondary/40 transition active:scale-95",
        takeable ? "border-gold/70 ring-1 ring-gold/50" : "border-dashed border-gold/40 opacity-90",
      )}
    >
      {item.image ? (
        <img src={thumb(item.image, 120, "black")} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-muted-foreground/40">
          <Package className="h-5 w-5" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1 pb-0.5 pt-3">
        <div className="truncate text-[8px] font-semibold leading-tight text-white">
          {item.name}
        </div>
      </div>
      {/* Счётчик: на полке — золотым, зреющий хвост с поля — зелёным «+». */}
      <span className="absolute left-0.5 top-0.5 rounded-full bg-black/75 px-1 text-[8px] font-extrabold text-gold">
        {label}
        {item.frac > 0 && <span className="text-emerald-400"> +{qtyText(item.frac, lang, 2)}</span>}
      </span>
      {/* Забрать (стрелка в рюкзак) — когда на полке хоть что-то есть. */}
      <span className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-black/70 text-white">
        {busy ? (
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
        ) : takeable ? (
          <ArrowLeft className="h-2.5 w-2.5" />
        ) : (
          <Sprout className="h-2.5 w-2.5 text-emerald-400" />
        )}
      </span>
    </button>
  );
}

/** Пустая ячейка: у личных — жёлтый пунктир, у общих — обычный. */
export function EmptyCell({ own }: { own?: boolean }) {
  return (
    <div
      className={cn(
        "grid aspect-square place-items-center rounded-lg border border-dashed bg-secondary/10",
        own ? "border-gold/40 text-gold/25" : "border-border/60 text-muted-foreground/20",
      )}
    >
      <Package className="h-4 w-4" />
    </div>
  );
}
