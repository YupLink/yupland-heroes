// Клетка рюкзака: одна нарисованная ячейка сетки.
//
// Вынесено из BackpackGrid, потому что сетка упёрлась в лимит файла, а клетка
// — вещь в себе: её правят отдельно от логики «что перечитать после действия».
//
// У товара-буста на клетке ВИДНО, что он даёт (владелец, 10.09): раньше это
// жило в title-подсказке кнопки, а на телефоне подсказку не увидеть вовсе —
// игрок жал «Использовать» вслепую. Строка короткая, полный разбор и описание
// открываются нажатием на саму клетку.
import { Apple, Bomb, Package, Dumbbell, Hand, MapPinPlus, Trash2 } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { thumb } from "@/lib/image";
import { CELL_SIZE } from "@/lib/hero/backpackCells";
import { qtyText } from "@/lib/qtyPick";
import { shownDurability } from "@/lib/raid/mainTool";
import type { Cell } from "./backpackCellList";
import { dmineNameOr, isDaraiMineKey } from "@/lib/daraiMine";
import { isRockStackKey, isTreeStackKey, treeNameOr } from "@/lib/treePlant";
import { isDynamiteKey } from "@/lib/dynamite";
import { isLandStackKey } from "@/lib/landPlace";
import { isVeinStackKey, veinNameOr } from "@/lib/veinPlace";
import { DaraiMineTimer } from "./dmine/DaraiMineTimer";

export function FilledCell({
  cell,
  onTrash,
  onUse,
  onInfo,
  giftLine,
  onPlace = null,
  heroId = null,
}: {
  cell: Cell;
  onTrash: (() => void) | null;
  /** Есть только у товаров-бустов: обычным использовать нечего. */
  onUse: (() => void) | null;
  /** Открыть карточку с описанием — тоже только у бустов. */
  onInfo: (() => void) | null;
  /** Что даёт буст — короткой строкой прямо на клетке. */
  giftLine?: string;
  /** Магический сундук: поставить на клетку, где стоит герой. */
  onPlace?: (() => void) | null;
  /** Чей рюкзак: таймер гриба — этого героя (нет — выбранного). */
  heroId?: string | null;
}) {
  const t = useT();
  const lang = useLang();
  // Еда (сытость) — значок яблока, как у шкалы сытости.
  const food = !!cell.boost?.some((e) => e.stat === "satiety");
  const dmine = isDaraiMineKey(cell.stackKey);
  // Дерево (lib/treePlant) — «Посадить», динамит — «Бросить», прочее (и камень) — «Поставить».
  const dynamite = isDynamiteKey(cell.stackKey);
  const tree = isTreeStackKey(cell.stackKey) && !isRockStackKey(cell.stackKey);
  // Земля мира строителей (lib/landPlace) и жила (lib/veinPlace) — «Положить».
  const land = isLandStackKey(cell.stackKey) || isVeinStackKey(cell.stackKey);
  const placeLabel = tree ? (lang === "ru" ? "Использовать" : "Use") : t(
    dynamite ? "dynamite.throw" : tree ? "tree.plant" : land ? "land.put" : "chest.place",
  );
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl border border-gold/30 bg-secondary/40">
      {cell.image ? (
        <img src={thumb(cell.image, 120, "black")} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-gold/40">
          <Package className="h-6 w-6" />
        </div>
      )}
      {/* Нажатие по самой клетке открывает карточку товара. Лежит ПОД кнопками
          урны и использования: они рисуются позже и перекрывают её. */}
      {onInfo && (
        <button
          type="button"
          onClick={onInfo}
          aria-label={cell.name}
          className="absolute inset-0 h-full w-full"
        />
      )}
      {/* Имя внизу поверх затемнения — читается на любой картинке. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-1 pb-1 pt-3">
        <div className="truncate text-[9px] font-semibold leading-tight text-white">
          {/* Гриб — имя своего вида (DARAI / золотой / алмазный) на языке игрока. */}
          {/* Жила — имя своего вида (золотая / алмазная) на языке игрока. */}
          {veinNameOr(
            cell.stackKey,
            treeNameOr(cell.stackKey, dmineNameOr(cell.stackKey, cell.name, lang), lang),
            lang,
          )}
        </div>
        {/* Гриб: сколько ему лежать до выпадения (встанет сам или умрёт). */}
        {dmine && <DaraiMineTimer stackKey={cell.stackKey} heroId={heroId} />}
        {giftLine && (
          <div className="truncate text-[8px] font-bold leading-tight text-gold">{giftLine}</div>
        )}
        {/* Прочность текущей штуки инструмента (28.09): на последней ячейке стека;
            рука — инструмент в руках героя (§8.24). 0 % не бывает: штука на нуле
            уже сломалась и ушла. */}
        {(cell.durability != null || cell.main) && (
          <div
            aria-label={
              cell.durability != null
                ? t("braid.tool_durability", { n: shownDurability(cell.durability) })
                : t("tool.main")
            }
            className={`flex items-center gap-0.5 text-[9px] font-bold leading-tight tabular-nums ${cell.durability != null && cell.durability <= 25 ? "text-destructive" : "text-gold"}`}
          >
            {cell.main && <Hand className="h-2.5 w-2.5 shrink-0 text-gold" />}
            {cell.durability != null && `${shownDurability(cell.durability)}%`}
          </div>
        )}
      </div>
      {/* N/CELL_SIZE — сколько единиц вида в ячейке. Дробь с наград печаталась
          целиком (0.2356088130679914/20): теперь тем же qtyText, что окно
          выброса, до сотых — чтобы счётчик на телефоне не уходил под корзину. */}
      <span className="pointer-events-none absolute left-1 top-1 rounded-full bg-black/75 px-1 py-0.5 text-[9px] font-extrabold text-gold">
        {qtyText(cell.units, lang, 2)}/{CELL_SIZE}
      </span>
      {/* Урна: открывает окно «сколько выбросить». */}
      {onTrash && (
        <button
          type="button"
          onClick={onTrash}
          aria-label={t("braid.backpack_discard")}
          className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      {/* Кнопка появляется ТОЛЬКО у товара-буста: у остальных её нет вовсе,
          как и любых упоминаний бустов. */}
      {onUse && (
        <button
          type="button"
          onClick={onUse}
          title={giftLine}
          aria-label={giftLine ?? t(food ? "braid.boost_item_eat" : "braid.boost_item_use")}
          className="absolute bottom-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-gold text-gold-foreground"
        >
          {food ? <Apple className="h-3.5 w-3.5" /> : <Dumbbell className="h-3.5 w-3.5" />}
        </button>
      )}
      {onPlace && (
        <button
          type="button"
          onClick={onPlace}
          title={placeLabel}
          aria-label={placeLabel}
          className={`absolute bottom-1 ${onUse ? "right-8" : "right-1"} grid h-6 w-6 place-items-center rounded-full bg-gold text-gold-foreground`}
        >
          {dynamite ? <Bomb className="h-3.5 w-3.5" /> : <MapPinPlus className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}

export function EmptyCell() {
  return (
    <div className="grid aspect-square place-items-center rounded-xl border border-dashed border-border/70 bg-secondary/10 text-muted-foreground/25">
      <Package className="h-5 w-5" />
    </div>
  );
}

