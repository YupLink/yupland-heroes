import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminListChipCollections, adminDeleteChipCollection } from "@/server/api/chips-admin";
import { CollectionHeroConfig } from "@/components/admin/CollectionHeroConfig";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Layers,
  Pencil,
  ChevronDown,
  ChevronUp,
  Hash,
  Sparkles,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CollectionForm, TemplateForm, TemplateCard } from "./ChipsCollectionEditor";
import { humanError } from "@/lib/humanError";

type CollectionData = Awaited<ReturnType<typeof adminListChipCollections>>[number];

export function ChipsCollectionsPanel() {
  const qc = useQueryClient();
  const collections = useQuery({
    queryKey: ["admin", "chip-collections"],
    queryFn: () => adminListChipCollections(),
  });
  const [creating, setCreating] = useState(false);
  const list = collections.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold">
            <Layers className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-xl font-bold leading-tight">Коллекции фишек</h2>
            <p
              className="text-xs text-muted-foreground"
              title="У каждой коллекции свой тираж и набор фишек."
            >
              Свой тираж и набор фишек.
            </p>
          </div>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-xl gradient-gold px-4 py-2 text-xs font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01]"
        >
          <Plus className="h-3.5 w-3.5" /> Новая коллекция
        </button>
      </header>

      {creating && (
        <CollectionForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ["admin", "chip-collections"] });
          }}
        />
      )}

      {collections.isLoading ? (
        <div className="rounded-2xl border border-border/50 bg-card p-6 text-center text-sm text-muted-foreground">
          Загрузка…
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
          Коллекций ещё нет. Создай первую.
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((c) => (
            <CollectionCard key={c.id} collection={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function CollectionCard({ collection }: { collection: CollectionData }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addingTpl, setAddingTpl] = useState(false);
  const [showStats, setShowStats] = useState(false);

  const del = useMutation({
    mutationFn: () => adminDeleteChipCollection({ data: { id: collection.id } }),
    onSuccess: () => {
      toast.success("Удалено");
      qc.invalidateQueries({ queryKey: ["admin", "chip-collections"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  if (editing)
    return (
      <CollectionForm
        initial={collection}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          qc.invalidateQueries({ queryKey: ["admin", "chip-collections"] });
        }}
      />
    );

  const statusMeta = {
    active: { label: "Продаётся", cls: "bg-success/10 text-success" },
    sealed: { label: "Закрыта", cls: "bg-amber-400/10 text-amber-300" },
    archived: { label: "Архив", cls: "bg-secondary text-muted-foreground" },
  }[collection.status];

  return (
    <div className="rounded-2xl border border-border/50 bg-card transition hover:border-border/80">
      <div className="flex items-start gap-3 p-3">
        <div className="aspect-square h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-border bg-background">
          {collection.coverImageUrl ? (
            <img src={collection.coverImageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Layers className="h-5 w-5" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="truncate font-display text-sm font-semibold">{collection.name}</div>
            <span
              className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", statusMeta.cls)}
            >
              {statusMeta.label}
            </span>
            {(collection as { exhausted?: boolean }).exhausted && (
              <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                запас исчерпан
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-muted-foreground"
              title="Занято номеров тиража"
            >
              <Sparkles className="h-3 w-3" />{" "}
              <b className="text-foreground">
                {(collection.initialSupply - collection.availableToDrop).toLocaleString()}
              </b>
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-muted-foreground"
              title="Доступно к выпадению"
            >
              <Package className="h-3 w-3" />{" "}
              <b className="text-foreground">{collection.availableToDrop.toLocaleString()}</b>
            </span>
            <button
              type="button"
              onClick={() => setShowStats((v) => !v)}
              className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-muted-foreground transition hover:text-foreground"
            >
              {showStats ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}{" "}
              Подробнее
            </button>
          </div>
          {showStats && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span>фишек: {collection.templates.length}</span>
              <span>тираж: {collection.initialSupply.toLocaleString()}</span>
              <span title="Занято номеров тиража">
                занято: {(collection.initialSupply - collection.availableToDrop).toLocaleString()}
              </span>
              <span title="Фишки на руках у игроков (включая выставленные на маркет)">
                в игре: {collection.inGameCount.toLocaleString()}
              </span>
              <span title="Сгорели в крафте и при выводе в NFT">
                сгорело: {collection.burnedCount.toLocaleString()}
              </span>
              <span title="NFT сейчас на чейне, в игру не возвращены">
                на чейне: {collection.mintedCount.toLocaleString()}
              </span>
              {collection.aboveTirage > 0 && (
                <span
                  className="text-destructive"
                  title="Номера, выданные сверх тиража старым багом"
                >
                  сверх тиража: {collection.aboveTirage.toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Скрыть фишки" : "Показать фишки"}
            aria-label={expanded ? "Скрыть фишки" : "Показать фишки"}
            aria-expanded={expanded}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
          </button>
          <button
            onClick={() => setEditing(true)}
            title="Редактировать коллекцию"
            aria-label="Редактировать коллекцию"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              if (confirm(`Удалить «${collection.name}»?`)) del.mutate();
            }}
            disabled={del.isPending}
            title="Удалить коллекцию"
            aria-label="Удалить коллекцию"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:border-rose-500/40 hover:text-rose-400 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Hash className="h-3.5 w-3.5" /> Шаблоны фишек
            </span>
            <button
              onClick={() => setAddingTpl(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-gold/30 bg-gold/5 px-2.5 py-1 text-[11px] font-medium text-gold transition hover:bg-gold/10"
            >
              <Plus className="h-3 w-3" /> Фишка
            </button>
          </div>
          {addingTpl && (
            <TemplateForm
              collectionId={collection.id}
              nextNo={Math.max(0, ...collection.templates.map((t) => t.templateNo)) + 1}
              onClose={() => setAddingTpl(false)}
              onSaved={() => {
                setAddingTpl(false);
                qc.invalidateQueries({ queryKey: ["admin", "chip-collections"] });
              }}
            />
          )}
          {collection.templates.length === 0 && !addingTpl && (
            <p className="text-center text-xs text-muted-foreground py-4">Фишек пока нет.</p>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {collection.templates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onChanged={() => qc.invalidateQueries({ queryKey: ["admin", "chip-collections"] })}
              />
            ))}
          </div>
          <CollectionHeroConfig collectionId={collection.id} />
        </div>
      )}
    </div>
  );
}
