// Синхронизация тумана войны между устройствами одного аккаунта.
//
// Локальная память остаётся кэшем: карта рисуется мгновенно, без ожидания
// сети. Сервер — источник правды: то, что открыто с телефона, видно и с
// компьютера. Новые клетки уходят пачкой, а не по одной на каждый шаг.
import { useEffect, useRef } from "react";
import { getBetaRaidFog } from "@/server/api/beta-raid/fog";
import { FogMask, type FogView } from "./fogMask";
import { pushFog } from "./fogPush";
import { serverForgot } from "./fogGuards";
import { fromBase64, loadPushedBits, orderOf, savePushedBits, sinceKey } from "./fogStorage";
import { noteFogPulled } from "@/components/game/settleSignals";

/** Пауза перед отправкой: за один поход открывается сразу много клеток. */
const PUSH_DELAY_MS = 1500;

/**
 * Как часто переспрашивать разведанное у сервера.
 *
 * Раньше его читали ОДИН раз за сессию: открыл карту на компьютере, походил с
 * телефона — и на компьютере те зоны так и оставались тёмными до перезагрузки
 * страницы. Отсюда «на другом устройстве туман не открывался».
 */
const PULL_EVERY_MS = 45_000;

/**
 * Недостача, с которой память устройства считается отставшей: сервер знает
 * настолько больше клеток, чем мы, — метка since уехала вперёд без битов
 * (сбой записи localStorage, смена аккаунта на одном устройстве). Тогда метку
 * снимаем и перечитываем всё. Не чаще раза в 10 минут — от петли.
 */
const RESYNC_GAP = 50;
const RESYNC_EVERY_MS = 10 * 60_000;

