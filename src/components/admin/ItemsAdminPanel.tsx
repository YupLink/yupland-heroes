// Конструктор артефактов/героев (админка /admin/chips → Артефакты / Герои).
// Панель — только каркас: шапка, редактор, блок раздачи и сетка карточек.
// Разбита на модули (§13 ПРАВИЛА.md): ItemEditor, ItemsGrantBatch,
// ItemDefCard, ItemPickerSelect, ItemArtifactFields, itemsAdminShared.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Loader2, Gem, Crown } from "lucide-react";
import { adminListItems } from "@/server/api/items";
import { ItemEditor } from "./ItemEditor";
import { ItemsGrantBatch } from "./ItemsGrantBatch";
import { ItemDefCard } from "./ItemDefCard";
import type { ItemRow } from "./itemsAdminShared";

export function ItemsAdminPanel({ kind }: { kind: "artifact" | "hero" }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ItemRow | null>(null);
  const Icon = kind === "artifact" ? Gem : Crown;
  const title = kind === "artifact" ? "Артефакты" : "Герои";
  const list = useQuery({
    queryKey: ["admin-items", kind],
    queryFn: () => adminListItems({ data: { kind } }),
  });
  const items = list.data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-items", kind] });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-fuchsia-500/15 text-fuchsia-300">
            <Icon className="h-5 w-5" />
          </span>
          <h2 className="text-lg font-bold">{title}</h2>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setCreating((v) => !v);
          }}
          className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-sm font-bold text-gold transition active:scale-95"
        >
          <Plus className="h-4 w-4" /> Создать
        </button>
      </div>

      {(creating || editing) && (
        <ItemEditor
          kind={kind}
          initial={editing}
          onDone={() => {
            setCreating(false);
            setEditing(null);
            refresh();
          }}
        />
      )}

      {items.length > 0 && <ItemsGrantBatch kind={kind} items={items} />}

      {list.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex justify-center py-10 text-fuchsia-300/25">
          <Icon className="h-10 w-10" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {items.map((it) => (
            <ItemDefCard
              key={it.id}
              it={it}
              onEdit={() => {
                setCreating(false);
                setEditing(it);
              }}
              onChanged={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}
