// Выбор товаров ратуши пачкой (владелец, 04.10.2026): галками сразу много,
// фильтр чипами категорий (можно несколько разом), поиск по имени. Добавленный
// товар сразу с ценой, расходом и производством по умолчанию (townGoodDefaults),
// склад сервер заведёт ровно на норму — цена ×1. Отсюда же: отмеченные свои
// товары — «В категорию» пачкой, и справочник категорий.
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderInput, Loader2, Plus, Settings2, X } from "lucide-react";
import { toast } from "sonner";
import { getTownPriceHints } from "@/server/api/beta-raid/town-price-hints";
import { setItemsCategory } from "@/server/api/beta-raid/item-categories";
import { groupByCategory, NO_CATEGORY } from "@/lib/itemCategories";
import { defaultTownGood } from "@/lib/townGoodDefaults";
import type { TownGood } from "@/lib/townConfig";
import { humanError } from "@/lib/humanError";
import { CategoryChips } from "../market/CategoryChips";
import { CategoryManager } from "../market/CategoryManager";
import { TownPickerList } from "./TownPickerList";
import { townRefKey, useTownRefs } from "./useTownRefs";

export function TownGoodsPicker({
  residents,
  existing,
  onAdd,
  onClose,
}: {
  residents: number;
  existing: TownGood[];
  onAdd: (goods: TownGood[]) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const cat = useTownRefs();
  const hints = useQuery({
    queryKey: ["town-price-hints"],
    queryFn: () => getTownPriceHints(),
    // Цены только что настроенного города должны доехать до следующего.
    staleTime: 0,
  });
  const [chips, setChips] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [manage, setManage] = useState(false);
  const [moving, setMoving] = useState(false);

  const taken = useMemo(
    () => new Set(existing.map((g) => townRefKey(g.kind, g.refId))),
    [existing],
  );
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of cat.refs) m.set(r.catId, (m.get(r.catId) ?? 0) + 1);
    return m;
  }, [cat.refs]);
  const needle = search.trim().toLowerCase();
  const shown = cat.refs.filter(
    (r) =>
      (chips.length === 0 || chips.includes(r.catId)) &&
      (!needle || r.name.toLowerCase().includes(needle)),
  );
  const groups = groupByCategory(shown, (r) => r.catId, cat.cats);
  const pickedCustom = [...checked].filter((k) => cat.byKey.get(k)?.kind === "custom");

  const toggle = (key: string) =>
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const toggleGroup = (keys: string[], on: boolean) =>
    setChecked((s) => {
      const n = new Set(s);
      for (const k of keys) {
        if (on) n.add(k);
        else n.delete(k);
      }
      return n;
    });

  const add = () => {
    const goods = [...checked].flatMap((key) => {
      const r = cat.byKey.get(key);
      if (!r || taken.has(key)) return [];
      return [
        defaultTownGood({
          kind: r.kind,
          refId: r.refId,
          categoryId: r.categoryId,
          residents,
          hints: hints.data,
        }),
      ];
    });
    onAdd(goods);
    onClose();
  };

  const move = useMutation({
    mutationFn: (categoryId: string | null) =>
      setItemsCategory({
        data: { ids: pickedCustom.map((k) => cat.byKey.get(k)!.refId), categoryId },
      }),
    onSuccess: () => {
      toast.success(`Перенесено: ${pickedCustom.length}`);
      setMoving(false);
      void qc.invalidateQueries({ queryKey: ["market-ref", "custom"] });
      void qc.invalidateQueries({ queryKey: ["item-categories"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  if (typeof document === "undefined") return null;
  // Справочник категорий — рядом с подложкой, а не внутри: клик в нём всплыл бы
  // по дереву React до подложки и закрыл бы окно выбора.
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[140] flex items-end justify-center bg-black/75 sm:items-center sm:p-4"
        onClick={onClose}
      >
        <div
          className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-border bg-background sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
            <h4 className="flex-1 font-display text-sm font-bold">Товары ратуши</h4>
            <button
              type="button"
              onClick={() => setManage(true)}
              className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground"
            >
              <Settings2 className="h-3.5 w-3.5" /> Категории
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="shrink-0 space-y-2 border-b border-border p-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск"
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
            />
            <CategoryChips cats={cat.cats} selected={chips} onChange={setChips} counts={counts} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
            {cat.loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> загрузка…
              </div>
            ) : (
              <TownPickerList
                groups={groups}
                checked={checked}
                taken={taken}
                onToggle={toggle}
                onToggleGroup={toggleGroup}
              />
            )}
          </div>
          {moving && (
            <div className="shrink-0 space-y-1.5 border-t border-border p-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Своих товаров отмечено {pickedCustom.length} — в категорию:
              </div>
              <div className="flex flex-wrap gap-1">
                {[...cat.customCats, NO_CATEGORY].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={move.isPending}
                    onClick={() => move.mutate(c.id === NO_CATEGORY.id ? null : c.id)}
                    className="rounded-full border border-border px-2.5 py-1 text-[11px] disabled:opacity-50"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <footer className="flex shrink-0 gap-2 border-t border-border p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
            {pickedCustom.length > 0 && (
              <button
                type="button"
                onClick={() => setMoving((v) => !v)}
                className="flex items-center gap-1 rounded-xl border border-border px-3 py-3 text-xs font-semibold"
              >
                <FolderInput className="h-4 w-4" /> В категорию
              </button>
            )}
            <button
              type="button"
              onClick={add}
              disabled={checked.size === 0 || hints.isFetching}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Добавить {checked.size || ""}
            </button>
          </footer>
        </div>
      </div>
      {manage && <CategoryManager onClose={() => setManage(false)} />}
    </>,
    document.body,
  );
}
