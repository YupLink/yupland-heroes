// Хук слота на золото: ходы уходят на сервер (slotAct), экран рисует ответ.
// Сам браузер ничего не разыгрывает — только анимация барабанов, выбор линий и
// ставки, автокрутка и паузы показа (ловушка, клад, удвоение). Гость (не вошёл) —
// холостая игра в браузере на игрушечные кредиты (demoSlot), на сервер ходы не идут.
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { slotAct, type SlotView } from "@/server/api/slot/slot-api";
import { BET_OPTIONS, MAX_BET, MAX_LINES, totalBet } from "./bets";
import { reachedShore } from "./bonus";
import { initialSlotState, type SlotState } from "./state";
import { reelTiming } from "./timing";
import type { ClientAction } from "./serverStep";
import { SLOT_FRESH_MS, SLOT_KEY } from "./prefetchSlot";
import { loadSlot } from "./loadSlot";
import type { DemoSlot } from "./demoSlot";

export { SLOT_KEY };

/** Сколько показывать линии после переключения. */
const SHOW_LINES_MS = 1200;
/** Пауза автокрутки между спинами. */
const AUTO_GAP_MS = 700;

export type UiAction =
  | ClientAction
  | { type: "set-lines"; lines: number }
  | { type: "next-bet" }
  | { type: "max-bet" }
  | { type: "toggle-auto" };

type Anim = { state: SlotState };

