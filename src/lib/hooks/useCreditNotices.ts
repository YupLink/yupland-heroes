// Новости о зачислениях: «пришло — скажи».
//
// Опрос НЕ фоновый и не по таймеру. Он случается ровно дважды: один раз при
// входе (вдруг зачислилось, пока игрока не было) и один раз через минуту после
// подписи перевода. Постоянный опрос здесь был бы ровно той нагрузкой, ради
// снятия которой всё и затевалось.
//
// Молчим, когда сказать нечего: «не получилось» игроку не показываем — сделать
// он всё равно ничего не может, а догон и крон продолжают работу сами.
import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { pollMyCredits } from "@/server/api/credit-wait-api";
import { ACC_BALANCES_KEY } from "./useAccountBalances";
import { refreshBank } from "@/components/castle-live/bank/bankKeys";

type Notice = {
  id: string;
  kind: string;
  token: string | null;
  amount: string | null;
  detail: string | null;
};

function say(n: Notice): string {
  if (n.kind === "deposit") {
    const sum = Number(n.amount ?? 0).toLocaleString("ru-RU");
    return `Зачислено ${sum} ${n.token ?? ""} на счёт`.trim();
  }
  const cnt = Number(n.amount ?? 1);
  return cnt > 1
    ? `NFT зачислены (${cnt}) — проверь в инвентаре`
    : "NFT зачислена — проверь в инвентаре";
}

export function useCreditNotices(opts?: { autoPollOnMount?: boolean }) {
  const autoPoll = opts?.autoPollOnMount ?? true;
  const qc = useQueryClient();
  // Один и тот же ключ дважды не показываем: опрос при входе и опрос по
  // таймеру могут догнать одно и то же событие.
  const shown = useRef(new Set<string>());
  const busy = useRef(false);

  const poll = useCallback(async (): Promise<{ fresh: number; waiting: number }> => {
    if (busy.current) return { fresh: 0, waiting: 0 };
    busy.current = true;
    try {
      const res = await pollMyCredits();
      let fresh = 0;
      for (const n of res.notices ?? []) {
        if (shown.current.has(n.id)) continue;
        shown.current.add(n.id);
        fresh++;
        toast.success(say(n));
      }
      if (fresh > 0) {
        qc.invalidateQueries({ queryKey: ACC_BALANCES_KEY });
        qc.invalidateQueries({ queryKey: ["acc-history"] });
        qc.invalidateQueries({ queryKey: ["my-payouts"] });
        qc.invalidateQueries({ queryKey: ["chip-inventory"] });
        // Банк (обмен), ресурсы и метка DARAI держат свой снимок счёта — без этого
        // пришедшие DARAI банк видел только после перезагрузки игры (владелец 26.10).
        void refreshBank(qc);
      }
      return { fresh, waiting: res.waiting ?? 0 };
    } catch {
      return { fresh: 0, waiting: 0 }; // молча: это фон, а не действие игрока
    } finally {
      busy.current = false;
    }
  }, [qc]);

  // Отложенные заходы: чистим на размонтировании, иначе таймер стреляет в
  // закрытое окно.
  const timers = useRef<number[]>([]);
  const pollLater = useCallback(
    (ms: number) => {
      const id = window.setTimeout(() => void poll(), ms);
      timers.current.push(id);
    },
    [poll],
  );
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((id) => window.clearTimeout(id));
  }, []);

  // Один заход при входе — за тем, что случилось без игрока. Отключается для
  // тех, кто управляет опросом сам (глобальный сторож), чтобы не бить дважды.
  useEffect(() => {
    if (autoPoll) void poll();
  }, [autoPoll, poll]);

  return { poll, pollLater };
}
