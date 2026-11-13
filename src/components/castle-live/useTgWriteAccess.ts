// «Разрешить боту писать» (владелец 04.11.2026, §8.106): игроку, которому
// игровой бот не смог написать (не запускал или заблокировал — server/tgReach),
// мини-апка один раз показывает родное окно Telegram. «Разрешить» — письма
// пойдут; «нет» — больше не спрашиваем. Вне Telegram и в старом клиенте — ничего.
import { useEffect } from "react";
import { doneTgWriteAsk, getTgWriteAsk } from "@/server/api/tg-write-access";

type WriteApi = {
  initData?: string;
  isVersionAtLeast?: (v: string) => boolean;
  requestWriteAccess?: (cb?: (allowed: boolean) => void) => void;
};

/** Пауза после входа: окно Telegram — не поверх заставки. */
const ASK_AFTER_MS = 3_000;

export function useTgWriteAccess(): void {
  useEffect(() => {
    const wa = (window as unknown as { Telegram?: { WebApp?: WriteApi } }).Telegram?.WebApp;
    if (!wa?.initData || typeof wa.requestWriteAccess !== "function") return;
    if (wa.isVersionAtLeast && !wa.isVersionAtLeast("6.9")) return;
    let off = false;
    const timer = setTimeout(() => {
      void getTgWriteAsk()
        .then((r) => {
          if (off || !r.ask) return;
          wa.requestWriteAccess?.((allowed) => {
            void doneTgWriteAsk({ data: { allowed: allowed === true } }).catch(() => {});
          });
        })
        .catch(() => {});
    }, ASK_AFTER_MS);
    return () => {
      off = true;
      clearTimeout(timer);
    };
  }, []);
}
