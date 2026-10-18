// Рынок замка: окно Ангелины + «+» у баланса билетов (окно покупки билетов)
// + «Выбрать» и «Флор N» → групповая покупка одной транзакцией
// (server/api/market-batch-buy.ts). У игроков
// прежний MarketScreen — и «+», и выбор живут только здесь.
import { Suspense, lazy, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSession } from "@/server/api/user-auth";
import { buyMarketListings } from "@/server/api/market-batch-buy";
import { isWalletLinked } from "@/lib/walletLinked";
import { useLang } from "@/lib/i18n";
import { newOpId } from "@/lib/opId";
import { TICKETS_KEY } from "@/lib/hooks/useTickets";
import { CastleMarketScreen } from "@/components/chips/castle-market/CastleMarketScreen";

const TicketPurchaseLive = lazy(() =>
  import("@/components/chips/trading-house/TicketPurchaseLive").then((m) => ({ default: m.TicketPurchaseLive })),
);
const MAX_LOTS = 500;

export function CastleMarketWindow({ onOpenShop }: { onOpenShop?: () => void }) {
  const ru = useLang() === "ru";
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const [buy, setBuy] = useState(false);
  const close = () => {
    setBuy(false);
    void qc.invalidateQueries({ queryKey: TICKETS_KEY, refetchType: "all" });
  };
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
      ? `Куплено ${done} из ${results.length} за ${money(spent)} билетов.`
      : `Bought ${done} of ${results.length} for ${money(spent)} tickets.`;
    const why = gone
      ? ru ? ` Уже купили другие: ${gone}.` : ` Already sold: ${gone}.`
      : other?.status === "failed" ? ` ${other.reason}` : "";
    throw new Error(head + why);
  };

  return (
    <>
      <CastleMarketScreen onBuyTickets={() => setBuy(true)} batchPurchase={batchPurchase} onOpenShop={onOpenShop} />
      {buy && (
        <Suspense fallback={null}>
          <TicketPurchaseLive
            open
            walletConnected={isWalletLinked(session.data?.wallet)}
            accountOpen={session.data?.accountOpen === true}
            onClose={close}
            returnFocus={() =>
              requestAnimationFrame(() => document.querySelector<HTMLElement>(".market-preview__balance-add")?.focus())
            }
          />
        </Suspense>
      )}
    </>
  );
}
