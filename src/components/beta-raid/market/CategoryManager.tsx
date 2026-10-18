// Справочник категорий своих товаров (владелец, 04.10.2026): завести,
// переименовать, удалить. Открывается из пикера товара и встаёт поверх него
// (z выше, чем у пикера). Удаление товары не трогает — они становятся
// «без категории». Окно и «Добавить» — здесь, правка строки — в CategoryRow.
import { useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import type { ItemCategory } from "@/lib/itemCategories";
import { createItemCategory, listItemCategories } from "@/server/api/beta-raid/item-categories";
import { CategoryRow } from "./CategoryRow";

const KEY = ["item-categories"];

export function CategoryManager({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: () => listItemCategories(), staleTime: 60_000 });
  const [newName, setNewName] = useState("");
  const add = useMutation({
    mutationFn: (name: string) => createItemCategory({ data: { name } }),
    onSuccess: (cat) => {
      setNewName("");
      // Новая видна сразу, не дожидаясь перезапроса справочника.
      qc.setQueryData<ItemCategory[]>(KEY, (old) => (old ? [...old, cat] : old));
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e: unknown) => toast.error(humanError(e)),
  });
  const submitAdd = () => {
    const name = newName.trim();
    if (name && !add.isPending) add.mutate(name);
  };
  const list = q.data ?? [];

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-black/75 sm:items-center sm:p-4"
      onClick={(e) => {
        // Окно открыто из портала пикера: клик по фону не должен дойти до его фона.
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="flex max-h-[85dvh] w-full max-w-sm flex-col overflow-hidden rounded-t-2xl border border-border bg-background sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h4 className="font-display text-sm font-bold">Категории</h4>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          {q.isLoading ? (
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
            <p className="py-8 text-center text-sm text-muted-foreground">Категорий нет</p>
          ) : (
            <ul className="space-y-1.5">
              {list.map((c) => (
                <CategoryRow key={c.id} cat={c} />
              ))}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 gap-2 border-t border-border p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <input
            value={newName}
            maxLength={60}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitAdd()}
            placeholder="Новая категория"
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={submitAdd}
            disabled={!newName.trim() || add.isPending}
            className="flex shrink-0 items-center gap-1 rounded-lg gradient-gold px-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
          >
            {add.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Добавить
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