export function useFogSync(opts: {
  mapId: string | null;
  /** Маска разведанного с версией (null — карта ещё не загружена). */
  seen: FogView | null;
  /** Влить пришедшее с сервера в локальную память: ключами или битами. */
  merge: (cells: string[] | Uint8Array) => void;
  /** Забыть разведанное этой карты на устройстве и начать с чистого листа. */
  reset: () => void;
}) {
  const { mapId, seen, merge } = opts;
  const resetRef = useRef(opts.reset);
  resetRef.current = opts.reset;
  // Что сервер уже знает — такой же битовой маской, как разведанное. Стартуем
  // с локальной памяти: она и есть то, что уже отправлялось в прошлые заходы.
  // Раньше набор стартовал пустым, и при каждом входе всё разведанное (у
  // лидера 78k клеток, 40 запросов по 2000) летело на сервер заново.
  const pushed = useRef<FogMask | null>(null);
  const seeded = useRef<string | null>(null);
  /** Позиция в журнале маски: свежее — только то, что после неё. */
  const cursor = useRef(0);
  const lastMask = useRef<FogMask | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mergeRef = useRef(merge);
  mergeRef.current = merge;
  /** Подпись порядка клеток текущей сетки — для полного списка битами. */
  const orderRef = useRef<string | null>(null);
  /** Когда последний раз сбрасывали since из-за недостачи. */
  const resyncAt = useRef(0);
  const seenRef = useRef(seen);
  seenRef.current = seen;
  if (seen?.mask) orderRef.current = orderOf(seen.mask.store);
  if (mapId && seen && seeded.current !== mapId) {
    seeded.current = mapId;
    // «Отправлено» — из своей памяти (fogStorage.pushed), а не из разведанного:
    // что не доехало до сервера в прошлый раз, уедет теперь.
    pushed.current = new FogMask(seen.mask.store);
    loadPushedBits(mapId, seen.mask.store, pushed.current);
    cursor.current = 0;
    lastMask.current = seen.mask;
  } else if (seen && pushed.current && seen.mask !== lastMask.current) {
    // Сетка карты сменилась (расширили) — маска переложена, журнал у неё новый.
    pushed.current = pushed.current.rebind(seen.mask.store);
    cursor.current = 0;
    lastMask.current = seen.mask;
  }

  // Забираем то, что открыто с других устройств: при входе, дальше по кругу и
  // при каждом возврате во вкладку. Только НОВОЕ с прошлого раза (since):
  // метка хранится на устройстве, полный список едет один раз на устройство.
  // Второй запрос, пока первый в пути, не шлём — иначе на медленной сети
  // полный список уезжал бы трижды.
  // Опрос начинается, когда маска уже есть: иначе первый запрос ушёл бы без
  // подписи порядка клеток и полный список приехал бы строками (560 КБ), а
  // следом — ещё раз битами.
  const hasMask = !!seen?.mask;
  useEffect(() => {
    if (!mapId || !hasMask) return;
    let alive = true;
    let inFlightSince = 0;
    const pull = () => {
      // Повисший запрос не должен запирать опрос навсегда — через 30 с
      // считаем его потерянным.
      if (inFlightSince && Date.now() - inFlightSince < 30_000) return;
      inFlightSince = Date.now();
      let since: string | undefined;
      try {
        since = window.localStorage.getItem(sinceKey(mapId)) ?? undefined;
      } catch {
        since = undefined;
      }
      // Без since едет полный список: просим его битами под наш порядок клеток.
      const order = since ? undefined : (orderRef.current ?? undefined);
      getBetaRaidFog({ data: { mapId, since, order } })
        .then((r) => {
          if (!alive) return;
          const cells = (r?.cells ?? []) as string[];
          pushed.current?.addMany(cells);
          if (cells.length > 0) mergeRef.current(cells);
          const hasBits = !!(r && "bits" in r && r.bits);
          const packed = hasBits && r.order === orderRef.current ? r.bits : null;
          if (packed) {
            const bits = fromBase64(packed);
            pushed.current?.addBits(bits);
            mergeRef.current(bits);
          }
          // Биты под чужой порядок клеток (сетка сменилась, пока ответ шёл) —
          // ничего не влито, метку не двигаем: следующий опрос возьмёт целиком.
          if (hasBits && !packed) return;
          if (pushed.current && (cells.length > 0 || packed)) savePushedBits(mapId, pushed.current);
          // Сверка с сервером: знает заметно больше нас — память устройства
          // отстала, снимаем since и перечитываем всё следующим же опросом.
          const total = (r as { total?: number | null } | undefined)?.total;
          const local = seenRef.current?.mask.size ?? 0;
          // Сервер этот этаж не помнит вовсе, а устройство помнит отправленное:
          // разведанное на сервере сброшено (чужой туман этажа вычищен,
          // 07.10.2026) — забываем и здесь и берём список целиком.
          if (serverForgot(since, total, pushed.current?.size ?? 0)) {
            seeded.current = null;
            resetRef.current();
            setTimeout(pull, 1000);
            return;
          }
          if (
            since &&
            typeof total === "number" &&
            total > local + cells.length + RESYNC_GAP &&
            Date.now() - resyncAt.current > RESYNC_EVERY_MS
          ) {
            resyncAt.current = Date.now();
            try {
              window.localStorage.removeItem(sinceKey(mapId));
            } catch {
              /* без localStorage полный список и так едет каждый раз */
            }
            console.warn(`[fog] недостача: сервер ${total}, у нас ${local} — перечитываем целиком`);
            setTimeout(pull, 1000);
            return;
          }
          const now = (r as { now?: string | null } | undefined)?.now;
          if (now) {
            try {
              window.localStorage.setItem(sinceKey(mapId), now);
            } catch {
              /* без метки — в следующий раз полный список */
            }
          }
        })
        .catch(() => {
          /* нет сети — играем на локальной памяти */
        })
        .finally(() => {
          inFlightSince = 0;
          noteFogPulled(); // разведанное влито — заставка может уходить
        });
    };
    pull();
    const id = setInterval(pull, PULL_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [mapId, hasMask]);

  /** Что открыто локально и ещё не отправлено — по журналу маски, не перебором. */
  const fresh = (): string[] => {
    const p = pushed.current;
    if (!seen || !p) return [];
    const mask = seen.mask;
    const added = mask.addedSince(cursor.current);
    cursor.current = mask.log.length;
    const out: string[] = [];
    for (const i of added) if (!p.rawIndex(i)) out.push(mask.keyOf(i));
    return out;
  };

  /** Накоплено к отправке: уходит по таймеру или при уходе со страницы. */
  const pending = useRef<string[]>([]);
  const flushPending = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pushed.current;
    if (!mapId || !p || pending.current.length === 0) return;
    const cells = pending.current;
    pending.current = [];
    void pushFog(mapId, cells, p).then((left) => {
      // Не дошло — вернётся в очередь и уедет со следующим шагом.
      if (left.length > 0) pending.current.push(...left);
      savePushedBits(mapId, p);
    });
  };

  // Всё, чего сервер ещё не знает, отправляем пачкой.
  useEffect(() => {
    if (!mapId || !seen) return;
    const cells = fresh();
    if (cells.length === 0) return;
    pending.current.push(...cells);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flushPending, PUSH_DELAY_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId, seen]);

  // Уходя со страницы, досылаем накопленное: иначе клетки, открытые в
  // последние секунды, доезжали до сервера только со следующим заходом.
  useEffect(() => {
    if (!mapId) return;
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      pending.current.push(...fresh());
      flushPending();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId, seen]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
}
