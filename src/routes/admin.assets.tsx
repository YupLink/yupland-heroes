// Админ · Редактор ассетов — единый конструктор для всех типов:
//   мобы, боссы, сундуки, шахты, артефакты, типы местности, дороги.
//   Фильтр по типу и локации. CRUD через mystic_item_template.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Save,
  Trash2,
  Pencil,
  X,
  Loader2,
  Package,
  Gem,
  Skull,
  Ghost,
  Pickaxe,
  Mountain,
  Route as RouteIcon,
  Filter,
  ImagePlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import {
  adminListItems,
  adminCreateItem,
  adminUpdateItem,
  adminDeleteItem,
  ASSET_KINDS,
  type AssetKind,
} from "@/server/api/items";
import { LANDS, RACES, SPECIALIZATIONS, ARTIFACT_SLOTS, ARTIFACT_STATS } from "@/components/heroMeta";
import { humanError } from "@/lib/humanError";

async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/upload", { method: "POST", body: fd });
  const j = (await r.json()) as { url?: string; error?: string };
  if (!r.ok || !j.url) throw new Error(j.error || "upload failed");
  return j.url;
}

export const Route = createFileRoute("/admin/assets")({
  head: () => ({ meta: [{ title: "Редактор ассетов" }, { name: "robots", content: "noindex" }] }),
  component: AdminAssets,
});

// Иконки и цвета для каждого типа.
const KIND_META: Record<AssetKind, { label: string; icon: typeof Skull; color: string; emoji: string }> = {
  artifact: { label: "Артефакт", icon: Gem, color: "#a855f7", emoji: "💎" },
  hero: { label: "Герой", icon: Ghost, color: "#3b82f6", emoji: "⭐" },
  mob: { label: "Моб", icon: Ghost, color: "#f97316", emoji: "👹" },
  boss: { label: "Босс", icon: Skull, color: "#e11d48", emoji: "💀" },
  chest: { label: "Сундук", icon: Package, color: "#f6c453", emoji: "📦" },
  mine: { label: "Шахта", icon: Pickaxe, color: "#78716c", emoji: "⛏️" },
  terrain: { label: "Местность", icon: Mountain, color: "#22c55e", emoji: "🏔️" },
  road: { label: "Дорога", icon: RouteIcon, color: "#c9a267", emoji: "🛤️" },
};

type AssetItem = {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  rarity: string | null;
  level: number | null;
  race: string | null;
  specialization: string | null;
  land: string | null;
  statType: string | null;
  statAmount: number | null;
  slot: string | null;
  active: boolean;
  meta: Record<string, unknown> | null;
};

type EditorState = {
  id?: string;
  kind: AssetKind;
  name: string;
  description: string;
  imageUrl: string | null;
  rarity: string;
  level: number;
  race: string;
  specialization: string;
  land: string;
  statType: string;
  statAmount: number;
  slot: string;
  meta: Record<string, unknown>;
};

const EMPTY_EDITOR: EditorState = {
  kind: "mob",
  name: "",
  description: "",
  imageUrl: null,
  rarity: "common",
  level: 3,
  race: "",
  specialization: "",
  land: "",
  statType: "",
  statAmount: 0,
  slot: "",
  meta: {},
};

