// Открыта ли оплата картой этому аккаунту (§8.127) — тот же запрос, что у CardPayRow.
import { useQuery } from "@tanstack/react-query";
import { getCardPay } from "@/server/api/xsolla/xsollaPay";

export function useCardPayOn(): boolean {
  const q = useQuery({ queryKey: ["card-pay"], queryFn: () => getCardPay(), staleTime: 5 * 60_000 });
  return q.data?.on === true;
}
