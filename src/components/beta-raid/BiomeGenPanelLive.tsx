// Панель генератора зоны на живой карте (режим бога).
//
// Появляется, как только админ взял кисть «Биом» (сентинел GEN_ON): там же
// выбирается, как набирать зону — кистью или прямоугольником. Генерация
// уходит В ТУ ЖЕ очередь правок кисти — подсветка золотом появляется штатным
// механизмом, повторный прогон перезаписывает патчи по тем же клеткам.
//
// Раньше здесь был ещё «Простой» режим (клиентский генератор по биому из
// списка); владелец 22.09 велел оставить только «Зону» — рецепт местностей
// с весами, ИИ-подсказку и серверный генератор по сиду (zonegen/ZoneGenPanel).
// Тот же клиентский генератор живёт в hex-editor и там не трогался.
//
// Обёртка одна: fixed поверх карты, в обоих полноэкранных режимах. Свёрнутая
// панель — одна строка у нижнего края: карта под ней видна, тапы по клеткам
// проходят. Сворачивается сама, когда админу нужна карта: выбрал
// прямоугольник (нужны два тапа) или получил генерацию (смотреть результат).
import { useCallback, useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import type { CellPatch } from "./patchMapCache";
import { ZoneGenPanel } from "./zonegen/ZoneGenPanel";
import { GenSelectRow } from "./zonegen/GenSelectRow";
import type { GenSelectMode } from "./zonegen/useGenSelection";

export function BiomeGenPanelLive({
  count,
  selectedForGen,
  queueCells,
  discardKeys,
  onResetSelection,
  selectMode,
  onSelectMode,
  corner,
  tooBig,
}: {
  /** Сколько клеток в selectedForGen (для счётчика). */
  count: number;
  /** Клетки для генерации — Set ключей «q,r». */
  selectedForGen: Set<string>;
  /** Пачка правок одним коммитом — так кладёт зону серверный генератор. */
  queueCells: (patches: CellPatch[]) => void;
  /** Снять с очереди правки по ключам («Забыть правки»). */
  discardKeys: (keys: string[]) => void;
  /** Просто очистить selectedForGen: правки в очереди остаются. */
  onResetSelection: () => void;
  /** Как набираем зону: кистью или прямоугольником по двум углам. */
  selectMode: GenSelectMode;
  onSelectMode: (mode: GenSelectMode) => void;
  /** Первый угол прямоугольника (ждём второй тап) — для подсказки. */
  corner: ZoneCell | null;
  /** Отклонённый прямоугольник (клеток больше лимита) — для подсказки. */
  tooBig: number | null;
}) {
  const t = useT();
  const [collapsed, setCollapsed] = useState(false);
  const collapse = useCallback(() => setCollapsed(true), []);
  const pickSelectMode = (m: GenSelectMode) => {
    onSelectMode(m);
    if (m === "rect") setCollapsed(true);
  };

  return (
    <div
      // Плавающая панель поверх карты (fixed): нужна и в полноэкранном, и в
      // обычном режиме. z-[60] — над канвасом (тот сам z-40 в fullscreen).
      // На широком экране прижата к правому краю, а не к центру: центр — это
      // карта, по которой админ тапает углы и смотрит результат. На 360 px
      // занимает ширину экрана минус поля и прокручивается сама.
      className={cn(
        "pointer-events-auto fixed bottom-24 left-1/2 z-[60] flex w-[calc(100vw-16px)] max-w-md -translate-x-1/2 flex-col gap-1.5 rounded-xl border border-gold/40 bg-black/85 p-2 text-xs shadow-2xl backdrop-blur sm:bottom-14 sm:left-auto sm:right-3 sm:translate-x-0",
        !collapsed && "max-h-[70vh] overflow-auto",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-gold" />
        <b className="text-gold">{t("zonegen.title")}</b>
        <span className="ml-auto rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-bold text-gold tabular-nums">
          {t("zonegen.cells_n", { n: count })}
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? t("zonegen.expand") : t("zonegen.collapse")}
          className="rounded-md bg-secondary/40 p-1 text-muted-foreground"
        >
          {collapsed ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Строка выделения — только в развёрнутом виде; свёрнутый показывает лишь
          подсказку про углы, чтобы не занимать карту. */}
      {collapsed ? (
        selectMode === "rect" && (
          <p className="text-[10px] text-muted-foreground">
            {corner
              ? t("zonegen.rect_second", { q: corner.q, r: corner.r })
              : t("zonegen.rect_first")}
          </p>
        )
      ) : (
        <GenSelectRow mode={selectMode} onMode={pickSelectMode} corner={corner} tooBig={tooBig} />
      )}

      {/* ZoneGenPanel — ОДИН узел в обоих видах: иначе React пересоздавал бы
          его при сворачивании и терял рецепт с отчётом. */}
      <ZoneGenPanel
        count={count}
        selectedForGen={selectedForGen}
        queueCells={queueCells}
        discardKeys={discardKeys}
        onResetSelection={onResetSelection}
        compact={collapsed}
        onGenerated={collapse}
      />
    </div>
  );
}
