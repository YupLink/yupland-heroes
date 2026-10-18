// Пикер шаблона товара: по типу (герой/арт/пак/босс) тянет список и открывает
// ПОПАП с картинками поверх. Выбор — тап по превью, «Выбрать» применяет и
// закрывает. Попап рисуется порталом в body, чтобы предок с backdrop-blur/
// overflow не обрезал его футер с кнопкой. Отдаёт id+имя+картинку.
//
// Каркас попапа держим здесь, а соседи забрали своё (лимит ≤250 строк):
// refPickerSources — откуда берутся шаблоны, RefPickerGrid — плитки и удаление,
// RefThumb — картинка, refCategoryGroups + RefPickerCustomTop — категории своих
// товаров (чипы-фильтр, группы, справочник).
import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus, X } from "lucide-react";
import { MarketCustomCreate } from "./MarketCustomCreate";
import { RefPickerGrid } from "./RefPickerGrid";
import { RefThumb } from "./RefThumb";
import { RefPickerCustomTop } from "./RefPickerCustomTop";
import { fetchRefs, type Ref } from "./refPickerSources";
import { refCategoryView } from "./refCategoryGroups";
import type { MarketKind } from "@/lib/marketItem";
import { listItemCategories } from "@/server/api/beta-raid/item-categories";

export function MarketRefPicker({
  kind,
  value,
  onPick,
  noArtAny,
}: {
  kind: MarketKind;
  value: string | null;
  onPick: (ref: Ref) => void;
  /** Скрыть «любой арт редкости X» — там, где игрок не выберет, чем платит. */
  noArtAny?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Выбор храним целым объектом, а не id: «Выбрать» применяет именно выделенную
  // запись и не зависит от того, есть ли она сейчас в списке (рефетч/фильтр
  // могли её выкинуть — раньше выбор молча терялся).
  const [picked, setPicked] = useState<Ref | null>(null);
  // Режим «создать новый» для custom: своя картинка+имя → шаблон raid_custom_item.
  const [creating, setCreating] = useState(false);
  // Правка существующего шаблона (задан → форма открыта на редактирование).
  const [editing, setEditing] = useState<Ref | null>(null);
  const qc = useQueryClient();
  const q = useQuery({
    // Ключ помнит про фильтр: без него список без «любых артов» лёг бы в кэш
    // и подменил бы полный в соседнем пикере.
    queryKey: ["market-ref", kind, noArtAny ? "no-any" : "all"],
    queryFn: () => fetchRefs(kind, noArtAny),
    staleTime: 60_000,
    // Держим список дольше в памяти — повторное открытие пикера мгновенно.
    gcTime: 10 * 60_000,
    // Транзиент моста больше не залипает на «Не загрузилось»: сами повторяем
    // с нарастающей паузой, пользователю не надо жать «Повторить» вручную.
    retry: 3,
    retryDelay: (n) => Math.min(2000, 300 * 2 ** n),
    enabled: open || !!value,
  });
  const list = q.data ?? [];
  const current = list.find((x) => x.id === value) ?? null;
  // Свои товары — по категориям: отмеченные чипы (пусто — все) и группы сетки.
  const [catSel, setCatSel] = useState<string[]>([]);
  const catsQ = useQuery({
    queryKey: ["item-categories"],
    queryFn: () => listItemCategories(),
    staleTime: 60_000,
    enabled: open && kind === "custom",
  });
  const view = kind === "custom" ? refCategoryView(list, catsQ.data, catSel) : null;

  const openPicker = () => {
    setPicked(list.find((x) => x.id === value) ?? null);
    setCreating(false);
    setEditing(null);
    setOpen(true);
  };
  const confirm = () => {
    if (picked) onPick(picked);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-left"
      >
        <div className="h-9 w-9 shrink-0">
          <RefThumb image={current?.image ?? null} />
        </div>
        <span className="min-w-0 flex-1 truncate text-sm">
          {current?.name ?? (value ? value : "— выбери —")}
        </span>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[140] flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="flex max-h-[85dvh] w-full max-w-sm flex-col overflow-hidden rounded-t-2xl border border-border bg-background sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
                <h4 className="font-display text-sm font-bold">Выбери товар</h4>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Закрыть"
                  className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[calc(env(safe-area-inset-bottom)+16px)]">
                {kind === "custom" && !creating && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(null);
                      setCreating(true);
                    }}
                    className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gold/50 py-2 text-xs font-semibold text-gold"
                  >
                    <Plus className="h-3.5 w-3.5" /> Создать новый
                  </button>
                )}
                {view && !creating && (
                  <RefPickerCustomTop
                    cats={view.cats}
                    counts={view.counts}
                    selected={view.selected}
                    onChange={setCatSel}
                  />
                )}
                {creating ? (
                  <MarketCustomCreate
                    editing={editing}
                    onCreated={(item) => {
                      void qc.invalidateQueries({ queryKey: ["market-ref", "custom"] });
                      setPicked({
                        id: item.id,
                        name: item.name,
                        image: item.image,
                        description: item.description,
                        boost: item.boost,
                        isPotion: item.isPotion,
                        isShovel: item.isShovel,
                        categoryId: item.categoryId,
                        isRod: item.isRod,
                      });
                      setCreating(false);
                      setEditing(null);
                    }}
                  />
                ) : q.isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> загрузка…
                  </div>
                ) : q.isError ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
                    Не загрузилось
                    <button
                      type="button"
                      onClick={() => q.refetch()}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
                    >
                      Повторить
                    </button>
                  </div>
                ) : list.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Пусто</p>
                ) : (
                  <RefPickerGrid
                    kind={kind}
                    list={list}
                    groups={view?.groups}
                    picked={picked}
                    onPick={setPicked}
                    onEdit={(r) => {
                      setEditing(r);
                      setCreating(true);
                    }}
                    onDeleted={(id) => setPicked((p) => (p?.id === id ? null : p))}
                  />
                )}
              </div>
              <div className="shrink-0 border-t border-border p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
                <button
                  type="button"
                  onClick={confirm}
                  disabled={!picked}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  {picked ? `Выбрать: ${picked.name}` : "Выбери товар"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
