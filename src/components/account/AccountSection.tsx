import { isCastleToken } from "@/lib/castleTokenScope";
// Ресурсный счёт игрока — на экране «Кошелёк», рядом с самим кошельком.
//
// На экране только список валют: пополнение и вывод открываются окном по
// клику на нужной валюте. Формы под списком не висят — на телефоне до них
// приходилось прокручивать полэкрана, а нужны они по одной за раз.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, Coins, Loader2, Star } from "lucide-react";
import { getAccountDepositInfo } from "@/server/api/currency/deposit";
import { useAccountEnabled } from "@/lib/hooks/useAccountBalances";
import { AccountBalances } from "./AccountBalances";
import { AccountModal } from "./AccountModal";
import { AccountTopUp } from "./AccountTopUp";
import { StarsTopUp } from "./StarsTopUp";
import { AccountWithdraw } from "./AccountWithdraw";
import { AccountHistory } from "./AccountHistory";

export function AccountSection({ castleScope = false }: { castleScope?: boolean } = {}) {
  const enabled = useAccountEnabled();
  const [topUp, setTopUp] = useState<string | null>(null);
  const [withdraw, setWithdraw] = useState<string | null>(null);

  const info = useQuery({
    // Ключ с версией: форма ответа поменялась, а старый лежит у игрока в
    // localStorage сутки. Новый ключ — старый ответ не подхватится.
    queryKey: ["acc-deposit-info", "v2"],
    queryFn: () => getAccountDepositInfo(),
    enabled,
    staleTime: 5 * 60_000,
  });

  const tokens = info.data?.tokens.filter((t) => !castleScope || isCastleToken(t.symbol)) ?? [];

  // Кому механика не открыта — не видит ни блока, ни его следов.
  if (!enabled) return null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Coins className="h-5 w-5 text-gold" />
        <h2 className="font-display text-lg font-bold">Счёт</h2>
        <span className="text-[11px] text-muted-foreground">
          токены внутри игры: сюда кладёшь, отсюда платишь
        </span>
      </div>

      {info.isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {info.data && (
        <>
          <AccountBalances tokens={tokens} onTopUp={setTopUp} onWithdraw={setWithdraw} />

          <details className="rounded-2xl border border-border/60 bg-card/40">
            <summary className="cursor-pointer px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              История движений
            </summary>
            <div className="px-3 pb-3">
              <AccountHistory castleScope={castleScope} />
            </div>
          </details>

          {topUp === "STARS" && (
            <AccountModal
              title="Пополнить звёздами"
              icon={<Star className="h-4 w-4 fill-sky-300 text-sky-300" />}
              onClose={() => setTopUp(null)}
            >
              <StarsTopUp />
            </AccountModal>
          )}

          {topUp && topUp !== "STARS" && (
            <AccountModal
              title={`Пополнить ${topUp}`}
              icon={<ArrowDownToLine className="h-4 w-4 text-gold" />}
              onClose={() => setTopUp(null)}
            >
              <AccountTopUp tokens={tokens} receiverId={info.data.receiverId} symbol={topUp} />
            </AccountModal>
          )}

          {withdraw && (
            <AccountModal
              title={`Вывести ${withdraw}`}
              icon={<ArrowUpFromLine className="h-4 w-4 text-gold" />}
              onClose={() => setWithdraw(null)}
            >
              <AccountWithdraw tokens={tokens} wallets={info.data.wallets} symbol={withdraw} />
            </AccountModal>
          )}
        </>
      )}
    </section>
  );
}