function AdminAssets() {
  const qc = useQueryClient();
  const [filterKind, setFilterKind] = useState<AssetKind | "all">("all");
  const [filterLand, setFilterLand] = useState<string | "all">("all");
  const [editor, setEditor] = useState<EditorState | null>(null);

  const itemsQ = useQuery({
    queryKey: ["admin-assets", filterKind],
    queryFn: () => adminListItems({ data: filterKind === "all" ? {} : { kind: filterKind } }),
  });

  const allItems = (itemsQ.data ?? []) as AssetItem[];

  // Фильтр по локации.
  const filtered = useMemo(() => {
    if (filterLand === "all") return allItems;
    return allItems.filter((i) => i.land === filterLand);
  }, [allItems, filterLand]);

  // Уникальные локации для фильтра.
  const landOptions = useMemo(() => {
    const lands = new Set<string>();
    for (const i of allItems) if (i.land) lands.add(i.land);
    return [...lands].sort();
  }, [allItems]);

  const saveMut = useMutation({
    mutationFn: async (e: EditorState) => {
      const data = {
        kind: e.kind,
        name: e.name,
        description: e.description || undefined,
        imageUrl: e.imageUrl ?? undefined,
        rarity: e.kind === "artifact" ? e.rarity : undefined,
        level: e.kind === "hero" || e.kind === "mob" ? e.level : undefined,
        race: e.race || undefined,
        specialization: e.specialization || undefined,
        land: e.land || undefined,
        statType: e.kind === "artifact" ? e.statType : undefined,
        statAmount: e.kind === "artifact" ? e.statAmount : undefined,
        slot: e.kind === "artifact" ? e.slot : undefined,
        meta: Object.keys(e.meta).length > 0 ? e.meta : undefined,
      };
      if (e.id) {
        return adminUpdateItem({ data: { id: e.id, ...data } });
      }
      return adminCreateItem({ data });
    },
    onSuccess: () => {
      toast.success(editor?.id ? "Сохранено" : "Создано");
      setEditor(null);
      qc.invalidateQueries({ queryKey: ["admin-assets"] });
    },
    onError: (err: Error) => toast.error(humanError(err)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminDeleteItem({ data: { id } }),
    onSuccess: () => {
      toast.success("Удалено");
      qc.invalidateQueries({ queryKey: ["admin-assets"] });
    },
    onError: (err: Error) => toast.error(humanError(err)),
  });

  const openCreate = (kind: AssetKind) => {
    setEditor({ ...EMPTY_EDITOR, kind });
  };

  const openEdit = (item: AssetItem) => {
    setEditor({
      id: item.id,
      kind: item.kind as AssetKind,
      name: item.name,
      description: item.description ?? "",
      imageUrl: item.imageUrl,
      rarity: item.rarity ?? "common",
      level: item.level ?? 3,
      race: item.race ?? "",
      specialization: item.specialization ?? "",
      land: item.land ?? "",
      statType: item.statType ?? "",
      statAmount: item.statAmount ?? 0,
      slot: item.slot ?? "",
      meta: (item.meta as Record<string, unknown>) ?? {},
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-3 px-4 py-6 pb-24">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl gradient-gold text-gold-foreground">
          <Gem className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold">Редактор ассетов</h1>
          <p className="text-xs text-muted-foreground">Создавай и настраивай мобов, боссов, сундуки, шахты, артефакты, местность и дороги.</p>
        </div>
      </header>

      {/* Фильтры */}
      <div className="flex flex-wrap gap-2">
        <select
          value={filterKind}
          onChange={(e) => setFilterKind(e.target.value as AssetKind | "all")}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="all">Все типы</option>
          {ASSET_KINDS.map((k) => (
            <option key={k} value={k}>{KIND_META[k].emoji} {KIND_META[k].label}</option>
          ))}
        </select>
        {landOptions.length > 0 && (
          <select
            value={filterLand}
            onChange={(e) => setFilterLand(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
          >
            <option value="all">Все локации</option>
            {landOptions.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        {/* Кнопки создания */}
        <div className="ml-auto flex flex-wrap gap-1">
          {ASSET_KINDS.map((k) => {
            const meta = KIND_META[k];
            const Icon = meta.icon;
            return (
              <button
                key={k}
                onClick={() => openCreate(k)}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 text-[11px] font-medium transition hover:border-gold/40"
                title={`Создать ${meta.label.toLowerCase()}`}
              >
                <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
                <span className="hidden sm:inline">{meta.label}</span>
                <Plus className="h-3 w-3" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Список */}
      {itemsQ.isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      )}
      {!itemsQ.isLoading && filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Пусто. Создай ассет кнопкой выше.
        </div>
      )}
      <div className="space-y-1.5">
        {filtered.map((item) => {
          const meta = KIND_META[item.kind as AssetKind] ?? KIND_META.mob;
          const Icon = meta.icon;
          return (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border bg-card p-3 transition",
                item.active ? "border-border" : "border-border/50 opacity-60"
              )}
            >
              {item.imageUrl ? (
                <img src={thumb(item.imageUrl, 80)} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: meta.color + "22" }}>
                  <Icon className="h-5 w-5" style={{ color: meta.color }} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-medium">{item.name}</span>
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ background: meta.color + "22", color: meta.color }}>
                    {meta.label}
                  </span>
                  {item.land && (
                    <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[9px] text-muted-foreground">{item.land}</span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {item.rarity && <span>{item.rarity} · </span>}
                  {item.level && <span>ур.{item.level} · </span>}
                  {item.race && <span>{item.race}</span>}
                </div>
              </div>
              <button
                onClick={() => openEdit(item)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:text-foreground"
                title="Редактировать"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => { if (confirm(`Удалить «${item.name}»?`)) deleteMut.mutate(item.id); }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-400 transition hover:text-red-300"
                title="Удалить"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Редактор */}
      {editor && (
        <AssetEditor
          value={editor}
          onChange={setEditor}
          onSave={() => saveMut.mutate(editor)}
          saving={saveMut.isPending}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}

// ── Редактор ассета (bottom-sheet) ──
function AssetEditor({
  value,
  onChange,
  onSave,
  saving,
  onClose,
}: {
  value: EditorState;
  onChange: (v: EditorState) => void;
  onSave: () => void;
  saving: boolean;
  onClose: () => void;
}) {
  const meta = KIND_META[value.kind];
  const Icon = meta.icon;

  const handleImage = async () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      try {
        const url = await uploadImage(f);
        onChange({ ...value, imageUrl: url });
        toast.success("Загружено");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Ошибка загрузки");
      }
    };
    inp.click();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-card sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Icon className="h-5 w-5" style={{ color: meta.color }} />
          <span className="flex-1 font-display text-lg font-bold">
            {value.id ? `Правка: ${value.name}` : `Новый ${meta.label.toLowerCase()}`}
          </span>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {/* Тип (только при создании) */}
          {!value.id && (
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Тип</label>
              <div className="flex flex-wrap gap-1">
                {ASSET_KINDS.map((k) => {
                  const m = KIND_META[k];
                  const Ic = m.icon;
                  return (
                    <button
                      key={k}
                      onClick={() => onChange({ ...value, kind: k })}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition",
                        value.kind === k ? "ring-2 ring-gold" : "border border-border text-muted-foreground"
                      )}
                      style={value.kind === k ? { background: m.color + "22", color: m.color } : undefined}
                    >
                      <Ic className="h-3.5 w-3.5" /> {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Картинка */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Картинка</label>
            <button onClick={handleImage} className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs hover:bg-secondary/50">
              {value.imageUrl ? (
                <img src={thumb(value.imageUrl, 80)} alt="" className="h-9 w-9 rounded object-cover" />
              ) : (
                <ImagePlus className="h-5 w-5 text-muted-foreground" />
              )}
              <span className="text-muted-foreground">{value.imageUrl ? "Сменить" : "Загрузить"}</span>
            </button>
          </div>

          {/* Имя */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Название</label>
            <input
              value={value.name}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
              placeholder="Имя ассета"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base"
            />
          </div>

          {/* Описание */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Описание</label>
            <textarea
              value={value.description}
              onChange={(e) => onChange({ ...value, description: e.target.value })}
              placeholder="Описание (опционально)"
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
            />
          </div>

          {/* Локация (для всех кроме terrain/road) */}
          {value.kind !== "terrain" && value.kind !== "road" && (
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Локация</label>
              <select
                value={value.land}
                onChange={(e) => onChange({ ...value, land: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
              >
                <option value="">Не указана</option>
                {LANDS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          )}

          {/* Раса (для мобов/боссов/героев) */}
          {(value.kind === "mob" || value.kind === "boss" || value.kind === "hero") && (
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Раса</label>
              <select
                value={value.race}
                onChange={(e) => onChange({ ...value, race: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
              >
                <option value="">Не указана</option>
                {RACES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}

          {/* Специализация (для мобов/героев) */}
          {(value.kind === "mob" || value.kind === "hero") && (
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Специализация</label>
              <select
                value={value.specialization}
                onChange={(e) => onChange({ ...value, specialization: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
              >
                <option value="">Не указана</option>
                {SPECIALIZATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          {/* Уровень (для мобов/героев) */}
          {(value.kind === "mob" || value.kind === "hero") && (
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Уровень (звёзды)</label>
              <input
                type="number"
                min={1}
                max={9}
                value={value.level}
                onChange={(e) => onChange({ ...value, level: Number(e.target.value) || 1 })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
              />
            </div>
          )}

          {/* Редкость (для артефактов) */}
          {value.kind === "artifact" && (
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Редкость</label>
              <div className="flex gap-1">
                {(["common", "rare", "epic", "legendary"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => onChange({ ...value, rarity: r })}
                    className={cn(
                      "flex-1 rounded-lg border-2 py-2 text-xs font-bold transition",
                      value.rarity === r ? "border-gold bg-gold/10 text-gold" : "border-border/50 text-muted-foreground"
                    )}
                  >
                    {r === "common" ? "Обычный" : r === "rare" ? "Редкий" : r === "epic" ? "Эпический" : "Легендарный"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Слот (для артефактов) */}
          {value.kind === "artifact" && (
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Слот</label>
              <select
                value={value.slot}
                onChange={(e) => onChange({ ...value, slot: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
              >
                <option value="">Не указан</option>
                {ARTIFACT_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          {/* Характеристика (для артефактов) */}
          {value.kind === "artifact" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Характеристика</label>
                <select
                  value={value.statType}
                  onChange={(e) => onChange({ ...value, statType: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                >
                  <option value="">Нет</option>
                  {ARTIFACT_STATS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Значение</label>
                <input
                  type="number"
                  value={value.statAmount}
                  onChange={(e) => onChange({ ...value, statAmount: Number(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                />
              </div>
            </div>
          )}

          {/* Meta (доп. свойства — HP, атака и т.д.) */}
          {(value.kind === "boss" || value.kind === "mob" || value.kind === "mine" || value.kind === "chest") && (
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Доп. свойства (JSON)</label>
              <textarea
                value={JSON.stringify(value.meta, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    onChange({ ...value, meta: parsed });
                  } catch { /* не валидный JSON — игнорируем */ }
                }}
                placeholder='{"hp": 1000, "attack": 50}'
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-xs"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                HP, атака, урон, награды — любые свойства в формате JSON.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4">
          <button
            onClick={onSave}
            disabled={
              !value.name ||
              saving ||
              (value.kind === "hero" && (!value.race || !value.specialization))
            }
            className="flex w-full items-center justify-center gap-2 rounded-xl gradient-gold px-4 py-3 font-bold text-gold-foreground disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? "Сохраняю…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
