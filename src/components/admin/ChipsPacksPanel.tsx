// YUPLINK · Админ-панель чип-паков.
// CRUD паков фишек (отдельно от существующих nft_packs!). Каждый пак —
// тип + цена в DARAI/билетах + drop-table (массив {collection, template,
// level, weight}).

import { useEffect, useMemo, useRef, useState } from "react";
import { PackFallbackSelect } from "./PackFallbackSelect";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminCreateChipPack,
  adminListChipPacks,
  adminListChipCollections,
  adminUpdateChipPack,
  adminDeleteChipPack,
} from "@/server/api/chips-admin";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Loader2,
  Package,
  Upload,
  X,
  Pencil,
  Check,
  Power,
  Coins,
  AlertTriangle,
  Star,
  Layers,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EnergyPacksAdminPanel } from "./EnergyPacksAdminPanel";
import { EnergyLikeOfferAdmin } from "./EnergyLikeOfferAdmin";
import { humanError } from "@/lib/humanError";
import { TICKET_SPEND_GOLD, goldForTicketPrice } from "@/lib/ticketGold";

type PackData = Awaited<ReturnType<typeof adminListChipPacks>>[number];
type CollectionData = Awaited<ReturnType<typeof adminListChipCollections>>[number];

type DropTableItem = {
  collectionId: string | null;
  templateId: string | null;
  level: number;
  weight: number;
};

interface DropTableConfig {
  slots: number;
  dropTable: DropTableItem[];
  guarantees?: Array<{ minLevel: number; slotsAtLeast: number }>;
}

// Минимальные цены паков (по продуктовым правилам — не давать админу
// случайно создать «копеечный» пак).
const MIN_PRICE_DARAI = 50_000;
const MIN_PRICE_TICKETS = TICKET_SPEND_GOLD; // в ЗОЛОТЕ: поле — золото, в базу price_tickets = золото/500 (§8.61)

const LEVELS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

// Двухслойная модель: коллекция (с весом) + редкость (%).
type CollEntry = { id: string; weight: number };
// UI-черновик: вес хранится сырой строкой, чтобы поле можно было очистить
// при вводе. В число превращаем только на границе (submit/compose/equalize).
type CollEntryDraft = { id: string; weight: string };

// Клампы весов (совпадают с прежним поведением/серверными границами).
// Веса коллекции/редкости допускают дроби (equalize даёт 33.33) — без floor.
const clampColWeight = (raw: string) => Math.max(0, Number(raw) || 0);
const clampRarity = (raw: string) => Math.max(0, Number(raw) || 0);
const clampGuaranteeSlots = (raw: string, max: number) =>
  Math.max(1, Math.min(max, Math.floor(Number(raw)) || 1));

/**
 * Разбирает плоский drop_table[] в коллекции (с весами) + распределение
 * по редкости. Если оригинал был «декартов», получится 1-в-1.
 */
function decomposeDropTable(dt: DropTableConfig | null): {
  selectedCols: CollEntry[];
  rarityWeights: Record<string, number>;
  guarantee: { minLevel: number; slotsAtLeast: number } | null;
} {
  if (!dt || !dt.dropTable || dt.dropTable.length === 0) {
    return {
      selectedCols: [],
      rarityWeights: {},
      guarantee: dt?.guarantees?.[0] ?? null,
    };
  }
  const totalW = dt.dropTable.reduce((s, r) => s + (r.weight || 0), 0) || 1;
  const colSums: Record<string, number> = {};
  const rarSums: Record<string, number> = {};
  for (const r of dt.dropTable) {
    if (!r.collectionId) continue; // пропускаем «битые» без коллекции
    colSums[r.collectionId] = (colSums[r.collectionId] ?? 0) + (r.weight || 0);
    const lvl = String(r.level);
    rarSums[lvl] = (rarSums[lvl] ?? 0) + (r.weight || 0);
  }
  const selectedCols: CollEntry[] = Object.entries(colSums).map(([id, w]) => ({
    id,
    weight: Math.round((w / totalW) * 1000) / 10, // в %, 1 знак
  }));
  const rarityWeights: Record<string, number> = {};
  for (const [lvl, w] of Object.entries(rarSums)) {
    rarityWeights[lvl] = Math.round((w / totalW) * 1000) / 10;
  }
  return {
    selectedCols,
    rarityWeights,
    guarantee: dt.guarantees?.[0] ?? null,
  };
}

/**
 * Собирает обратно плоский drop_table[] из коллекций × редкости.
 * Вес итоговой строки = colNorm × rarNorm × 100.
 */
