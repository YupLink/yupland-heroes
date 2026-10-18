import { useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { updateDropEvent } from "@/server/api/admin-campaigns-manage";
import { listDropEvents } from "@/server/api/admin-campaigns-list";
import { adminListPacks } from "@/server/api/packs";
import { adminListChipPacks } from "@/server/api/chips-admin";
import { TitleAutocomplete } from "@/components/TitleAutocomplete";
import { toast } from "sonner";
import {
  Coins,
  Gift,
  AlertTriangle,
  Loader2,
  Check,
  Repeat,
  Sparkles,
  X,
  ImageIcon,
  Package,
  Zap,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { humanError } from "@/lib/humanError";

// Контракт по умолчанию — yuplandshop. На бэке тот же SENDLER_DEFAULT_CONTRACT.
export const DEFAULT_NFT_CONTRACT = "yuplandshop.mintbase1.near";

export function parseRewardSpec(input: string): { min: number; max: number } | null {
  const s = input.trim();
  if (!s) return null;
  const range = s.match(/^(\d+)\s*-\s*(\d+)$/);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return null;
    return { min, max };
  }
  const fixed = s.match(/^(\d+)$/);
  if (fixed) {
    const n = Number(fixed[1]);
    if (!Number.isFinite(n) || n < 0) return null;
    return { min: n, max: n };
  }
  return null;
}

export function formatRewardSpec(min: number, max: number): string {
  return min === max ? String(min) : `${min}-${max}`;
}

export type DropEvent = Awaited<ReturnType<typeof listDropEvents>>[number];

/**
 * Селектор типа награды: Токены / NFT / Лут-бокс. Segmented control с
 * иконкой-якорем у каждого варианта; активный подсвечен золотым.
 * Внутренние значения остаются ft/nft/pack — меняется только подпись.
 */
export function KindToggle({
  value,
  onChange,
}: {
  value: "ft" | "nft" | "pack" | "energy";
  onChange: (v: "ft" | "nft" | "pack" | "energy") => void;
}) {
  const opts: Array<{
    key: "ft" | "nft" | "pack" | "energy";
    label: string;
    icon: typeof Coins;
  }> = [
    { key: "ft", label: "Токены", icon: Coins },
    { key: "nft", label: "NFT", icon: ImageIcon },
    { key: "pack", label: "Лут-бокс", icon: Package },
    { key: "energy", label: "Энергия", icon: Zap },
  ];
  return (
    <div className="inline-flex h-8 select-none items-center rounded-full border border-border bg-secondary/60 p-0.5 text-[11px] font-medium">
      {opts.map((o) => {
        const Icon = o.icon;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={cn(
              "inline-flex h-full items-center gap-1 rounded-full px-3 transition-colors",
              value === o.key
                ? "gradient-gold text-gold-foreground shadow-gold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Селектор активного пака. Грузит /admin/packs list и показывает выпадающий
 * список с превью. Возвращает packId | "".
 */
export function PackPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (packId: string) => void;
}) {
  const nftPacks = useQuery({
    queryKey: ["admin", "packs", "active-only"],
    queryFn: () => adminListPacks({ data: { activeOnly: true } }),
  });
  const chipPacks = useQuery({
    queryKey: ["admin", "chip-packs", "all"],
    queryFn: () => adminListChipPacks(),
  });
  const chipList = (chipPacks.data ?? [])
    .filter((p) => p.active && (!p.exhausted || p.id === value))
    .map((p) => ({
      id: p.id,
      name: p.exhausted ? `${p.name} (исчерпан)` : p.name,
      imageUrl: p.coverImageUrl,
      description: p.description,
    }));
  const nftList = (nftPacks.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    imageUrl: p.imageUrl,
    description: p.description,
  }));
  const all = [...chipList, ...nftList];
  const selected = all.find((p) => p.id === value);
  const loading = nftPacks.isLoading || chipPacks.isLoading;
  return (
    <div className="space-y-1.5">
      {all.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-background px-2 py-2 text-xs text-muted-foreground">
          {loading
            ? "Загружаем паки…"
            : "Нет активных паков. Создай в /admin/chips или /admin/packs."}
        </div>
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-gold/50"
        >
          <option value="">— выбери пак —</option>
          {chipList.length > 0 && (
            <optgroup label="🃏 Чип-паки (Фишки)">
              {chipList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
          {nftList.length > 0 && (
            <optgroup label="📦 NFT-паки">
              {nftList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      )}
      {selected && selected.imageUrl && (
        <div className="flex items-center gap-2">
          <div className="aspect-square h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-background">
            <img
              src={selected.imageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0 text-[11px] text-muted-foreground">
            {selected.description ? (
              <span className="line-clamp-2">{selected.description}</span>
            ) : (
              <span>Пак выбран</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────── Confirm-modal перед созданием дропа ────────

/**
 * Двухстадийный модал:
 *  - Стадия 1 (isPending=false): подтверждение с превью того что создаём.
 *    Кнопки: «Отмена» / «Создать».
 *  - Стадия 2 (isPending=true): полный блок UI с лоадером «Создаём…».
 *    Никаких кнопок, закрыть нельзя — ждём ответ сервера.
 *
 * Рендерится через portal в body — не зависит от stacking context страницы.
 */
export function CreateDropConfirmModal({
  summary,
  isPending,
  kind,
  onCancel,
  onConfirm,
}: {
  summary: {
    titles: string[];
    rewardLine: string;
    freeClaim: boolean;
    ticketCost: number;
  };
  isPending: boolean;
  kind: "simple" | "combo";
  onCancel: () => void;
  onConfirm: (allowDuplicate: boolean) => void;
}) {
  void kind;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={isPending ? undefined : onCancel}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-gold/40 bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {isPending ? (
          // Стадия 2: создаём, ждём ответ
          <div className="flex flex-col items-center gap-4 px-8 py-10">
            <Loader2 className="h-10 w-10 animate-spin text-gold" />
            <div className="text-center">
              <div className="font-display text-base font-bold">
                Создаём дроп{summary.titles.length > 1 ? "ы" : ""}…
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Не закрывай страницу. Подожди завершения.
              </div>
            </div>
          </div>
        ) : (
          // Стадия 1: подтверждение
          <>
            <div className="border-b border-border/60 px-5 py-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-gold" />
                <span className="font-display text-base font-bold">
                  Подтверди создание
                </span>
              </div>
            </div>
            <div className="space-y-3 px-5 py-4 text-xs">
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                  NFT в дропе ({summary.titles.length})
                </div>
                <div className="max-h-32 space-y-0.5 overflow-y-auto rounded-md border border-border bg-secondary/20 p-2 font-mono text-[11px]">
                  {summary.titles.map((t, i) => (
                    <div key={i} className="truncate">
                      • {t}
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border border-border bg-secondary/20 p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">
                    Награда
                  </div>
                  <div className="mt-0.5 truncate font-medium">
                    {summary.rewardLine}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-secondary/20 p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">
                    Цена клейма
                  </div>
                  <div className="mt-0.5 font-medium">
                    {summary.freeClaim
                      ? "Бесплатно"
                      : `${summary.ticketCost} билет${summary.ticketCost === 1 ? "" : summary.ticketCost < 5 ? "а" : "ов"}`}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-border/60 px-5 py-4">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => onConfirm(false)}
                className="flex-[2] inline-flex items-center justify-center gap-2 rounded-xl gradient-gold px-4 py-2.5 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01]"
              >
                <Plus className="h-4 w-4" />
                Создать
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// ──────── Модал-предупреждение о дубликате ────────

/**
 * Показывается когда бэкенд отказал по pre-check'у «уже есть active дроп
 * с теми же параметрами». Кнопка «Создать всё равно» отправляет повторно
 * с allowDuplicate=true.
 */
export function DuplicateWarnModal({
  titles,
  isPending,
  onCancel,
  onConfirm,
}: {
  titles: string[];
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={isPending ? undefined : onCancel}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-amber-500/40 bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {isPending ? (
          <div className="flex flex-col items-center gap-4 px-8 py-10">
            <Loader2 className="h-10 w-10 animate-spin text-amber-400" />
            <div className="text-center">
              <div className="font-display text-base font-bold">
                Создаём дубль…
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Не закрывай страницу.
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-amber-500/30 px-5 py-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                <span className="font-display text-base font-bold">
                  Такой дроп уже есть
                </span>
              </div>
            </div>
            <div className="space-y-3 px-5 py-4 text-xs">
              <p className="text-muted-foreground">
                У этих NFT уже есть активный дроп с такими же параметрами
                (name + контракт + награда + цена). Точно создать дубликат?
              </p>
              <div className="max-h-32 space-y-0.5 overflow-y-auto rounded-md border border-amber-500/20 bg-amber-500/5 p-2 font-mono text-[11px]">
                {titles.map((t, i) => (
                  <div key={i} className="truncate">
                    • {t}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-amber-500/30 px-5 py-4">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="flex-[2] inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-background transition hover:bg-amber-400"
              >
                Создать всё равно
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

export function DropEditForm({
  drop,
  tokens,
  onClose,
}: {
  drop: DropEvent;
  tokens: Array<{ symbol: string; ftContract: string; decimals: number }>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  // Определяем текущий тип приза из rewardTiers
  const currentTier = (drop.rewardTiers ?? []).find(
    (t) => (t as { kind?: string }).kind === "nft" || (t as { kind?: string }).kind === "pack"
  ) as { kind?: string; nftTitle?: string; packId?: string } | undefined;
  const initialKind: "ft" | "nft" | "pack" =
    currentTier?.kind === "nft"
      ? "nft"
      : currentTier?.kind === "pack"
        ? "pack"
        : "ft";
  const [kind, setKind] = useState<"ft" | "nft" | "pack">(initialKind);
  const [reward, setReward] = useState(
    formatRewardSpec(drop.rewardMin, drop.rewardMax)
  );
  const [token, setToken] = useState(drop.rewardToken);
  const [nftTitle, setNftTitle] = useState(currentTier?.nftTitle ?? "");
  const [packId, setPackId] = useState(currentTier?.packId ?? "");
  const [freeClaim, setFreeClaim] = useState(drop.freeClaim);
  const [recurring, setRecurring] = useState(drop.recurring);
  const [ticketCost, setTicketCost] = useState(
    String(drop.ticketCost ?? 1)
  );

  const packs = useQuery({
    queryKey: ["admin-packs-active"],
    queryFn: () => adminListPacks({ data: { activeOnly: true } }),
    enabled: kind === "pack",
  });
  const chipPacks = useQuery({
    queryKey: ["admin-chip-packs-all"],
    queryFn: () => adminListChipPacks(),
    enabled: kind === "pack",
  });

  const update = useMutation({
    mutationFn: updateDropEvent,
    onSuccess: () => {
      toast.success("Дроп обновлён");
      qc.invalidateQueries({ queryKey: ["admin", "drops"] });
      onClose();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const rewardParsed = parseRewardSpec(reward);

  const onSave = () => {
    if (kind === "nft" && !nftTitle.trim()) {
      toast.error("Укажи NFT-приз");
      return;
    }
    if (kind === "pack" && !packId.trim()) {
      toast.error("Выбери пак");
      return;
    }
    if (kind === "ft" && !rewardParsed) {
      toast.error('Награда: "10" или "1-10"');
      return;
    }
    let rewardTiers:
      | Array<{
          weight: number;
          kind: "ft" | "nft" | "pack";
          rewardMin: number;
          rewardMax: number;
          rewardToken: string;
          nftTitle: string;
          packId: string;
        }>
      | null = null;
    if (kind === "nft") {
      rewardTiers = [
        {
          weight: 100,
          kind: "nft",
          rewardMin: 0,
          rewardMax: 0,
          rewardToken: token,
          nftTitle: nftTitle.trim(),
          packId: "",
        },
      ];
    } else if (kind === "pack") {
      rewardTiers = [
        {
          weight: 100,
          kind: "pack",
          rewardMin: 0,
          rewardMax: 0,
          rewardToken: token,
          nftTitle: "",
          packId: packId.trim(),
        },
      ];
    }
    update.mutate({
      data: {
        id: drop.id,
        rewardMin: kind === "ft" ? rewardParsed!.min : 0,
        rewardMax: kind === "ft" ? rewardParsed!.max : 0,
        rewardToken: token,
        rewardTiers,
        maxTotalPool: drop.maxTotalPool ?? null,
        maxUsers: drop.maxUsers ?? null,
        freeClaim,
        recurring,
        ticketCost: freeClaim
          ? 1
          : Math.max(0.01, Math.round((Number(ticketCost) || 0.01) * 100) / 100),
      },
    });
  };

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-gold/20 bg-gold/5 p-4">
      {/* Тип приза */}
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Тип приза
        </label>
        <div className="inline-flex rounded-full border border-border bg-background p-1">
          {(
            [
              { v: "ft", label: "💰 Токен" },
              { v: "nft", label: "🎁 NFT" },
              { v: "pack", label: "📦 Пак" },
            ] as Array<{ v: "ft" | "nft" | "pack"; label: string }>
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setKind(o.v)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition",
                kind === o.v
                  ? "gradient-gold text-gold-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {kind === "ft" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Награда
            </label>
            <input
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              placeholder="10 или 1-10"
              className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm outline-none focus:border-gold/50"
            />
          </div>
          <div className="min-w-0">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Токен
            </label>
            <select
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm outline-none focus:border-gold/50"
            >
              {tokens.map((t) => (
                <option key={t.symbol} value={t.symbol}>
                  {t.symbol}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {kind === "nft" && (
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            NFT-приз (title)
          </label>
          <TitleAutocomplete
            value={nftTitle ? { title: nftTitle, image: null, count: 0 } : null}
            onSelect={(sel) => setNftTitle(sel?.title ?? "")}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Поиск по коллекции. NFT с этим title должен быть на нашем
            призовом коше.
          </p>
        </div>
      )}

      {kind === "pack" && (
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Пак
          </label>
          <select
            value={packId}
            onChange={(e) => setPackId(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm outline-none focus:border-gold/50"
          >
            <option value="">— выбери пак —</option>
            {(chipPacks.data ?? []).filter(
              (p) => p.active && (!p.exhausted || p.id === packId)
            ).length > 0 && (
              <optgroup label="🃏 Чип-паки (Фишки)">
                {(chipPacks.data ?? [])
                  .filter((p) => p.active && (!p.exhausted || p.id === packId))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.exhausted ? `${p.name} (исчерпан)` : p.name} ({p.id})
                    </option>
                  ))}
              </optgroup>
            )}
            {(packs.data ?? []).length > 0 && (
              <optgroup label="📦 NFT-паки">
                {(packs.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.id})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      )}

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background/40 p-3">
        <input
          type="checkbox"
          checked={freeClaim}
          onChange={(e) => setFreeClaim(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-gold"
        />
        <div className="flex-1">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Gift className="h-3.5 w-3.5 text-gold" />
            Free клейм
          </div>
          <div className="text-[11px] text-muted-foreground">
            Можно погашать без билетов и не расходовать их.
          </div>
        </div>
      </label>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background/40 p-3">
        <input
          type="checkbox"
          checked={recurring}
          onChange={(e) => setRecurring(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-neon"
        />
        <div className="flex-1">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Repeat className="h-3.5 w-3.5 text-neon" />
            Авто-перезапуск каждые 30 дней
          </div>
          <div className="text-[11px] text-muted-foreground">
            Дроп пересоздаётся сам через 30 дней — клейм по NFT раз в 30 дней.
          </div>
        </div>
      </label>

      {!freeClaim && (
        <div className="rounded-xl border border-border bg-background/40 p-3">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">
              Стоимость в билетах за{" "}
              {drop.mode === "combo" ? "1 комбо-сет" : "1 клейм"}
            </span>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={ticketCost}
              placeholder="0.01"
              onChange={(e) => setTicketCost(e.target.value)}
              className="w-20 rounded-md border border-border bg-background px-2 py-1 text-right font-mono text-sm outline-none focus:border-gold/50"
            />
          </label>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            По умолчанию 1. При стирании поля сохранится 1.
          </p>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          disabled={update.isPending}
          className="rounded-lg border border-border bg-secondary/40 px-4 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-50"
        >
          Отмена
        </button>
        <button
          onClick={onSave}
          disabled={
            update.isPending ||
            (kind === "ft" && !rewardParsed) ||
            (kind === "nft" && !nftTitle.trim()) ||
            (kind === "pack" && !packId.trim())
          }
          className="inline-flex items-center gap-2 rounded-lg gradient-gold px-4 py-2 text-xs font-bold text-gold-foreground shadow-gold transition hover:scale-[1.02] disabled:opacity-50"
        >
          {update.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Сохранить
        </button>
      </div>
    </div>
  );
}

/**
 * Подсказка под формой создания: сколько максимум токенов потребуется
 * под дроп, и хватает ли на сервисном кошельке.
 */
export function RequiredTokensHint({
  rewardMax,
  isRange,
  maxTotalPool,
  maxUsers,
  totalNfts,
  comboMaxSets,
  freeClaim,
  token,
  balanceHuman,
  balanceRaw,
  decimals,
}: {
  rewardMax: number;
  isRange: boolean;
  maxTotalPool: number | null;
  maxUsers: number | null;
  totalNfts: number;
  comboMaxSets: number | null;
  freeClaim: boolean;
  token: string;
  balanceHuman: string;
  balanceRaw: string;
  decimals: number;
}) {
  let needed: number | null = null;
  let basis = "";
  if (comboMaxSets != null) {
    needed = comboMaxSets * rewardMax;
    basis =
      comboMaxSets === 0
        ? "ни одного комбо собрать нельзя"
        : `${comboMaxSets} комбо × ${rewardMax}`;
  } else if (maxTotalPool != null) {
    needed = maxTotalPool;
    basis = "ограничен фондом";
  } else if (maxUsers != null) {
    needed = maxUsers * rewardMax;
    basis = `${maxUsers} участников × ${rewardMax}`;
  } else if (totalNfts > 0) {
    needed = totalNfts * rewardMax;
    basis = `${totalNfts} NFT × ${rewardMax}`;
  }

  if (needed == null) {
    return (
      <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
        <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
        Без лимитов и без NFT нельзя посчитать необходимый объём токенов.
      </div>
    );
  }

  const neededRaw = BigInt(needed) * 10n ** BigInt(decimals);
  const enough = BigInt(balanceRaw) >= neededRaw;

  return (
    <div
      className={cn(
        "rounded-xl border p-3 text-xs",
        enough
          ? "border-success/30 bg-success/5 text-success"
          : "border-destructive/30 bg-destructive/5 text-destructive"
      )}
    >
      <div className="flex items-start gap-2">
        {enough ? (
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        ) : (
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        )}
        <div className="flex-1 text-foreground">
          <div className="font-medium">
            Нужно{isRange ? " (макс)" : ""}:{" "}
            <span className={enough ? "text-success" : "text-destructive"}>
              {needed} {token}
            </span>{" "}
            <span className="text-muted-foreground">· {basis}</span>
          </div>
          <div className="mt-0.5 text-muted-foreground">
            На сервисном:{" "}
            <span className="text-foreground">
              {balanceHuman} {token}
            </span>
            {!enough && " — пополни перед запуском"}
            {freeClaim && (
              <span className="ml-2 text-success">
                · free claim
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TiersEditor({
  tiers,
  onChange,
  tokenOptions,
  totalWeight,
}: {
  tiers: Array<{
    weight: string;
    kind: "ft" | "nft" | "pack" | "energy";
    rewardMin: string;
    rewardMax: string;
    rewardToken: string;
    nftTitle: string;
    packId: string;
  }>;
  onChange: (
    next: Array<{
      weight: string;
      kind: "ft" | "nft" | "pack" | "energy";
      rewardMin: string;
      rewardMax: string;
      rewardToken: string;
      nftTitle: string;
      packId: string;
    }>
  ) => void;
  tokenOptions: string[];
  totalWeight: number;
}) {
  const update = (idx: number, patch: Partial<(typeof tiers)[number]>) =>
    onChange(tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  const remove = (idx: number) =>
    onChange(tiers.filter((_, i) => i !== idx));
  const add = () =>
    onChange([
      ...tiers,
      {
        weight: "10",
        kind: "ft",
        rewardMin: "1",
        rewardMax: "10",
        rewardToken: tokenOptions[0] ?? "",
        nftTitle: "",
        packId: "",
      },
    ]);

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">Ярусы</span>
        <span>·</span>
        <span>
          сумма шансов:{" "}
          <span
            className={
              totalWeight > 0 ? "text-foreground" : "text-destructive"
            }
          >
            {totalWeight.toFixed(1)}%
          </span>
        </span>
        {totalWeight > 0 && totalWeight < 100 && (
          <span className="text-[10px] text-muted-foreground">
            · оставшиеся {(100 - totalWeight).toFixed(1)}% → 🎉 «Молодец»
            (без награды)
          </span>
        )}
        {totalWeight > 100 && (
          <span className="text-[10px] text-amber-300">
            (нормализуется на сервере к 100%)
          </span>
        )}
      </div>

      <div className="space-y-2">
        {tiers.map((t, i) => {
          const w = Number(t.weight);
          const denom = Math.max(100, totalWeight);
          const pct =
            denom > 0 && Number.isFinite(w) && w > 0
              ? Math.round((w / denom) * 1000) / 10
              : 0;
          return (
            <div
              key={i}
              className="space-y-2 rounded-lg border border-border/60 bg-secondary/20 p-2.5"
            >
              {/* Строка 1: Шанс + удалить */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">
                    Шанс (вес)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={t.weight}
                      onChange={(e) =>
                        update(i, { weight: e.target.value })
                      }
                      placeholder="вес"
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-gold/50"
                    />
                    <span className="shrink-0 rounded-md bg-gold/10 px-2 py-1 text-[11px] font-mono text-gold">
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="mt-4 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-destructive/30 bg-destructive/5 text-destructive transition hover:bg-destructive/10"
                  title="Удалить ярус"
                >
                  ✕
                </button>
              </div>

              {/* Тип награды: FT / NFT / Пак / Энергия */}
              <KindToggle
                value={t.kind}
                onChange={(k) =>
                  update(i, {
                    kind: k,
                    rewardToken: k === "energy" ? "energy" : t.rewardToken,
                  })
                }
              />

              {t.kind === "ft" ? (
                <>
                  {/* Строка 2 (FT): Диапазон min — max */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">
                        Награда от
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={t.rewardMin}
                        onChange={(e) =>
                          update(i, { rewardMin: e.target.value })
                        }
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
                        value={t.rewardMax}
                        onChange={(e) =>
                          update(i, { rewardMax: e.target.value })
                        }
                        placeholder="макс"
                        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-gold/50"
                      />
                    </div>
                  </div>

                  {/* Строка 3 (FT): Токен */}
                  <div>
                    <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">
                      Токен
                    </label>
                    {tokenOptions.length > 0 ? (
                      <select
                        value={t.rewardToken}
                        onChange={(e) =>
                          update(i, { rewardToken: e.target.value })
                        }
                        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-gold/50"
                      >
                        {!tokenOptions.includes(t.rewardToken) && t.rewardToken && (
                          <option value={t.rewardToken}>{t.rewardToken}</option>
                        )}
                        {tokenOptions.map((sym) => (
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
              ) : t.kind === "energy" ? (
                <div>
                  <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">
                    Энергия — количество
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">
                        от
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={t.rewardMin}
                        onChange={(e) =>
                          update(i, { rewardMin: e.target.value })
                        }
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
                        value={t.rewardMax}
                        onChange={(e) =>
                          update(i, { rewardMax: e.target.value })
                        }
                        placeholder="макс"
                        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-gold/50"
                      />
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    Начисляется мгновенно на баланс энергии при погашении —
                    без токена и без он-чейна.
                  </div>
                </div>
              ) : t.kind === "nft" ? (
                <div>
                  <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">
                    NFT-title (приз)
                  </label>
                  <TitleAutocomplete
                    value={
                      t.nftTitle
                        ? { title: t.nftTitle, image: null, count: 0 }
                        : null
                    }
                    onSelect={(sel) =>
                      update(i, { nftTitle: sel?.title ?? "" })
                    }
                  />
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    NFT с этим title должны заранее лежать на darai_gdrop.near.
                    При выпадении выдаётся свободный token_id.
                  </div>
                </div>
              ) : (
                <div>
                  <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">
                    Пак (loot-box)
                  </label>
                  <PackPicker
                    value={t.packId}
                    onChange={(id) => update(i, { packId: id })}
                  />
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    Юзер получит коробку с призами; откроет её в инвентаре.
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={add}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gold/30 bg-gold/5 px-3 py-2 text-xs font-medium text-gold transition hover:bg-gold/10"
      >
        + Добавить ярус
      </button>
    </div>
  );
}
