// Строка справочника категорий (CategoryManager): имя и число товаров,
// карандаш — правка имени на месте, урна — удаление с подтверждением.
// Вынесено из CategoryManager ради лимита ≤250 строк: там окно и «Добавить»,
// здесь всё, что делают с одной категорией.
import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import type { ItemCategory } from "@/lib/itemCategories";
import { deleteItemCategory, renameItemCategory } from "@/server/api/beta-raid/item-categories";

const KEY = ["item-categories"];

/** Круглая кнопка под палец: 36px, а не 24px, как на плитках. */
function IconBtn({
  label,
  onClick,
  disabled,
  tone = "plain",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "plain" | "gold" | "danger";
  children: ReactNode;
}) {
  const look =
    tone === "danger"
      ? "bg-destructive text-white"
      : tone === "gold"
        ? "bg-gold text-gold-foreground"
        : "border border-border text-muted-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full disabled:opacity-50 ${look}`}
    >
      {children}
    </button>
  );
}

const spin = <Loader2 className="h-4 w-4 animate-spin" />;
const ok = <Check className="h-4 w-4" />;

export function CategoryRow({ cat }: { cat: ItemCategory }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [name, setName] = useState(cat.name);

  // Кэш правим сразу — список меняется без ожидания ответа на перезапрос;
  // перезапрос всё равно нужен, чтобы сошлись счётчики товаров.
  const patch = (fn: (list: ItemCategory[]) => ItemCategory[]) => {
    qc.setQueryData<ItemCategory[]>(KEY, (old) => (old ? fn(old) : old));
    void qc.invalidateQueries({ queryKey: KEY });
  };
  const onError = (e: unknown) => toast.error(humanError(e));
  const rename = useMutation({
    mutationFn: (next: string) => renameItemCategory({ data: { id: cat.id, name: next } }),
    onSuccess: (_r, next) => {
      setMode("view");
      patch((l) => l.map((c) => (c.id === cat.id ? { ...c, name: next } : c)));
    },
    onError,
  });
  const del = useMutation({
    mutationFn: () => deleteItemCategory({ data: { id: cat.id } }),
    onSuccess: () => {
      patch((l) => l.filter((c) => c.id !== cat.id));
      // Товары удалённой категории стали «без категории» — сетка пикера и
      // общий справочник своих товаров тоже (как после правки товара).
      void qc.invalidateQueries({ queryKey: ["market-ref", "custom"] });
      void qc.invalidateQueries({ queryKey: ["custom-items"], refetchType: "all" });
    },
    onError,
  });
  const save = () => {
    const next = name.trim();
    if (next && !rename.isPending) rename.mutate(next);
  };

  return (
    <li className="flex min-h-12 items-center gap-1.5 rounded-lg border border-border px-2 py-1.5">
      {mode === "edit" ? (
        <>
          <input
            autoFocus
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
          />
          <IconBtn
            label="Сохранить"
            tone="gold"
            onClick={save}
            disabled={!name.trim() || rename.isPending}
          >
            {rename.isPending ? spin : ok}
          </IconBtn>
          <IconBtn label="Отмена" onClick={() => setMode("view")}>
            <X className="h-4 w-4" />
          </IconBtn>
        </>
      ) : mode === "confirm" ? (
        <>
          <span className="min-w-0 flex-1 truncate text-sm">Удалить «{cat.name}»?</span>
          <IconBtn
            label="Удалить"
            tone="danger"
            onClick={() => del.mutate()}
            disabled={del.isPending}
          >
            {del.isPending ? spin : ok}
          </IconBtn>
          <IconBtn label="Отмена" onClick={() => setMode("view")}>
            <X className="h-4 w-4" />
          </IconBtn>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-sm">{cat.name}</span>
          <span className="shrink-0 px-1 text-xs tabular-nums text-muted-foreground">
            {cat.count ?? 0}
          </span>
          <IconBtn
            label="Переименовать"
            onClick={() => {
              setName(cat.name);
              setMode("edit");
            }}
          >
            <Pencil className="h-4 w-4" />
          </IconBtn>
          <IconBtn label="Удалить" onClick={() => setMode("confirm")}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </IconBtn>
        </>
      )}
    </li>
  );
}