function composeDropTable(opts: {
  slots: number;
  selectedCols: CollEntry[];
  rarityWeights: Record<string, number>;
  guarantee: { minLevel: number; slotsAtLeast: number } | null;
}): DropTableConfig {
  const cols = opts.selectedCols.filter((c) => c.id && c.weight > 0);
  const colTotal = cols.reduce((s, c) => s + c.weight, 0) || 1;
  const rars = Object.entries(opts.rarityWeights).filter(([, w]) => w > 0);
  const rarTotal = rars.reduce((s, [, w]) => s + w, 0) || 1;
  const items: DropTableItem[] = [];
  for (const col of cols) {
    for (const [lvlStr, rarW] of rars) {
      const w = ((col.weight / colTotal) * (rarW / rarTotal)) * 100;
      const weight = Math.round(w * 100) / 100; // 2 знака
      // Скип по ОКРУГЛЁННОМУ значению: w в [0.001,0.005) округлялось в 0.00 и
      // падало на серверной схеме weight >= 0.01 (ZodError при создании пака).
      if (weight < 0.01) continue;
      items.push({
        collectionId: col.id,
        templateId: null,
        level: Number(lvlStr),
        weight,
      });
    }
  }
  return {
    slots: opts.slots,
    dropTable: items,
    guarantees: opts.guarantee ? [opts.guarantee] : undefined,
  };
}
const LEVEL_LABEL: Record<number, string> = {
  1: "1★",
  1.5: "1½★",
  2: "2★",
  2.5: "2½★",
  3: "3★",
  3.5: "3½★",
  4: "4★",
  4.5: "4½★",
  5: "5★",
};

const KIND_META: Record<
  PackData["kind"],
  { label: string; cls: string; hint: string }
> = {
  standard: {
    label: "Стандартный",
    cls: "border-border bg-secondary/40 text-muted-foreground",
    hint: "3 фишки 1★-1.5★, любые коллекции",
  },
  themed: {
    label: "Тематический",
    cls: "border-neon/30 bg-neon/10 text-neon",
    hint: "3 фишки одной коллекции, шанс 2★",
  },
  premium: {
    label: "Премиум",
    cls: "border-gold/40 bg-gold/15 text-gold",
    hint: "3 фишки, гарантия одной 2★+",
  },
  specialized: {
    label: "Спец",
    cls: "border-purple-400/30 bg-purple-400/10 text-purple-300",
    hint: "Конкретные фишки",
  },
  seasonal: {
    label: "Сезонный",
    cls: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    hint: "Временные ивентовые паки",
  },
  // Мистические паки управляются в отдельном экране (Фишки → Мистик); здесь
  // не отображаются (отфильтрованы в adminListChipPacks), ключ для полноты типа.
  mystic: {
    label: "Мистический",
    cls: "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300",
    hint: "Мистери-бокс (управление в разделе «Мистик»)",
  },
};

export { ChipsPacksPanel };

