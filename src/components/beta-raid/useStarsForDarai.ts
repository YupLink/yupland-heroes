// Ставит подмену «DARAI → звёзды» для окон карты (lib/starsForDarai.ts):
// только звездочнику (вход через Telegram, tg<id>) и только когда DARAI на
// счёте меньше цены. Курс — тот же кэш Ref, что у сервера. У Google-игрока
// кошелёк тоже tg<id>, но звёзд нет (§8.127) — решает настоящий Telegram.
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSession } from "@/server/api/user-auth";
import { getDaraiRate } from "@/server/api/darai-rate";
import { useAccountBalances } from "@/lib/hooks/useAccountBalances";
import { isWalletLinked } from "@/lib/walletLinked";
import { pricesFromDarai } from "@/lib/usdTariff";
import { setStarsForDarai } from "@/lib/starsForDarai";
import { starsAllowed } from "@/lib/auth/entryRules";

export function useStarsForDarai(): void {
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const wallet = session.data?.wallet ?? null;
  const star = !!wallet && !isWalletLinked(wallet) && starsAllowed(session.data?.telegramId);
  const rate = useQuery({
    queryKey: ["darai-rate"],
    queryFn: () => getDaraiRate(),
    staleTime: 5 * 60_000,
    enabled: star,
  }).data?.daraiPerUsd ?? null;
  const balances = useAccountBalances().data?.balances;
  const darai = balances ? (balances.find((b) => b.token === "Darai")?.balance ?? 0) : null;
  useEffect(() => {
    if (!star || !rate || darai == null) {
      setStarsForDarai(null);
      return;
    }
    setStarsForDarai((amount) => (darai >= amount ? null : (pricesFromDarai(amount, rate)?.STARS ?? null)));
    return () => setStarsForDarai(null);
  }, [star, rate, darai]);
}
