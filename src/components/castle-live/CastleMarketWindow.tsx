// Рынок замка: окно Ангелины + «Выбрать» и «Флор N» → групповая покупка одной
// транзакцией (server/api/market-batch-buy.ts). С 21.10.2026 маркет фишек снова
// открыт — за золото (владелец): цены, баланс и нехватка — в золоте; «+» у баланса
// открывает покупку золота (§8.66) — на месте прежнего «+» билетов.
import { lazy, Suspense, useState } from "react";
import { useLang } from "@/lib/i18n";
import { newOpId } from "@/lib/opId";
import { buyMarketListings } from "@/server/api/market-batch-buy";
import { CastleMarketScreen } from "@/components/chips/castle-market/CastleMarketScreen";

const MAX_LOTS = 500;
const GoldBuyDialog = lazy(() =>
  import("./gold-buy/GoldBuyDialog").then((m) => ({ default: m.GoldBuyDialog })),
);

export function CastleMarketWindow({ onOpenShop }: { onOpenShop?: () => void }) {
  const ru = useLang() === "ru";
  const [goldOpen, setGoldOpen] = useState(false);
  const money = (n: number) => n.toLocaleString(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 2 });

  // Частичный успех — не общий отказ: купленное остаётся купленным, а про
  // остальное сказано, почему (ошибка уходит в строку уведомления рынка).
  const batchPurchase = async (ids: string[], total: number) => {
    if (ids.length > MAX_LOTS) throw new Error(ru ? `Не больше ${MAX_LOTS} фишек за раз.` : `Up to ${MAX_LOTS} chips at once.`);
    const { results, spent } = await buyMarketListings({ data: { listingIds: ids, expectedTotal: total, opId: newOpId() } });
    const done = results.filter((r) => r.status !== "failed").length;
    const failed = results.filter((r) => r.status === "failed");
    if (!failed.length) return { count: done, total: spent };
    const gone = failed.filter((r) => r.reason === "gone").length;
    const other = failed.find((r) => r.reason !== "gone" && r.reason !== "own");
    const head = ru
      ? `Куплено ${done} из ${results.length} за ${money(spent)} золота.`
      : `Bought ${done} of ${results.length} for ${money(spent)} gold.`;
    const why = gone
      ? ru ? ` Уже купили другие: ${gone}.` : ` Already sold: ${gone}.`
      : other?.status === "failed" ? ` ${other.reason}` : "";
    throw new Error(head + why);
  };

  return (
    <>
      <CastleMarketScreen batchPurchase={batchPurchase} onOpenShop={onOpenShop} onBuyGold={() => setGoldOpen(true)} />
      {goldOpen && (
        <Suspense fallback={null}>
          <GoldBuyDialog
            open
            aboveMarket
            ru={ru}
            onClose={() => setGoldOpen(false)}
            returnFocus={() =>
              requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-gold-topup]")?.focus())
            }
          />
        </Suspense>
      )}
    </>
  );
}