// Вкладка «Паки» = переключатель Паки фишек / Энергия (энерго-паки живут
// внутри паков, а не отдельной вкладкой).
function ChipsPacksPanel() {
  const [sub, setSub] = useState<"chips" | "energy">("chips");
  return (
    <div className="space-y-5">
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="inline-flex shrink-0 gap-1 rounded-full border border-border bg-secondary/40 p-1">
          {(
            [
              { id: "chips", label: "Паки фишек", icon: Package },
              { id: "energy", label: "Энергия", icon: Zap },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = sub === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSub(t.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition sm:px-4",
                  active
                    ? "gradient-gold text-gold-foreground shadow-gold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      {sub === "chips" ? (
        <ChipPacksInner />
      ) : (
        <div className="space-y-4">
          <EnergyLikeOfferAdmin />
          <EnergyPacksAdminPanel />
        </div>
      )}
    </div>
  );
}

function ChipPacksInner() {
  const qc = useQueryClient();
  const packs = useQuery({
    queryKey: ["admin", "chip-packs"],
    queryFn: () => adminListChipPacks(),
  });
  const collections = useQuery({
    queryKey: ["admin", "chip-collections"],
    queryFn: () => adminListChipCollections(),
  });

  const [creating, setCreating] = useState(false);
  const list = packs.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold">
            <Package className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-xl font-bold leading-tight">
              Пак фишек{" "}
              <span className="text-muted-foreground">(магазин)</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Платный пак для магазина, не лут-бокс.
            </p>
          </div>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-xl gradient-gold px-4 py-2 text-xs font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01]"
        >
          <Plus className="h-3.5 w-3.5" /> Новый пак
        </button>
      </header>

      {!collections.data || collections.data.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          Сначала создай хотя бы одну коллекцию во вкладке «Коллекции».
        </div>
      ) : null}

      {creating && (
        <PackForm
          collections={collections.data ?? []}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ["admin", "chip-packs"] });
          }}
        />
      )}

      {packs.isLoading ? (
        <div className="rounded-2xl border border-border/50 bg-card p-6 text-center text-sm text-muted-foreground">
          Загрузка…
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
          Паков пока нет.
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((p) => (
            <PackCard
              key={p.id}
              pack={p}
              collections={collections.data ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PackForm({
  initial,
  collections,
  onClose,
  onSaved,
}: {
  initial?: PackData;
  collections: CollectionData[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(
    initial?.coverImageUrl ?? ""
  );
  const [kind, setKind] = useState<PackData["kind"]>(
    initial?.kind ?? "standard"
  );
  const [priceDarai, setPriceDarai] = useState(
    initial?.priceDarai != null ? String(initial.priceDarai) : ""
  );
  const [priceTickets, setPriceTickets] = useState(
    initial?.priceTickets != null ? String(goldForTicketPrice(initial.priceTickets)) : ""
  );
  const [priceStars, setPriceStars] = useState(
    initial?.priceStars != null ? String(initial.priceStars) : ""
  );
  // Только для раздач/наград — в маркет не попадает, цена не обязательна.
  const [marketHidden, setMarketHidden] = useState(
    initial?.marketHidden ?? false
  );
  const [dailyLimit, setDailyLimit] = useState(
    String(initial?.dailyLimit ?? 5)
  );
  const [totalSupply, setTotalSupply] = useState(
    initial?.totalSupply != null ? String(initial.totalSupply) : ""
  );
  const [fallbackPackId, setFallbackPackId] = useState(initial?.fallbackPackId ?? "");

  // drop-table — двухслойная модель: коллекции (с весами) × редкость (%).
  // На бэке хранится плоский dropTable[] (декартово произведение), при
  // загрузке существующего пака разбираем обратно в две таблицы.
  const initialDropTable = (initial?.dropTable as DropTableConfig | null) ?? null;
  // Слотов в паке — всегда 3 (по продуктовому правилу).
  const slots = "3";
  const decomposed = useMemo(() => decomposeDropTable(initialDropTable), [initialDropTable]);
  const [selectedCols, setSelectedCols] = useState<CollEntryDraft[]>(
    decomposed.selectedCols.length > 0
      ? decomposed.selectedCols.map((c) => ({ id: c.id, weight: String(c.weight) }))
      : []
  );
  const [rarityWeights, setRarityWeights] = useState<Record<string, string>>(
    Object.keys(decomposed.rarityWeights).length > 0
      ? Object.fromEntries(
          Object.entries(decomposed.rarityWeights).map(([k, v]) => [k, String(v)])
        )
      : { "1": "99", "2": "1" }
  );
  const [guarantee, setGuarantee] = useState<{ minLevel: number; slotsAtLeast: number } | null>(
    decomposed.guarantee
  );
  // Сырой ввод для «минимум N слотов» — чтобы поле можно было очистить.
  const [guaranteeSlotsRaw, setGuaranteeSlotsRaw] = useState<string>(
    decomposed.guarantee ? String(decomposed.guarantee.slotsAtLeast) : "1"
  );

  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as { url: string };
      return j.url;
    },
    onSuccess: (url) => {
      setCoverImageUrl(url);
      toast.success("Обложка загружена");
    },
    onError: (e: Error) => toast.error(`Upload: ${e.message}`),
  });

  // Сумма % по редкости — для индикатора.
  const raritySum = useMemo(
    () => Object.values(rarityWeights).reduce((s, v) => s + (Number(v) || 0), 0),
    [rarityWeights]
  );
  const save = useMutation({
    mutationFn: () => {
      const dropTable: DropTableConfig = composeDropTable({
        slots: Math.max(1, Math.min(10, Number(slots) || 3)),
        selectedCols: selectedCols.map((c) => ({
          id: c.id,
          weight: clampColWeight(c.weight),
        })),
        rarityWeights: Object.fromEntries(
          Object.entries(rarityWeights).map(([k, v]) => [k, clampRarity(v)])
        ),
        guarantee,
      });
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        coverImageUrl: coverImageUrl.trim() || undefined,
        kind,
        priceDarai:
          priceDarai.trim().length > 0
            ? Math.max(MIN_PRICE_DARAI, Number(priceDarai))
            : null,
        priceTickets:
          priceTickets.trim().length > 0
            ? Math.max(1, Math.round(Number(priceTickets) / TICKET_SPEND_GOLD))
            : null,
        priceStars:
          priceStars.trim().length > 0 ? Math.max(1, Math.floor(Number(priceStars))) : null,
        dailyLimit: Math.max(0, Math.min(100, Number(dailyLimit) || 5)),
        totalSupply:
          totalSupply.trim().length > 0 ? Number(totalSupply) : null,
        dropTable,
        fallbackPackId: fallbackPackId || null,
        marketHidden,
      };
      if (initial) {
        return adminUpdateChipPack({
          data: { id: initial.id, ...payload },
        });
      }
      return adminCreateChipPack({ data: payload });
    },
    onSuccess: () => {
      toast.success(initial ? "Обновлено" : "Пак создан");
      onSaved();
    },
    onError: (e: Error) => {
      let msg = e.message;
      try {
        const parsed = JSON.parse(msg) as Array<{ message?: string }>;
        if (Array.isArray(parsed)) {
          msg = parsed.map((p) => p.message).filter(Boolean).join("; ");
        }
      } catch {
        /* not JSON */
      }
      toast.error(msg || "Ошибка");
    },
  });

  // Хотя бы одно поле цены заполнено, и заполненные ≥ минимума.
  const priceDaraiOk =
    priceDarai.trim().length === 0 || Number(priceDarai) >= MIN_PRICE_DARAI;
  const priceTicketsOk =
    priceTickets.trim().length === 0 ||
    Number(priceTickets) >= MIN_PRICE_TICKETS;
  const anyPriceSet =
    priceDarai.trim().length > 0 || priceTickets.trim().length > 0;
  const canSave =
    name.trim().length > 0 &&
    (anyPriceSet || marketHidden) &&
    priceDaraiOk &&
    priceTicketsOk &&
    selectedCols.some((c) => c.id && clampColWeight(c.weight) > 0) &&
    raritySum > 0;

  // По умолчанию все коллекции выпадают одинаково — веса равны и не
  // показываются. Галка «кастом» включает индивидуальные веса.
  // Детектим на старте: если все ненулевые веса совпадают — это «ровный»
  // режим (custom=false). Иначе — custom=true.
  const initialCustom = useMemo(() => {
    const ws = selectedCols
      .map((c) => clampColWeight(c.weight))
      .filter((w) => w > 0);
    if (ws.length <= 1) return false;
    return new Set(ws.map((w) => Math.round(w * 10))).size > 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [colCustom, setColCustom] = useState(initialCustom);

  function equalize(arr: CollEntryDraft[]): CollEntryDraft[] {
    if (arr.length === 0) return arr;
    const eq = Math.round((100 / arr.length) * 100) / 100;
    return arr.map((c) => ({ ...c, weight: String(eq) }));
  }

  const addCol = () => {
    const used = new Set(selectedCols.map((c) => c.id));
    const next = collections.find((c) => !used.has(c.id));
    setSelectedCols((arr) => {
      const added = [...arr, { id: next?.id ?? "", weight: "0" }];
      return colCustom ? added : equalize(added);
    });
  };
  const updateCol = (idx: number, patch: Partial<CollEntryDraft>) =>
    setSelectedCols((arr) =>
      arr.map((c, i) => (i === idx ? { ...c, ...patch } : c))
    );
  const removeCol = (idx: number) =>
    setSelectedCols((arr) => {
      const filtered = arr.filter((_, i) => i !== idx);
      return colCustom ? filtered : equalize(filtered);
    });
  // При выключении custom-режима — выравниваем веса.
  const toggleCustom = (on: boolean) => {
    setColCustom(on);
    if (!on) setSelectedCols((arr) => equalize(arr));
  };

  // Хранит СЫРУЮ строку из поля (без коэрса) — поле можно очистить.
  const setRarity = (lvl: number, raw: string) =>
    setRarityWeights((rw) => ({ ...rw, [String(lvl)]: raw }));
  const equalizeRarity = () => {
    const active = Object.entries(rarityWeights).filter(([, w]) => clampRarity(w) > 0);
    if (active.length === 0) return;
    const sum = active.reduce((s, [, w]) => s + clampRarity(w), 0) || 1;
    setRarityWeights((rw) => {
      const out: Record<string, string> = {};
      for (const [lvl, w] of Object.entries(rw))
        out[lvl] = String(Math.round((clampRarity(w) * 100 * 10) / sum) / 10);
      return out;
    });
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-base font-bold">
          <Package className="h-4 w-4 text-gold" />
          {initial
            ? `Редактирование «${initial.name}»`
            : "Новый пак фишек"}
        </h3>
        <button
          onClick={onClose}
          title="Закрыть"
          aria-label="Закрыть"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Название
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Стартовый пак, Сезон 1 и т.д."
              className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm outline-none focus:border-gold/50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Тип
            </label>
            <select
              value={kind}
              onChange={(e) =>
                setKind(e.target.value as PackData["kind"])
              }
              className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm outline-none focus:border-gold/50"
            >
              {(Object.keys(KIND_META) as Array<PackData["kind"]>).map((k) => (
                <option key={k} value={k}>
                  {KIND_META[k].label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Обложка пака
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
              e.target.value = "";
            }}
          />
          <div className="flex items-center gap-3">
            {coverImageUrl ? (
              <div className="relative">
                <div className="aspect-square h-16 w-16 overflow-hidden rounded-xl border border-border bg-background">
                  <img
                    src={coverImageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
                <button
                  onClick={() => setCoverImageUrl("")}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={upload.isPending}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-4 py-2 text-sm hover:bg-secondary disabled:opacity-50"
              >
                {upload.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {upload.isPending ? "Загружаем…" : "Загрузить"}
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-sky-300/80">
              Цена в звёздах ★
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={priceStars}
              onChange={(e) => setPriceStars(e.target.value)}
              placeholder="напр. 100"
              className="w-full rounded-xl border border-sky-400/40 bg-sky-500/5 px-3 py-2 text-sm outline-none focus:border-sky-400/70"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Цена $DARAI
            </label>
            <input
              type="number"
              min={MIN_PRICE_DARAI}
              step={1000}
              value={priceDarai}
              onChange={(e) => setPriceDarai(e.target.value)}
              placeholder={`мин ${MIN_PRICE_DARAI.toLocaleString("ru")}`}
              className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm outline-none focus:border-gold/50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Цена в золоте (кратно {TICKET_SPEND_GOLD})
            </label>
            <input
              type="number"
              min={MIN_PRICE_TICKETS}
              step={TICKET_SPEND_GOLD}
              value={priceTickets}
              onChange={(e) => setPriceTickets(e.target.value)}
              placeholder={`мин ${MIN_PRICE_TICKETS}`}
              className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm outline-none focus:border-gold/50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Лимит/день
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
              className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm outline-none focus:border-gold/50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Тираж (опц.)
            </label>
            <input
              type="number"
              min={1}
              value={totalSupply}
              onChange={(e) => setTotalSupply(e.target.value)}
              placeholder="∞"
              className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm outline-none focus:border-gold/50"
            />
          </div>
        </div>

        <PackFallbackSelect
          currentId={initial?.id}
          value={fallbackPackId}
          onChange={setFallbackPackId}
        />

        {/* Только для раздач — не продаётся в маркете */}
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-secondary/20 p-3">
          <input
            type="checkbox"
            checked={marketHidden}
            onChange={(e) => setMarketHidden(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-gold"
          />
          <span className="text-sm">
            <span className="font-medium">Только для раздач и наград</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Пак создастся, но НЕ появится в маркете на продажу. Цена не
              обязательна. Доступен для дропов, босса и ручных раздач.
            </span>
          </span>
        </label>

        {/* Состав пака: слоты + коллекции (с весами) + редкость (%) + гарантия */}
        <div className="space-y-3 rounded-2xl border border-border/50 bg-secondary/20 p-3">
          <div className="flex items-center gap-2 text-sm">
            <Layers className="h-4 w-4 text-gold" />
            <span className="font-medium">Состав пака</span>
            <span className="text-[10px] text-muted-foreground">· 3 фишки</span>
          </div>

          {/* Коллекции */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-semibold">Коллекции в паке</span>
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={colCustom}
                  onChange={(e) => toggleCustom(e.target.checked)}
                  className="h-3.5 w-3.5 accent-gold"
                />
                кастомные веса
              </label>
            </div>
            <div className="space-y-1.5">
              {selectedCols.map((c, i) => {
                const usedOther = new Set(
                  selectedCols.filter((_, j) => j !== i).map((x) => x.id)
                );
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/20 p-2"
                  >
                    <select
                      value={c.id}
                      onChange={(e) => updateCol(i, { id: e.target.value })}
                      className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-gold/50"
                    >
                      <option value="">— выбрать коллекцию —</option>
                      {collections.map((col) => (
                        <option
                          key={col.id}
                          value={col.id}
                          disabled={usedOther.has(col.id)}
                        >
                          {col.name}
                        </option>
                      ))}
                    </select>
                    {colCustom && (
                      <>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={c.weight}
                          onChange={(e) =>
                            updateCol(i, { weight: e.target.value })
                          }
                          onBlur={(e) =>
                            updateCol(i, {
                              weight: String(clampColWeight(e.target.value)),
                            })
                          }
                          className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-gold/50"
                        />
                        <span className="text-[11px] text-muted-foreground">
                          %
                        </span>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => removeCol(i)}
                      title="Убрать коллекцию"
                      aria-label="Убрать коллекцию"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-secondary/40 text-muted-foreground transition hover:border-rose-500/40 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={addCol}
              disabled={selectedCols.length >= collections.length}
              className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gold/30 bg-gold/5 px-3 py-1.5 text-xs font-medium text-gold hover:bg-gold/10 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" /> Добавить коллекцию
            </button>
          </div>

          {/* Редкость */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-semibold">Шансы редкости</span>
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={equalizeRarity}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  привести к 100%
                </button>
                <span
                  className={cn(
                    "text-[10px]",
                    Math.abs(raritySum - 100) > 0.5
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                >
                  сумма: {raritySum.toFixed(1)}%
                </span>
              </span>
            </div>
            <div className="space-y-1.5">
              {Object.entries(rarityWeights)
                .sort((a, b) => Number(a[0]) - Number(b[0]))
                .map(([lvlStr, v]) => {
                  const lvl = Number(lvlStr);
                  return (
                    <div
                      key={lvlStr}
                      className="flex items-center gap-2 rounded-md border border-border/60 bg-secondary/20 p-2"
                    >
                      <select
                        value={lvlStr}
                        onChange={(e) => {
                          const newLvl = e.target.value;
                          if (newLvl === lvlStr) return;
                          setRarityWeights((rw) => {
                            const next: Record<string, string> = {};
                            for (const [k, val] of Object.entries(rw)) {
                              next[k === lvlStr ? newLvl : k] = val;
                            }
                            return next;
                          });
                        }}
                        className="w-20 shrink-0 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-semibold text-gold outline-none focus:border-gold/50"
                      >
                        {LEVELS.map((l) => (
                          <option
                            key={l}
                            value={String(l)}
                            disabled={
                              String(l) !== lvlStr &&
                              rarityWeights[String(l)] !== undefined
                            }
                          >
                            {LEVEL_LABEL[l]}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={v}
                        onChange={(e) => setRarity(lvl, e.target.value)}
                        onBlur={(e) =>
                          setRarity(lvl, String(clampRarity(e.target.value)))
                        }
                        className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-gold/50"
                      />
                      <span className="text-[11px] text-muted-foreground">%</span>
                      <button
                        type="button"
                        onClick={() =>
                          setRarityWeights((rw) => {
                            const next = { ...rw };
                            delete next[lvlStr];
                            return next;
                          })
                        }
                        title="Убрать уровень"
                        aria-label="Убрать уровень"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-secondary/40 text-muted-foreground transition hover:border-rose-500/40 hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
            </div>
            <button
              type="button"
              onClick={() => {
                // Берём первый ещё не выбранный уровень
                const used = new Set(Object.keys(rarityWeights));
                const free = LEVELS.find((l) => !used.has(String(l)));
                if (!free) return;
                setRarityWeights((rw) => ({ ...rw, [String(free)]: "0" }));
              }}
              disabled={Object.keys(rarityWeights).length >= LEVELS.length}
              className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gold/30 bg-gold/5 px-3 py-1.5 text-xs font-medium text-gold hover:bg-gold/10 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" /> Добавить уровень
            </button>
          </div>

          {/* Гарантия */}
          <div>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={!!guarantee}
                onChange={(e) => {
                  if (e.target.checked) {
                    const next = guarantee ?? { minLevel: 2, slotsAtLeast: 1 };
                    setGuarantee(next);
                    setGuaranteeSlotsRaw(String(next.slotsAtLeast));
                  } else {
                    setGuarantee(null);
                  }
                }}
              />
              Гарантия: минимум N слот(ов) от X★ и выше
            </label>
            {guarantee && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">минимум</span>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, Number(slots) || 1)}
                  value={guaranteeSlotsRaw}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setGuaranteeSlotsRaw(raw);
                    // Держим числовой payload в границах; пустую строку не пишем
                    // в guarantee — нормализуем на blur.
                    if (raw.trim() !== "") {
                      setGuarantee({
                        ...guarantee,
                        slotsAtLeast: clampGuaranteeSlots(
                          raw,
                          Math.max(1, Number(slots) || 1)
                        ),
                      });
                    }
                  }}
                  onBlur={(e) => {
                    const n = clampGuaranteeSlots(
                      e.target.value,
                      Math.max(1, Number(slots) || 1)
                    );
                    setGuaranteeSlotsRaw(String(n));
                    setGuarantee({ ...guarantee, slotsAtLeast: n });
                  }}
                  className="w-16 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-gold/50"
                />
                <span className="text-muted-foreground">слот(ов) уровня</span>
                <select
                  value={guarantee.minLevel}
                  onChange={(e) =>
                    setGuarantee({
                      ...guarantee,
                      minLevel: Number(e.target.value),
                    })
                  }
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-gold/50"
                >
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {LEVEL_LABEL[l]}
                    </option>
                  ))}
                </select>
                <span className="text-muted-foreground">и выше</span>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => save.mutate()}
          disabled={!canSave || save.isPending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl gradient-gold px-5 py-3 text-sm font-bold text-gold-foreground shadow-gold transition disabled:opacity-50"
        >
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          {initial ? "Сохранить" : "Создать пак"}
        </button>
      </div>
    </div>
  );
}

function DropTableRow({
  it,
  collections,
  onChange,
  onRemove,
}: {
  it: DropTableItem;
  collections: CollectionData[];
  onChange: (patch: Partial<DropTableItem>) => void;
  onRemove: () => void;
}) {
  const collection = collections.find((c) => c.id === it.collectionId);
  // Сырой ввод веса, чтобы поле можно было очистить при наборе. В число
  // (мин 0.01) превращаем при изменении/уходе — тип DropTableItem остаётся
  // числовым.
  const [weightRaw, setWeightRaw] = useState(String(it.weight));
  useEffect(() => {
    setWeightRaw(String(it.weight));
  }, [it.weight]);
  const clampRowWeight = (raw: string) => Math.max(0.01, Number(raw) || 0.01);
  return (
    <div className="grid items-center gap-2 rounded-lg border border-border/60 bg-secondary/20 p-2 md:grid-cols-[1fr_1fr_auto_auto_auto]">
      {/* Коллекция */}
      <select
        value={it.collectionId ?? ""}
        onChange={(e) =>
          onChange({ collectionId: e.target.value || null })
        }
        className="rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-gold/50"
      >
        <option value="">Любая коллекция</option>
        {collections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {/* Template внутри коллекции */}
      <select
        value={it.templateId ?? ""}
        onChange={(e) => onChange({ templateId: e.target.value || null })}
        disabled={!collection}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-gold/50 disabled:opacity-40"
      >
        <option value="">{collection ? "Любой template" : "—"}</option>
        {(collection?.templates ?? []).map((t) => (
          <option key={t.id} value={t.id}>
            #{t.templateNo} · {t.name}
          </option>
        ))}
      </select>

      {/* Level */}
      <select
        value={it.level}
        onChange={(e) => onChange({ level: Number(e.target.value) })}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-gold/50"
      >
        {LEVELS.map((lvl) => (
          <option key={lvl} value={lvl}>
            {LEVEL_LABEL[lvl]}
          </option>
        ))}
      </select>

      {/* Weight */}
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0.01}
          step={0.1}
          value={weightRaw}
          onChange={(e) => {
            const raw = e.target.value;
            setWeightRaw(raw);
            if (raw.trim() !== "") onChange({ weight: clampRowWeight(raw) });
          }}
          onBlur={(e) => {
            const n = clampRowWeight(e.target.value);
            setWeightRaw(String(n));
            onChange({ weight: n });
          }}
          className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-gold/50"
        />
        <span className="text-[11px] text-muted-foreground">%</span>
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function PackCard({
  pack,
  collections,
}: {
  pack: PackData;
  collections: CollectionData[];
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const toggle = useMutation({
    mutationFn: () =>
      adminUpdateChipPack({
        data: { id: pack.id, active: !pack.active },
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin", "chip-packs"] }),
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const del = useMutation({
    mutationFn: () => adminDeleteChipPack({ data: { id: pack.id } }),
    onSuccess: (res) => {
      if ((res as { mode?: string }).mode === "soft") {
        toast.success(
          "Скрыт с витрины (в инвентарях есть фишки из этого пака — полностью удалить нельзя)"
        );
      } else {
        toast.success("Удалён");
      }
      qc.invalidateQueries({ queryKey: ["admin", "chip-packs"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  if (editing) {
    return (
      <PackForm
        initial={pack}
        collections={collections}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          qc.invalidateQueries({ queryKey: ["admin", "chip-packs"] });
        }}
      />
    );
  }

  const dt = pack.dropTable as DropTableConfig | null;
  const sum = (dt?.dropTable ?? []).reduce((s, i) => s + (i.weight || 0), 0);
  const tail = Math.max(0, 100 - sum);
  const kindMeta = KIND_META[pack.kind];

  // Редкость наглядно: суммируем веса по уровню (★) — компактные чипы
  // «★ · %» вместо длинной построчной формулировки коллекция×уровень.
  const rarityByLevel = (() => {
    const acc: Record<number, number> = {};
    for (const it of dt?.dropTable ?? []) {
      acc[it.level] = (acc[it.level] ?? 0) + (it.weight || 0);
    }
    return Object.entries(acc)
      .map(([lvl, w]) => ({ lvl: Number(lvl), w }))
      .sort((a, b) => a.lvl - b.lvl);
  })();

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/50 bg-card p-3 transition hover:border-border/80",
        !pack.active && "opacity-60"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="aspect-square h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-border bg-background">
          {pack.coverImageUrl ? (
            <img
              src={pack.coverImageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Package className="h-5 w-5" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="truncate font-display text-sm font-semibold">
              {pack.name}
            </div>
            <span
              className={cn(
                "rounded-full border px-1.5 py-0.5 text-[10px]",
                kindMeta.cls
              )}
              title={kindMeta.hint}
            >
              {kindMeta.label}
            </span>
            {pack.active ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                <Check className="h-2.5 w-2.5" /> активен
              </span>
            ) : (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                выключен
              </span>
            )}
            {pack.marketHidden && (
              <span
                className="rounded-full bg-neon/10 px-2 py-0.5 text-[10px] font-medium text-neon"
                title="Не продаётся в маркете, только для раздач и наград"
              >
                только для раздач
              </span>
            )}
          </div>
          {/* Ключевые метрики — компактными чипами */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            {pack.priceDarai != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gold/10 px-2 py-0.5 font-medium text-gold">
                <Coins className="h-3 w-3" />
                {pack.priceDarai.toLocaleString()}
              </span>
            )}
            {pack.priceTickets != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-neon/10 px-2 py-0.5 font-medium text-neon">
                <span aria-hidden>🪙</span>
                {goldForTicketPrice(pack.priceTickets).toLocaleString()}
              </span>
            )}
            <span
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-muted-foreground"
              title="Фишек в паке"
            >
              <Layers className="h-3 w-3" />
              {dt?.slots ?? 3}
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-muted-foreground"
              title="Лимит покупок в день"
            >
              лимит {pack.dailyLimit}/д
            </span>
            {pack.totalSupply != null && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-muted-foreground"
                title="Продано из тиража"
              >
                {pack.soldCount}/{pack.totalSupply}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => toggle.mutate()}
            disabled={toggle.isPending}
            title={pack.active ? "Выключить пак" : "Включить пак"}
            aria-label={pack.active ? "Выключить пак" : "Включить пак"}
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 transition disabled:opacity-50",
              pack.active
                ? "text-success hover:bg-secondary"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <Power className="h-4 w-4" />
          </button>
          <button
            onClick={() => setEditing(true)}
            title="Редактировать пак"
            aria-label="Редактировать пак"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              if (confirm(`Удалить пак «${pack.name}»?`)) del.mutate();
            }}
            disabled={del.isPending}
            title="Удалить пак"
            aria-label="Удалить пак"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:border-rose-500/40 hover:text-rose-400 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Rarity-веса — наглядно и компактно: «★ N · %» + полоска. */}
      {rarityByLevel.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {rarityByLevel.map(({ lvl, w }) => (
            <span
              key={lvl}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px]"
              title={`${LEVEL_LABEL[lvl] ?? `lvl${lvl}`} · ${w.toFixed(1)}%`}
            >
              <Star className="h-2.5 w-2.5 fill-gold text-gold" />
              <span className="font-medium text-foreground">
                {LEVEL_LABEL[lvl] ?? `lvl${lvl}`}
              </span>
              <span className="text-muted-foreground">{w.toFixed(1)}%</span>
            </span>
          ))}
          {tail > 0 && (
            <span
              className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground"
              title="Шанс не получить фишку"
            >
              хвост {tail.toFixed(1)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}
