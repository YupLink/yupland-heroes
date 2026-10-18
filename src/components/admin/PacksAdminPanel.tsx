import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminCreatePack,
  adminListPacks,
  adminTogglePack,
  adminDeletePack,
} from "@/server/api/packs";
import { listRewardTokens } from "@/server/api/admin-payouts";
import { withoutUsdt } from "@/lib/usdtBanned";
import { TitleAutocomplete } from "@/components/TitleAutocomplete";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Loader2,
  Package,
  Upload,
  X,
  Image as ImageIcon,
  Check,
  EyeOff,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { humanError } from "@/lib/humanError";

// Панель для встраивания как вкладки в /admin/drops.
export { PacksAdminPanel };

type ItemDraft = {
  kind: "nft" | "ft";
  nftTitle: string;
  ftToken: string;
  ftMin: string;
  ftMax: string;
  chancePct: string;
};

function emptyItem(defaultFt = ""): ItemDraft {
  return {
    kind: "nft",
    nftTitle: "",
    ftToken: defaultFt,
    ftMin: "1",
    ftMax: "10",
    chancePct: "10",
  };
}

function PacksAdminPanel() {
  const qc = useQueryClient();

  const tokens = useQuery({
    queryKey: ["admin", "reward-tokens"],
    queryFn: () => listRewardTokens(),
  });
  const tokenSymbols = useMemo(
    () => withoutUsdt((tokens.data ?? []).map((t) => t.symbol)), // USDT — нельзя, §8.49а
    [tokens.data]
  );

  const packs = useQuery({
    queryKey: ["admin", "packs"],
    queryFn: () => adminListPacks({ data: {} }),
  });

  // Форма создания
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);

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
      setImage(url);
      toast.success("Картинка загружена");
    },
    onError: (e: Error) => toast.error(`Upload: ${e.message}`),
  });

  const sumChances = useMemo(
    () =>
      items.reduce((s, it) => {
        const n = Number(it.chancePct);
        return Number.isFinite(n) ? s + n : s;
      }, 0),
    [items]
  );
  const remainder = Math.max(0, 100 - sumChances);

  const updateItem = (idx: number, patch: Partial<ItemDraft>) =>
    setItems((arr) =>
      arr.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    );
  const removeItem = (idx: number) =>
    setItems((arr) => arr.filter((_, i) => i !== idx));
  const addItem = () =>
    setItems((arr) => [...arr, emptyItem(tokenSymbols[0] ?? "")]);

  const create = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        imageUrl: image.trim() || undefined,
        items: items.map((it) => ({
          kind: it.kind,
          nftTitle:
            it.kind === "nft" ? it.nftTitle.trim() || undefined : undefined,
          ftToken: it.kind === "ft" ? it.ftToken.trim() || undefined : undefined,
          ftMin:
            it.kind === "ft" ? Math.max(0, Number(it.ftMin) || 0) : undefined,
          ftMax:
            it.kind === "ft" ? Math.max(0, Number(it.ftMax) || 0) : undefined,
          chancePct: Math.max(0.01, Number(it.chancePct) || 0),
        })),
      };
      return adminCreatePack({ data: payload });
    },
    onSuccess: () => {
      toast.success("Пак создан");
      setName("");
      setDescription("");
      setImage("");
      setItems([emptyItem(tokenSymbols[0] ?? "")]);
      qc.invalidateQueries({ queryKey: ["admin", "packs"] });
    },
    onError: (e: Error) => {
      let msg = e.message;
      try {
        const parsed = JSON.parse(msg) as Array<{ message?: string }>;
        if (Array.isArray(parsed)) {
          msg = parsed.map((p) => p.message).filter(Boolean).join("; ");
        }
      } catch {
        // не JSON
      }
      toast.error(msg || "Ошибка");
    },
  });

  const canCreate = useMemo(() => {
    if (!name.trim()) return false;
    if (items.length === 0) return false;
    if (sumChances > 100.001) return false;
    for (const it of items) {
      const c = Number(it.chancePct);
      if (!Number.isFinite(c) || c <= 0) return false;
      if (it.kind === "nft" && !it.nftTitle.trim()) return false;
      if (it.kind === "ft") {
        if (!it.ftToken.trim()) return false;
        const mn = Number(it.ftMin),
          mx = Number(it.ftMax);
        if (!Number.isFinite(mn) || !Number.isFinite(mx)) return false;
        if (mn < 0 || mx < mn) return false;
      }
    }
    return true;
  }, [name, items, sumChances]);

  return (
    <div className="space-y-8">
      <header>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          Приз в дропе
        </div>
        <h1 className="mt-1 font-display text-3xl font-bold">
          <span className="text-gradient-gold">Лут-бокс</span>{" "}
          <span className="text-muted-foreground">(приз в дропе)</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Создай лут-бокс — это «коробка с призами». Юзер выиграет её в дропе,
          откроет кликом и получит случайную награду из состава. Не путать с
          «Пак фишек (магазин)».
        </p>
      </header>

      {/* Create */}
      <div className="rounded-3xl border border-border bg-card p-4 sm:p-6">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Название пака
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Золотая капсула"
              className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm outline-none focus:border-gold/50"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Картинка (на телефоне — из галереи)
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
              {image ? (
                <div className="relative">
                  <div className="aspect-square h-20 w-20 overflow-hidden rounded-xl border border-border bg-background">
                    <img
                      src={image}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <button
                    onClick={() => setImage("")}
                    title="Убрать картинку"
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
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-4 py-2 text-sm text-foreground transition hover:bg-secondary disabled:opacity-50"
                >
                  {upload.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {upload.isPending ? "Загружаем…" : "Загрузить"}
                </button>
              )}
              {image && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={upload.isPending}
                  className="text-xs text-muted-foreground underline transition hover:text-foreground disabled:opacity-50"
                >
                  Заменить
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Описание (опц.)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Что внутри / что обещает"
              rows={2}
              className="w-full resize-none rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm outline-none focus:border-gold/50"
            />
          </div>

          {/* Items */}
          <div className="rounded-2xl border border-border bg-card/60 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">Состав пака</span>
              <span>·</span>
              <span>
                сумма шансов:{" "}
                <span
                  className={cn(
                    sumChances > 100.001
                      ? "text-destructive"
                      : "text-foreground"
                  )}
                >
                  {sumChances.toFixed(2)}%
                </span>
              </span>
              {sumChances < 100 && (
                <span className="text-[10px] text-muted-foreground">
                  · оставшиеся {remainder.toFixed(2)}% → 🎉 «Молодец»
                  (без награды)
                </span>
              )}
              {sumChances > 100.001 && (
                <span className="text-[10px] text-destructive">
                  · сумма не должна превышать 100%
                </span>
              )}
            </div>

            <div className="space-y-2">
              {items.map((it, i) => (
                <PackItemRow
                  key={i}
                  it={it}
                  tokenSymbols={tokenSymbols}
                  onChange={(patch) => updateItem(i, patch)}
                  onRemove={() => removeItem(i)}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={addItem}
              className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gold/30 bg-gold/5 px-3 py-2 text-xs font-medium text-gold transition hover:bg-gold/10"
            >
              <Plus className="h-3.5 w-3.5" /> Добавить приз
            </button>
          </div>

          <button
            onClick={() => create.mutate()}
            disabled={!canCreate || create.isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl gradient-gold px-5 py-3 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01] disabled:opacity-50"
          >
            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Создать пак
          </button>
        </div>
      </div>

      {/* History */}
      <section>
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Package className="h-4 w-4 text-gold" />
          История паков
        </div>
        {packs.isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Загрузка…
          </div>
        ) : (packs.data ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
            Паков ещё нет. Создай первый выше.
          </div>
        ) : (
          <div className="space-y-2">
            {(packs.data ?? []).map((p) => (
              <PackCard key={p.id} pack={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PackItemRow({
  it,
  tokenSymbols,
  onChange,
  onRemove,
}: {
  it: ItemDraft;
  tokenSymbols: string[];
  onChange: (patch: Partial<ItemDraft>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-secondary/20 p-2.5">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">
            Шанс
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              step="0.1"
              value={it.chancePct}
              onChange={(e) => onChange({ chancePct: e.target.value })}
              placeholder="%"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-gold/50"
            />
            <span className="shrink-0 text-[11px] text-muted-foreground">
              %
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="mt-4 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-destructive/30 bg-destructive/5 text-destructive transition hover:bg-destructive/10"
          title="Удалить"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => onChange({ kind: "nft" })}
          className={cn(
            "flex-1 rounded-md border px-2 py-1 text-[11px] font-medium transition",
            it.kind === "nft"
              ? "border-neon/40 bg-neon/15 text-neon"
              : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
          )}
        >
          🖼 NFT
        </button>
        <button
          type="button"
          onClick={() => onChange({ kind: "ft" })}
          className={cn(
            "flex-1 rounded-md border px-2 py-1 text-[11px] font-medium transition",
            it.kind === "ft"
              ? "border-gold/40 bg-gold/15 text-gold"
              : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
          )}
        >
          💰 Токен
        </button>
      </div>

      {it.kind === "nft" ? (
        <div>
          <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">
            NFT-title (приз)
          </label>
          <TitleAutocomplete
            value={
              it.nftTitle
                ? { title: it.nftTitle, image: null, count: 0 }
                : null
            }
            onSelect={(sel) => onChange({ nftTitle: sel?.title ?? "" })}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">
                Награда от
              </label>
              <input
                type="number"
                min={0}
                value={it.ftMin}
                onChange={(e) => onChange({ ftMin: e.target.value })}
                placeholder="мин"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-gold/50"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">
                до
              </label>
              <input
                type="number"
                min={0}
                value={it.ftMax}
                onChange={(e) => onChange({ ftMax: e.target.value })}
                placeholder="макс"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-gold/50"
              />
            </div>
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">
              Токен
            </label>
            {tokenSymbols.length > 0 ? (
              <select
                value={it.ftToken}
                onChange={(e) => onChange({ ftToken: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-gold/50"
              >
                {!tokenSymbols.includes(it.ftToken) && it.ftToken && (
                  <option value={it.ftToken}>{it.ftToken}</option>
                )}
                {!it.ftToken && <option value="">— выбери —</option>}
                {tokenSymbols.map((sym) => (
                  <option key={sym} value={sym}>
                    {sym}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-md border border-dashed border-border bg-background px-2 py-1.5 text-xs text-muted-foreground">
                Загружаем токены…
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

type PackData = Awaited<ReturnType<typeof adminListPacks>>[number];

function PackCard({ pack }: { pack: PackData }) {
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: () =>
      adminTogglePack({ data: { id: pack.id, active: !pack.active } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "packs"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const del = useMutation({
    mutationFn: () => adminDeletePack({ data: { id: pack.id } }),
    onSuccess: () => {
      toast.success("Удалено");
      qc.invalidateQueries({ queryKey: ["admin", "packs"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const sumChances = pack.items.reduce((s, i) => s + i.chancePct, 0);
  const tail = Math.max(0, 100 - sumChances);

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-3",
        pack.active ? "border-border" : "border-border/40 opacity-60"
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="aspect-square h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border bg-background">
          {pack.imageUrl ? (
            <img
              src={pack.imageUrl}
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
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-medium">{pack.name}</div>
            {pack.active ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-1.5 py-0.5 text-[10px] text-success">
                <Check className="h-2.5 w-2.5" /> активен
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                выключён
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {pack.items.length} приз{pack.items.length === 1 ? "" : "ов"} ·
            сумма шансов {sumChances.toFixed(1)}%
            {tail > 0 && <> · «Молодец» {tail.toFixed(1)}%</>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => toggle.mutate()}
            disabled={toggle.isPending}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-secondary/40 px-2 text-[11px] text-foreground transition hover:bg-secondary disabled:opacity-50"
            title={pack.active ? "Выключить" : "Включить"}
          >
            {pack.active ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm(`Удалить пак «${pack.name}»? Это необратимо.`))
                del.mutate();
            }}
            disabled={del.isPending}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-destructive/30 bg-destructive/5 px-2 text-[11px] text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
            title="Удалить"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Items inline */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {pack.items.map((it) => (
          <span
            key={it.id}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]",
              it.kind === "nft"
                ? "border-neon/30 bg-neon/5 text-neon"
                : "border-gold/30 bg-gold/5 text-gold"
            )}
          >
            {it.kind === "nft" ? (
              <>
                <ImageIcon className="h-2.5 w-2.5" />
                <span className="max-w-[140px] truncate">{it.nftTitle}</span>
              </>
            ) : (
              <>
                💰{" "}
                {it.ftMin === it.ftMax
                  ? `${it.ftMin}`
                  : `${it.ftMin}–${it.ftMax}`}{" "}
                {it.ftToken}
              </>
            )}
            <span className="opacity-70">· {it.chancePct.toFixed(1)}%</span>
          </span>
        ))}
        {tail > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-2 py-0.5 text-[10px] text-muted-foreground">
            🎉 «Молодец» · {tail.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}
