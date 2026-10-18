// Проведение корзины маркета: обойти строки, свести итог, обновить всё, что
// могло измениться. Вынесено из MarketAction ради лимита ≤250 строк — там
// остался экран, здесь сделка.
//
// Строки идут ПО ОЧЕРЕДИ: каждая позиция — свой атомарный server-fn (деньги →
// товар → откат при сбое), и остаток с балансом считаются честно позиция за
// позицией. Упавшая строка не рвёт остальные: её причину кладём в общий тост.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { serverErrorText } from "@/lib/serverErrorText";
import { useT } from "@/lib/i18n";
import { buyMarketItem } from "@/server/api/beta-raid/market-buy";
import { sellMarketItem } from "@/server/api/beta-raid/market-sell";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { ACC_BALANCES_KEY } from "@/lib/hooks/useAccountBalances";
import type { MarketSide } from "@/lib/marketItem";
import type { CartLine } from "./cartCost";
import { SELLABLE_ARTS_KEY, type ArtChoice } from "./MarketArtPick";
import { numText } from "./num";
import { cityCartTotals } from "./townQuote";

export function useMarketCheckout(opts: {
  q: number;
  r: number;
  side: MarketSide;
  lines: CartLine[];
  /** Выбранный артефакт по позиции скупки «любой арт редкости X». */
  picks: Record<string, ArtChoice>;
  /** Очистить корзину после успеха. */
  reset: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();

  const invalidateAll = () => {
    // ВСЕ инвалидации с refetchType:'all'. HUD-панель ресурсов и балансов
    // может быть перекрыта модалкой маркета — если у query нет активного
    // подписчика, дефолтный invalidate не рефетчит, и панель остаётся на
    // старом числе до перезагрузки (правило «обновление страницы = табу»).
    for (const key of [
      ["beta-raid-building", opts.q, opts.r],
      ["beta-raid-state"],
      ENERGY_KEY,
      RESOURCES_KEY,
      ["my-like-balance"],
      ["my-tickets"],
      ACC_BALANCES_KEY,
      // Проданное/купленное могло лечь в паки/инвентарь/рюкзак — обновляем разом.
      ["my-chip-packs"],
      ["my-chip-pack-grants"],
      ["my-pack-inventory"],
      ["my-game-items"],
      ["my-hero-backpack"],
      // Окно склада держит свою копию рюкзака.
      ["beta-warehouse"],
      // Список «что можно сдать»: проданный артефакт больше не свободен.
      SELLABLE_ARTS_KEY,
    ]) {
      qc.invalidateQueries({ queryKey: key as readonly unknown[], refetchType: "all" });
    }
  };

  return useMutation({
    mutationFn: async () => {
      const failed: string[] = [];
      let done = 0;
      const city = cityCartTotals(opts.lines);
      for (const l of opts.lines) {
        // pick едет только у позиций «любой арт редкости X»; у остальных его
        // нет, и сервер сам знает, что списывать. Форма одна на обе витрины:
        // в скупке артефакт — товар, в покупке — цена, но выбирает игрок и там,
        // и там, иначе сервер забрал бы самый старый свободный.
        const pick = opts.picks[l.it.id];
        // Лавка города: показанная сумма — сервер сверит, не сдвинулась ли цена.
        const expect = city.get(l.it.id);
        const data = {
          q: opts.q,
          r: opts.r,
          itemId: l.it.id,
          qty: l.qty,
          ...(pick ? { pick: { templateId: pick.templateId } } : {}),
          ...(expect != null ? { expect } : {}),
        };
        try {
          if (l.it.side === "sell") {
            await sellMarketItem({ data });
          } else {
            await buyMarketItem({ data });
          }
          done += l.qty;
        } catch (e) {
          // Через serverErrorText, а не «начинается с market. → t(msg)»: ключи с
          // числами («market.backpack_need:1:0») в словаре не лежат, t() отдавал
          // их обратно как есть, и игрок читал в тосте голый ключ вместо
          // «нужно N ячеек, свободно M». serverErrorText сам разбирает и ключ, и
          // ключ с числами, и обычную фразу сервера.
          failed.push(`${l.it.name}: ${serverErrorText(e, t)}`);
        }
      }
      return { done, failed };
    },
    onSuccess: ({ done, failed }) => {
      if (done > 0)
        toast.success(
          t(opts.side === "sell" ? "market.cart_sold" : "market.cart_done", { n: numText(done) }),
        );
      if (failed.length) toast.error(failed.join("\n"));
      invalidateAll();
      opts.reset();
      opts.onDone();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
}
