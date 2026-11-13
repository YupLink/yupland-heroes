// Форма одной позиции маркета (админ): тип, название, картинка, что и сколько
// в сделке, цена в любой валюте, запас. Сохраняет в raid_market_item.
//
// Поля одни и те же на обеих витринах, меняется только чтение:
//   side='buy'  — «товар» игрок получает, «цену» платит;
//   side='sell' — «товар» игрок отдаёт, «цену» получает.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { upsertMarketItem, deleteMarketItem } from "@/server/api/beta-raid/market-admin";
import { listRewardTokens } from "@/server/api/admin-payouts";
import { withoutUsdt } from "@/lib/usdtBanned";
import {
  RESOURCE_LABELS_RU,
  emptyMarketItem,
  normalizeGiveAmount,
  type MarketDraft,
  type MarketItem,
  type MarketSide,
} from "@/lib/marketItem";
import { recipeHasPrize, type RecipeOutcome } from "@/lib/marketRecipe";
import { useBuildingShop } from "@/components/beta-raid/building-sale/buildingShopContext";
import { invalidateMarketCell } from "./invalidateMarket";
import { MarketGoodFields } from "./MarketGoodFields";
import { MarketPriceFields } from "./MarketPriceFields";
import { MarketExtraFields } from "./MarketExtraFields";
import { MarketPriceMoreFields } from "./MarketPriceMoreFields";
import { needsPriceToken } from "@/lib/marketPrices";

type Draft = MarketDraft;