export function useSlotGame({
  manualPresentation = false,
}: { manualPresentation?: boolean } = {}) {
  const t = useT();
  const qc = useQueryClient();
  // Золото меняется и вне автомата (продал алмазы, купил в лавке) — при каждом
  // открытии перечитываем. Предзагрузка из окна постройки (prefetchSlot) делает
  // это заранее, так что экран открывается сразу со свежим счётом.
  const demo = useRef<DemoSlot | null>(null);
  const q = useQuery({
    queryKey: SLOT_KEY,
    queryFn: () => loadSlot(demo),
    staleTime: SLOT_FRESH_MS,
    refetchOnMount: true,
    // Закрытое казино (вход через Google) повтором не откроется.
    retry: (n, e) => n < 1 && !String((e as Error)?.message ?? e).includes("slot.google"),
  });
  const view = q.data;
  const [lines, setLines] = useState(9);
  const [bet, setBet] = useState(1);
  const [auto, setAuto] = useState(false);
  const [anim, setAnim] = useState<Anim | null>(null);
  const [showLines, setShowLines] = useState(false);
  const busy = useRef(false);
  const [acting, setActing] = useState(false);
  const spinTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(spinTimer.current), []);
  const inited = useRef(false);
  const viewRef = useRef<SlotView | undefined>(view);
  viewRef.current = view;

  useEffect(() => {
    if (!view || inited.current) return;
    inited.current = true;
    setLines(view.state.lines);
    setBet(view.state.bet);
  }, [view]);

  const fail = useCallback(
    (e: unknown) => {
      const msg = String((e as Error)?.message ?? e);
      toast.error(msg.startsWith("slot.") ? t(msg) : msg);
      setAuto(false);
      void q.refetch();
    },
    [t, q],
  );

  /** Отправить ход. Пока ответа нет — следующий не уходит (двойной тап). */
  const send = useCallback(
    async (action: ClientAction): Promise<SlotView | null> => {
      const cur = viewRef.current;
      if (busy.current || !cur) return null;
      busy.current = true;
      setActing(true);
      try {
        const res = demo.current
          ? demo.current.act(action)
          : await slotAct({ data: { action, version: cur.version } });
        qc.setQueryData(SLOT_KEY, res);
        viewRef.current = res;
        void qc.invalidateQueries({ queryKey: ["my-resources"] });
        return res;
      } catch (e) {
        fail(e);
        return null;
      } finally {
        busy.current = false;
        setActing(false);
      }
    },
    [qc, fail],
  );

  const spin = useCallback(async () => {
    const cur = viewRef.current;
    if (!cur || anim || busy.current) return;
    const stake = totalBet(lines, bet);
    const before: SlotState = {
      ...cur.state,
      lines,
      bet,
      phase: "spinning",
      spinId: cur.state.spinId + 1,
      result: null,
      lastWin: 0,
      balance: cur.gold - stake,
    };
    setShowLines(false);
    setAnim({ state: before });
    const res = await send({ type: "spin", lines, bet });
    if (!res || !res.state.result) {
      setAnim(null);
      return;
    }
    // Барабаны получили итог — крутятся до своих остановок, потом экран ответа.
    setAnim({ state: { ...before, result: res.state.result } });
    spinTimer.current = window.setTimeout(
      () => setAnim(null),
      reelTiming(res.state.result.grid).total,
    );
  }, [anim, lines, bet, send]);

  const dispatch = useCallback(
    (a: UiAction) => {
      if (a.type === "set-lines")
        return setLines(Math.max(1, Math.min(MAX_LINES, a.lines)));
      if (a.type === "next-bet") {
        const i = BET_OPTIONS.indexOf(bet as (typeof BET_OPTIONS)[number]);
        return setBet(BET_OPTIONS[(i + 1) % BET_OPTIONS.length]);
      }
      if (a.type === "max-bet") {
        setLines(MAX_LINES);
        return setBet(MAX_BET);
      }
      if (a.type === "toggle-auto") return setAuto((v) => !v);
      void send(a);
    },
    [bet, send],
  );

  const base = view?.state ?? initialSlotState(0);
  const state: SlotState = anim
    ? { ...anim.state, auto }
    : { ...base, lines, bet, auto };
  const phase = state.phase;

  // Паузы показа: ловушка и конец супер-бонуса, путь пройден, переигровка ничьей.
  // После выигрыша удвоения новую карту не сдаём сами: игрок жмёт «Забрать» или «Удвоить».
  useEffect(() => {
    if (anim || manualPresentation) return;
    let next: ClientAction | null = null;
    let ms = 0;
    if (
      (phase === "bonus" && base.bonus?.fell) ||
      (phase === "super" && base.superGame?.done)
    ) {
      next = { type: "bonus-close" };
      ms = 1800;
    } else if (phase === "bonus" && base.bonus && reachedShore(base.bonus)) {
      next = { type: "super-enter" };
      ms = 1300;
    } else if (
      phase === "risk" &&
      base.risk &&
      base.risk.picked !== null &&
      !base.risk.done &&
      base.risk.outcome !== "lose"
    ) {
      // Выиграл или ничья: карты видны 1,5 с, потом новая раздача (владелец, 17.10).
      next = { type: "risk-next" };
      ms = 1500;
    }
    if (!next) return;
    const action = next;
    const id = window.setTimeout(() => void send(action), ms);
    return () => window.clearTimeout(id);
  }, [
    anim,
    manualPresentation,
    phase,
    base.bonus,
    base.superGame,
    base.risk,
    send,
  ]);

  // Бонус выпал — автокрутка выключается: бонус игрок играет сам.
  useEffect(() => {
    if (phase === "bonus-won") setAuto(false);
  }, [phase]);

  // Автокрутка: пауза, затем спин, пока хватает золота.
  useEffect(() => {
    if (!auto || anim || (phase !== "idle" && phase !== "won")) return;
    if ((view?.gold ?? 0) < totalBet(lines, bet)) {
      setAuto(false);
      return;
    }
    const id = window.setTimeout(
      () => void spin(),
      phase === "won" ? AUTO_GAP_MS + 500 : AUTO_GAP_MS,
    );
    return () => window.clearTimeout(id);
  }, [auto, anim, phase, view?.gold, view?.version, lines, bet, spin]);

  // Переключили линии — показать их на окне.
  useEffect(() => {
    if (!inited.current) return;
    setShowLines(true);
    const id = window.setTimeout(() => setShowLines(false), SHOW_LINES_MS);
    return () => window.clearTimeout(id);
  }, [lines]);

  const risk = useCallback(() => void send({ type: "risk-start" }), [send]);
  const superNext = useCallback(
    () => void send({ type: "super-next" }),
    [send],
  );

  return {
    state,
    act: send,
    acting,
    retry: q.refetch,
    gold: anim ? anim.state.balance : (view?.gold ?? 0),
    dispatch,
    spin,
    risk,
    superNext,
    showLines,
    loading: q.isPending,
    error: q.isError ? String((q.error as Error)?.message ?? "") : null,
  };
}
