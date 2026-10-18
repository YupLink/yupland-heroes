// Редактор постройки: название и цепочка тиров.
//
// Тир = картинка + условия перехода на следующий (цена и требования к герою).
// Всё хранится в meta шаблона (kind = 'building'), карта берёт оттуда облик.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { adminCreateItem, adminUpdateItem, adminListItems } from "@/server/api/items";
import { listRewardTokens } from "@/server/api/admin-payouts";
import { BuildingTierRow, type TierDraft } from "./BuildingTierRow";
import { humanError } from "@/lib/humanError";
import { buildingEffect, treePrices, type ServicePrice } from "@/lib/buildingEffect";
import { TreePricesEditor } from "./TreePricesEditor";
import { AdminTagChecks } from "@/components/beta-raid/AdminTagChecks";

type ItemRow = Awaited<ReturnType<typeof adminListItems>>[number];

const emptyTier = (n: number): TierDraft => ({
  name: `Тир ${n}`,
  imageUrl: null,
  price: null,
  costs: [],
  requires: null,
});

export function BuildingEditor({
  initial,
  onClose,
}: {
  initial: ItemRow | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [tiers, setTiers] = useState<TierDraft[]>(() => {
    const raw = (initial?.meta as { tiers?: TierDraft[] } | null)?.tiers;
    return Array.isArray(raw) && raw.length > 0 ? raw : [emptyTier(1), emptyTier(2)];
  });
  const [uploading, setUploading] = useState<number | null>(null);
  // Эффект достроенной постройки: верфь спускает корабли, вышка открывает
  // округу. Пусто — постройка только меняет облик.
  // У построек, заведённых до этого поля, эффект угадан по названию — иначе
  // сохранение формы записало бы «ничего» и сломало живую верфь.
  const [effect, setEffect] = useState<string>(
    () => buildingEffect(initial?.meta ?? null, initial?.name ?? null) ?? "",
  );
  // Цены дерева: сколько стоит +1 уровень герою. Вариантов может быть несколько.
  const [prices, setPrices] = useState<ServicePrice[]>(() => treePrices(initial?.meta ?? null));

  const tokensQ = useQuery({ queryKey: ["reward-tokens"], queryFn: () => listRewardTokens() });
  const tokens = (tokensQ.data ?? []).map((t: { symbol: string }) => t.symbol);

  const upload = async (index: number, file: File) => {
    setUploading(index);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error || "не удалось загрузить");
      setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, imageUrl: json.url! } : t)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setUploading(null);
    }
  };

  const save = useMutation({
    mutationFn: () => {
      const clean = tiers.map((t, i) => ({
        name: t.name.trim() || `Тир ${i + 1}`,
        imageUrl: t.imageUrl,
        price: i < tiers.length - 1 ? (t.price ?? null) : null,
        // Цена списком: у последнего тира её нет — дальше улучшать нечего.
        costs: i < tiers.length - 1 ? ((t.costs ?? []).filter((p) => p.amount > 0) ?? null) : null,
        requires: i < tiers.length - 1 ? (t.requires ?? null) : null,
      }));
      const payload = {
        name: name.trim(),
        imageUrl: clean[0]?.imageUrl ?? undefined,
        meta: {
          tiers: clean,
          effect: effect || null,
          // Пустые строки цен не сохраняем: дерево с нулём не работает.
          levelPrices: effect === "leveltree" ? prices.filter((p) => p.amount > 0) : [],
        },
      };
      return initial
        ? adminUpdateItem({
            data: { id: initial.id, ...payload, imageUrl: clean[0]?.imageUrl ?? null },
          })
        : adminCreateItem({ data: { kind: "building", ...payload } });
    },
    onSuccess: () => {
      toast.success(initial ? "Постройка сохранена" : "Постройка создана");
      qc.invalidateQueries({ queryKey: ["hex-editor-items", "building"] });
      onClose();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/75 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-background p-4 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-base font-bold">
            {initial ? "Постройка" : "Новая постройка"}
          </h3>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название (например, Кузница)"
          className="mb-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
        />

        <label className="mb-3 block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Что даёт достроенной
          </span>
          <select
            value={effect}
            onChange={(e) => setEffect(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Ничего — только облик</option>
            <option value="shipyard">Верфь — строит корабли (500 лайков, строителю 50)</option>
            <option value="watchtower">Обзорная вышка — открывает округу за 1 энергии</option>
            <option value="leveltree">Дерево — +1 уровень герою за ресурс</option>
            <option value="sign">Табличка — показывает надпись подошедшему</option>
            <option value="mine">
              Шахта — добывает ресурс раз в час, захват за энергию (админ)
            </option>
            <option value="field">
              Грядка — герои игроков работают на поле, добыча делится на всех
            </option>
            <option value="warehouse">Склад — 10 ячеек: 2 личные, 8 общих (обмен товарами)</option>
            <option value="market">
              Маркет — админ выставляет товары на продажу за любой ресурс
            </option>
            <option value="university">
              Университет — фишки фармят лайки (тир 1 — стройка, дальше +20% за уровень)
            </option>
            <option value="museum">
              Музей — фарм билетов с собранных коллекций (как в разделе Фишки)
            </option>
            <option value="tournament">Турнир — таблицы турниров и прошлые итоги</option>
            <option value="casino">Казино — слот «Раскопки» на золото</option>
            <option value="portal">
              Портал — переносит по сети или берёт плату за проход (дверь)
            </option>
            <option value="tavern">
              Таверна — смена героя за лайки (2-й тир: раз в сутки, 3-й: дважды)
            </option>
            <option value="boost">
              БУСТ — за плату временно добавляет герою пункты характеристики
            </option>
            <option value="town_hall">
              Ратуша — центр города: магазины привязываются к ней галочкой в своих настройках
            </option>
            <option value="spellbook">
              Столб заклинаний — школа магии, платные заклинания героя
            </option>
            <option value="oblivion">Забвение — за плату даёт эффект «Забвение»</option>
            <option value="chambers">
              Покои — за плату снимают с игрока замедление, ослабления и
              оглушение/яд у фишек
            </option>
          </select>
        </label>

        {effect === "leveltree" && (
          <TreePricesEditor prices={prices} tokens={tokens} onChange={setPrices} />
        )}
        {initial?.id && <AdminTagChecks refId={initial.id} kind="building" />}

        <div className="space-y-2">
          {tiers.map((tier, i) => (
            <BuildingTierRow
              key={i}
              index={i}
              tier={tier}
              isLast={i === tiers.length - 1}
              tokens={tokens}
              uploading={uploading === i}
              onChange={(patch) =>
                setTiers((prev) => prev.map((t, j) => (j === i ? { ...t, ...patch } : t)))
              }
              onUpload={(file) => upload(i, file)}
              onRemove={() =>
                // Постройка из одного тира — законный вариант: стоит готовой и
                // сразу работает. Раньше удаление упиралось в минимум два тира,
                // и лишний пустой тир было не убрать (а он блокировал сохранение).
                setTiers((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : prev))
              }
            />
          ))}
        </div>

        <p className="mt-2 text-[11px] text-muted-foreground">
          Один тир — постройка стоит готовой и сразу работает, улучшать её не нужно. Лишний тир
          убирается корзиной.
        </p>

        <button
          onClick={() => setTiers((prev) => [...prev, emptyTier(prev.length + 1)])}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-xs font-semibold text-muted-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Добавить тир
        </button>

        <button
          onClick={() => save.mutate()}
          disabled={save.isPending || !name.trim() || tiers.some((t) => !t.imageUrl)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Сохранить
        </button>
        {tiers.some((t) => !t.imageUrl) && (
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
            Нет картинки:{" "}
            {tiers
              .map((t, i) => (t.imageUrl ? null : t.name.trim() || `Тир ${i + 1}`))
              .filter(Boolean)
              .join(", ")}{" "}
            — загрузи или удали лишний тир
          </p>
        )}
      </div>
    </div>
  );
}