export function MarketItemForm({
  initial,
  side,
  q,
  r,
  onSaved,
}: {
  initial: MarketItem | null;
  /** Витрина, в которую кладём позицию: покупка игрока или скупка магазином. */
  side: MarketSide;
  q: number;
  r: number;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  // Количество правим прямо на входе: позиции, которым дробь досталась от
  // прежнего типа товара, чинятся первым же сохранением — редактировать это
  // поле у пака/арта нечем, а сервер такую сделку не проводит.
  // В лавке построек новая позиция сразу — постройка (другого там не продают).
  const buildingShop = useBuildingShop();
  const [draft, setDraft] = useState<Draft>(() => {
    const empty = emptyMarketItem(q, r, side);
    const base =
      initial ??
      (buildingShop
        ? {
            ...empty,
            kind: "building" as const,
            refId: null,
            building: { skinId: null, config: null },
          }
        : empty);
    return { ...base, giveAmount: normalizeGiveAmount(base.kind, base.giveAmount) };
  });
  const isSell = side === "sell";
  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const tokensQ = useQuery({ queryKey: ["reward-tokens"], queryFn: () => listRewardTokens() });
  const tokens = (tokensQ.data ?? []).map((x: { symbol: string }) => x.symbol);
  // Что ВЫДАЁМ игроку (товар покупки, выплата скупки) — без USDT, ПРАВИЛА §8.49а.
  const safe = withoutUsdt(tokens);
  const isRes = draft.kind === "resource";
  const isCustom = draft.kind === "custom";
  const isRecipe = draft.kind === "recipe";

  const save = useMutation({
    mutationFn: () =>
      upsertMarketItem({
        data: {
          id: draft.id,
          q,
          r,
          pos: (initial as MarketItem | null)?.pos ?? 0,
          side,
          kind: draft.kind,
          refId: draft.refId,
          giveAmount: draft.giveAmount,
          giveToken: draft.giveToken,
          // Имя: своя подпись, если задана (можно «Продать Дерево»); у ресурса
          // без подписи — подпись ресурса; у шаблонных — имя шаблона.
          name:
            draft.name.trim() ||
            (isRes
              ? (RESOURCE_LABELS_RU[(draft.refId ?? "gold") as keyof typeof RESOURCE_LABELS_RU] ??
                "Ресурс")
              : draft.name),
          image: draft.image,
          priceResource: draft.priceResource,
          priceToken: draft.priceToken,
          priceAmount: draft.priceAmount,
          price2Resource: draft.price2Resource,
          price2Token: draft.price2Token,
          price2Amount: draft.price2Amount,
          stock: draft.stock,
          perAccountLimit: isSell ? null : draft.perAccountLimit,
          // Фильтр покупателей теперь на весь магазин (raid_market_shop), не тут.
          buyerMode: "all",
          buyerRaces: [],
          buyerSpecs: [],
          outcomes: isRecipe ? (draft.outcomes ?? []) : null,
          // Постройка: облик и настройка — как у постройки на карте.
          building: draft.kind === "building" ? (draft.building ?? null) : null,
          // Ещё ингредиенты — только у покупки и только после второй цены.
          priceMore: isSell || !draft.price2Resource ? [] : (draft.priceMore ?? []),
        },
      }),
    onSuccess: () => {
      toast.success(isSell ? "Приём товара сохранён" : "Товар сохранён");
      // Новая цена должна доехать и до витрины покупателя, а не только до
      // списка админа: у самого админа окно лавки закрыто, и без этого он
      // открывал её со старой ценой из суточного кэша.
      invalidateMarketCell(qc, q, r);
      onSaved();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const del = useMutation({
    mutationFn: () => deleteMarketItem({ data: { id: draft.id! } }),
    onSuccess: () => {
      invalidateMarketCell(qc, q, r);
      onSaved();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  // Вторая цена, если включена, должна быть заполнена целиком (сумма + токен).
  const price2Ok =
    draft.price2Resource == null ||
    ((draft.price2Amount ?? 0) > 0 && (draft.price2Resource !== "token" || !!draft.price2Token));

  const canSave =
    // Имя вводят только у кастомного; ресурсу оно = подпись ресурса, шаблонным
    // (пак/герой/арт/босс) = имя шаблона (refId ниже гарантирует, что выбран).
    (!(isCustom || isRecipe) || draft.name.trim().length > 0) &&
    draft.priceAmount > 0 &&
    (draft.priceResource !== "token" || !!draft.priceToken) &&
    // Предметная цена (пак/герой/арт/босс/кастом) — тоже нужен выбранный шаблон.
    (!["pack", "hero", "art", "boss", "custom"].includes(draft.priceResource) ||
      !!draft.priceToken) &&
    price2Ok &&
    // Ещё ингредиенты: у каждого сумма и выбранный шаблон/токен.
    (draft.priceMore ?? []).every(
      (l) => l.amount > 0 && (!needsPriceToken(l.resource) || !!l.token),
    ) &&
    // Количество нужно любому типу, даже когда поля для него нет: у предметных
    // оно обязано быть целой штукой, иначе сервер откажет уже на покупке.
    draft.giveAmount === normalizeGiveAmount(draft.kind, draft.giveAmount) &&
    (!isRes ||
      (draft.refId && draft.giveAmount > 0 && (draft.refId !== "token" || !!draft.giveToken))) &&
    // custom теперь тоже ссылается на шаблон (refId) — как пак/герой/босс.
    (isRes || isRecipe || !!draft.refId) &&
    // Рецепт: хоть один приз и у каждого — количество.
    (!isRecipe || recipeReady(draft.outcomes ?? []));

  return (
    <div className="space-y-2 rounded-xl border border-gold/30 bg-gold/5 p-2.5">
      {isSell && (
        <p className="rounded-lg border border-border bg-background/40 px-2 py-1.5 text-[10px] leading-tight text-muted-foreground">
          Скупка: игрок ОТДАЁТ этот товар и ПОЛУЧАЕТ цену. Запас — сколько всего примем.
        </p>
      )}
      <MarketGoodFields draft={draft} set={set} tokens={isSell ? tokens : safe} sell={isSell} />

      <MarketPriceFields
        sell={isSell}
        priceResource={draft.priceResource}
        priceAmount={draft.priceAmount}
        priceToken={draft.priceToken}
        tokens={isSell ? safe : tokens}
        onResource={(v) => set({ priceResource: v })}
        onAmount={(v) => set({ priceAmount: v })}
        onToken={(v) => set({ priceToken: v })}
      />

      <MarketExtraFields
        sell={isSell}
        stock={draft.stock}
        onStock={(v) => set({ stock: v })}
        limit={draft.perAccountLimit ?? null}
        onLimit={(v) => set({ perAccountLimit: v })}
        price2Resource={draft.price2Resource}
        price2Amount={draft.price2Amount}
        price2Token={draft.price2Token}
        tokens={isSell ? safe : tokens}
        onToggle2={(on) =>
          set(
            on
              ? { price2Resource: "diamonds", price2Amount: 1, price2Token: null }
              : { price2Resource: null, price2Amount: null, price2Token: null, priceMore: [] },
          )
        }
        onPrice2Resource={(v) => set({ price2Resource: v })}
        onPrice2Amount={(v) => set({ price2Amount: v })}
        onPrice2Token={(v) => set({ price2Token: v })}
      />

      {!isSell && draft.price2Resource != null && (
        <MarketPriceMoreFields
          lines={draft.priceMore ?? []}
          tokens={tokens}
          onChange={(v) => set({ priceMore: v })}
        />
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={!canSave || save.isPending}
          className="flex flex-1 items-center justify-center gap-1 rounded-xl gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50"
        >
          {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {isSell ? "Сохранить приём" : "Сохранить товар"}
        </button>
        {draft.id && (
          <button
            type="button"
            onClick={() => del.mutate()}
            disabled={del.isPending}
            className="flex items-center justify-center gap-1 rounded-xl border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

const recipeReady = (list: readonly RecipeOutcome[]): boolean =>
  recipeHasPrize(list) && list.every((o) => o.kind === "none" || o.amount > 0);
