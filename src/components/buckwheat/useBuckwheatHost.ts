// Связь окна игры (iframe с minigames/buckwheat) и сервера. Игра шлёт вызовы
// сообщениями — {bw:"call", id, method, args}; здесь они идут в ручки
// server/api/buckwheat, ответ — {bw:"reply", id, ok, data|error}. Чужие окна и
// чужие адреса не слушаем. Номер партии и счёт ходов держим здесь: игре они не нужны.
import { useLayoutEffect, useRef, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  buckwheatExit,
  buckwheatLoad,
  buckwheatMove,
  buckwheatRating,
  buckwheatStart,
  type BwInit,
} from "@/server/api/buckwheat/bwApi";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { buckwheatClientLog } from "@/server/api/buckwheat/bwApi";
import { ACC_BALANCES_KEY } from "@/lib/hooks/useAccountBalances";

type Cell = { row: number; col: number };
type Session = { id: string; count: number } | null;

function cellOf(v: unknown): Cell {
  const c = v as Partial<Cell> | null;
  if (!c || !Number.isInteger(c.row) || !Number.isInteger(c.col)) throw new Error("bw.bad_move");
  return { row: c.row as number, col: c.col as number };
}

/**
 * Ответы игре кладём ещё и в ящик окна (строкой JSON): окно игры того же адреса
 * забирает их само, если сообщение не дошло (Safari владельца, 08.11).
 */
type ReplyBox = Map<string, string>;
function replyBox(): ReplyBox {
  const w = window as Window & { __bwReplies?: ReplyBox };
  w.__bwReplies ??= new Map();
  return w.__bwReplies;
}
const ID_RE = /^[a-z0-9]{1,12}-\d{1,9}$/;
const report = (text: string) => void buckwheatClientLog({ data: { text } }).catch(() => {});

/** Окна родителя по просьбе игры: закрыть, статистика (админу). */
type Actions = { onClose: () => void; onStats: () => void };

/**
 * site link — ссылка /crown (владелец 08.11): ставка DARAI открыта, и незаконченная
 * партия сама не открывается («после подключения игра начинается сразу — нельзя»):
 * окно входа, а «Играть» продолжит её без второго входа. В игре — как было.
 */
export function useBuckwheatHost(
  frame: RefObject<HTMLIFrameElement | null>,
  actions: Actions,
  site?: "link",
): void {
  const qc = useQueryClient();
  const session = useRef<Session>(null);
  const act = useRef(actions);
  act.current = actions;

  // Слушатель — в layout-эффекте, в той же отрисовке, что создала окно игры: игра шлёт
  // «load» сразу при запуске, и с обычным эффектом (позже, отдельной задачей) первый
  // запрос терялся — окно оставалось с «Баланс 0» без строки DARAI (08.11).
  useLayoutEffect(() => {
    // Золото — ресурсы, DARAI — счёт: после ставки и выплаты перечитать оба.
    const goldChanged = () => {
      void qc.invalidateQueries({ queryKey: RESOURCES_KEY });
      void qc.invalidateQueries({ queryKey: ACC_BALANCES_KEY });
    };
    const remember = (init: BwInit) => {
      session.current = init.game ? { id: init.game.id, count: init.game.count } : null;
      return init;
    };

    async function run(method: string, args: unknown): Promise<unknown> {
      if (method === "load") {
        const init = remember(await buckwheatLoad({ data: site ? { site } : {} }));
        return site ? { ...init, game: null } : init;
      }
      if (method === "rating") return buckwheatRating();
      if (method === "start") {
        const { currency } = (args ?? {}) as { currency?: unknown };
        const data = {
          currency: currency === "darai" ? ("darai" as const) : ("gold" as const),
          ...(site ? { site } : {}),
        };
        const init = remember(await buckwheatStart({ data }));
        goldChanged();
        return init;
      }
      const s = session.current;
      if (!s) throw new Error("bw.no_game");
      if (method === "move") {
        const { a, b } = (args ?? {}) as { a?: unknown; b?: unknown };
        const [ca, cb] = [cellOf(a), cellOf(b)];
        const res = await buckwheatMove({
          data: { id: s.id, count: s.count, move: [ca.row, ca.col, cb.row, cb.col] },
        });
        session.current = res.settlement ? null : { id: s.id, count: res.count };
        if (res.settlement) goldChanged();
        return res;
      }
      if (method === "exit") {
        const res = await buckwheatExit({ data: { id: s.id, count: s.count } });
        session.current = null;
        goldChanged();
        return res;
      }
      throw new Error("bw.unknown_call");
    }

    const onMessage = (e: MessageEvent) => {
      const win = frame.current?.contentWindow;
      if (!win || e.source !== win || e.origin !== window.location.origin) return;
      const m = e.data as { bw?: unknown; id?: unknown; method?: unknown; args?: unknown } | null;
      if (m?.bw === "close") return act.current.onClose();
      if (m?.bw === "stats") return act.current.onStats();
      if (m?.bw === "diag" && typeof (m as { text?: unknown }).text === "string")
        return report(`окно: ${(m as { text: string }).text}`);
      if (m?.bw !== "call" || typeof m.id !== "string" || !ID_RE.test(m.id)) return;
      if (typeof m.method !== "string") return;
      const id = m.id;
      const reply = (ok: boolean, data?: unknown, error?: string) => {
        const text = JSON.stringify({ ok, data: data ?? null, error: error ?? null });
        const box = replyBox();
        box.set(id, text);
        // Не копим: забранные ответы окно удаляет само, остальные — старше 50.
        for (const k of box.keys()) if (box.size > 50) box.delete(k);
        try {
          win.postMessage({ bw: "reply", id, text }, window.location.origin);
        } catch (e) {
          report(`ответ ${String(m.method)} ✗ ${e instanceof Error ? e.message : String(e)}`);
        }
      };
      run(m.method, m.args).then(
        (data) => reply(true, data),
        (err: unknown) => reply(false, undefined, err instanceof Error ? err.message : "bw.error"),
      );
    };
    window.addEventListener("message", onMessage);
    // Игра уже успела спросить до нас — пусть спросит ещё раз.
    frame.current?.contentWindow?.postMessage({ bw: "refresh" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, [frame, qc, site]);
}
