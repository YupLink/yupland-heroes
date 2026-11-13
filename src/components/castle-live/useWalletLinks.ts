// Есть ли у игрока хоть один подключённый кошелёк — NEAR, Solana или Ethereum
// (владелец, 09.11.2026: «в профиле убери все возможности подключить кошелёк; если
// кошелёк был подключён — оставляем, у тех, у кого кош есть, — можно увидеть свои
// кошельки, новые подключить можно»). Ключи запросов — те же, что у блоков Казны
// (TreasurySolanaConnection, TreasuryEthConnection): ответ один на всех.
import { useQuery } from "@tanstack/react-query";
import { getSession } from "@/server/api/user-auth";
import { solanaStatus } from "@/server/api/solana";
import { ethHovStatus } from "@/server/api/eth";

type Session = { features?: Record<string, boolean>; isAdmin?: boolean } | undefined;

/** any — кошелёк есть; ready — все проверки ответили (до того кнопок не показываем). */
export function useWalletLinks(nearLinked: boolean): { any: boolean; ready: boolean } {
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const s = session.data as Session;
  const solanaOn = !!s?.features?.solana_connect;
  const admin = s?.isAdmin === true;
  const sol = useQuery({
    queryKey: ["solana-status"],
    queryFn: () => solanaStatus(),
    enabled: solanaOn,
  });
  const eth = useQuery({ queryKey: ["eth-hov-status"], queryFn: () => ethHovStatus(), enabled: admin });
  const any = nearLinked || !!sol.data?.address || !!eth.data?.address;
  const ready =
    !session.isPending && (!solanaOn || !sol.isPending) && (!admin || !eth.isPending);
  return { any, ready };
}
