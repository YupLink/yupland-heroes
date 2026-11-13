// Кисть режима бога: выбрал объект — ставится по тапам, пока не выбрал другой.
//
// Раньше каждая клетка требовала: открой окно, найди в палитре, поставь, жди
// ответа сервера. Теперь правки копятся локально (карта перерисовывается
// сразу), а на сервер уезжают одним махом по кнопке «Выгрузить».
//
// Сама очередь живёт не здесь, а в adminDraft: она переживает и перерисовку, и
// уход с экрана, и перезагрузку страницы — вместе с картой, в которую уже
// вписаны её мазки. Здесь остаётся арифметика тапа: что положить в очередь,
// что считать отменой и когда правка вернулась «как было».
//
// Весь механизм включается ТОЛЬКО правами админа (enabled). Без них хук не
// подписывается на кэш, не читает и не пишет localStorage и ничего не
// накладывает на карту: горячий экран рейда открыт у всех, а черновик — вещь
// одного человека.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { invalidateRaidMap } from "@/lib/query";
import {
  readCellDetails,
  type CellDetails,
  type CellPatch,
  type DraftState,
  type MapLike,
} from "./patchMapCache";
import { commitDraft, dropDraft, watchDraft } from "./adminDraft";
import { syncDraftAssets } from "./cellAssets";
import { readDraft } from "./adminDraftStore";
import { dropCell, nextDraft } from "./mergeCellPatch";
import { queueCellsDraft } from "./queueCells";
import { hexArea, paintArea } from "./brushArea";
import { blockLayerHolder, routeBlockPatch, stripBlockedLayers } from "./mergeSelect";
import { isGenBrush, isVoidBrush, patchFor, type Brush, type BrushKind } from "./brushPatch";
import { brushText } from "./adminBrushText";
import { erasePatch, type EraseTarget } from "./eraseTarget";
import { useAdminPublish } from "./useAdminPublish";

export type { Brush, BrushKind } from "./brushPatch";

/** Очередь игрока без прав: одна и та же ссылка, значит и ноль перерисовок. */
const NO_QUEUE: Record<string, CellPatch> = {};

/**
 * Кисти, которые красят ОБЛАСТЬ (по размеру): местность (в т.ч. купол), декор,
 * постройка — как в редакторе карт. Дорога и объекты (сундук/арт/босс) ставятся
 * по одной: размножать босса или дорогу веером бессмысленно.
 */
export const AREA_KINDS: BrushKind[] = ["terrain", "decoration", "building"];

export function useAdminBrush(
  enabled = false,
  opts?: {
    /** Кисть «Биом»: область мазка и сама тапнутая клетка (углу прямоугольника нужна она). */
    onGenToggle?: (
      cells: Array<{ q: number; r: number }>,
      center: { q: number; r: number },
    ) => void;
  },
) {
  const qc = useQueryClient();
  const [brush, setBrush] = useState<Brush>(null);
  // Размер кисти (радиус). 1 — одна клетка, как раньше. Только для area-кистей.
  const [size, setSize] = useState(1);
  // Колбэк биом-выделения хранится в ref: он приходит новой ссылкой на каждый
  // рендер BetaRaidScreen, и без ref пришлось бы гнать paint в deps каждый раз.
  const onGenToggleRef = useRef(opts?.onGenToggle);
  onGenToggleRef.current = opts?.onGenToggle;
  /** Накопленные правки: "q,r" → что положить на клетку. */
  const [queue, setQueue] = useState<Record<string, CellPatch>>(NO_QUEUE);
  const lang = useLang();
  const text = brushText(lang);
  // Сообщения нужны и в размонтировании, и в подписке на кэш — они живут
  // дольше рендера, поэтому берутся через ref, а не из замыкания.
  const textRef = useRef(text);
  textRef.current = text;

  /** Единственное место, где меняется очередь: черновик, карта и состояние разом. */
  const commit = useCallback(
    (next: DraftState, reverted: string[] = []) => {
      // Снимок ассетов снимаем ЗДЕСЬ — в момент правки палитра заведомо в
      // руках, ею только что выбрали кисть. Кэш палитры живёт в общем блобе
      // персиста и выбрасывается сменой его buster'а целиком; черновик лежит в
      // своём ключе и выкат переживает — без снимка он поднялся бы безымянным.
      syncDraftAssets(qc, next.queue);
      commitDraft(qc, next, reverted);
      setQueue(next.queue);
    },
    [qc],
  );

  /** Дорога очереди на сервер: пачки, сверка карты, что снимать с очереди. */
  const { publish, sending, inFlight } = useAdminPublish(enabled, commit, textRef);

  /**
   * Взять очередь из черновика. Она одна на всех, и состояние экрана — её
   * ссылка, а не копия: подписка отбраковывает черновик мимо React (чужая
   * карта), и без этого на кнопке оставалось «Выгрузить · 12» от правок,
   * которых уже нет. Ссылка та же — React перерисовку не затевает.
   */
  const sync = useCallback(() => setQueue(readDraft().queue), []);

  useEffect(() => {
    if (!enabled) return;
    // Черновик поднимается из localStorage и возвращается на карту; подписка
    // держит его поверх чужих обновлений, пока экран открыт.
    return watchDraft(
      qc,
      (note, count) => {
        if (note === "restored") {
          toast(textRef.current.restored(count ?? 0), { id: "admin-draft-restored" });
          return;
        }
        toast.error(textRef.current[note]);
      },
      sync,
    );
  }, [qc, enabled, sync]);

  // Уходя с экрана, очередь НЕ стираем: карта в кэше уже нарисована ею, и
  // молчаливая чистка оставила бы мазки, которых нет ни в очереди, ни на
  // сервере. Вместо этого честно говорим, сколько осталось невыгруженным.
  useEffect(() => {
    if (!enabled) return;
    return () => {
      const left = Object.keys(readDraft().queue).length;
      if (left > 0) toast(textRef.current.leftPending(left), { id: "admin-draft-left" });
    };
  }, [enabled]);

  /**
   * Кладём правку в очередь. Если клетка вернулась к исходному виду (поставили
   * и тут же стёрли), правка из очереди уходит — счётчик выгрузки честный, а
   * клетка возвращается к снимку: иначе на карте остался бы мазок, которого
   * никто уже не помнит (так стирался оплаченный игроками тир постройки).
   */
  const enqueue = useCallback(
    (patch: CellPatch, before: CellDetails) => {
      const step = nextDraft(readDraft(), patch, before);
      commit(step.next, step.reverted);
    },
    [commit],
  );

  const pending = useMemo(() => Object.keys(queue).length, [queue]);
  /** Клетки, которые ждут выгрузки, — карта обводит их золотом. */
  const pendingCells = useMemo(() => new Set(Object.keys(queue)), [queue]);

  /** Снимок клетки для отмены: слои из карты, метка «добыт» — из живого списка. */
  const read = useCallback(
    (q: number, r: number) => {
      const d = readCellDetails(qc.getQueryData(["beta-raid-map"]) as never, q, r);
      // Карта гасит объекты по живому списку, и он свежее собственной метки
      // карты: иначе «оживить» уже добытого босса считалось бы «как было» и
      // вылетало из очереди, ничего не изменив на сервере.
      const live = qc.getQueryData<{ defeated?: string[] }>(["beta-raid-players"]);
      return live?.defeated ? { ...d, defeated: live.defeated.includes(`${q},${r}`) } : d;
    },
    [qc],
  );

  /** Мазок по ОДНОЙ клетке: правка ложится в очередь и сразу видна на карте. */
  const paintOne = useCallback(
    (q: number, r: number) => {
      if (!enabled || !brush) return false;
      const before = read(q, r);
      // Купол и дорога требуют земли под собой — сервер такую правку всё равно
      // отобьёт (admin-live-batch.needGround), а в очереди она виснет навсегда:
      // «Выгрузить · N» не убывает, и чистится только «Забыть» вместе со всей
      // работой. Дорога тут заодно и по смыслу: она лежит ПОВЕРХ местности.
      if ((isVoidBrush(brush) || brush.kind === "road") && !before.terrainId) return false;
      // Купол одной кнопкой — тумблер: если клетка уже накрыта, снимаем;
      // иначе накрываем. patchFor даёт всегда «поставить» (voidFog: true),
      // поэтому переопределяем здесь. Так одна кнопка покрывает оба сценария.
      let patch = patchFor(brush);
      if (isVoidBrush(brush)) patch = { voidFog: !before.voidFog };
      // Постройка (и декор) в блоке одна — на ведущей клетке: мазок по соседке
      // меняет её, а не кладёт вторую, невидимую (routeBlockPatch).
      const map = qc.getQueryData(["beta-raid-map"]) as MapLike;
      for (const p of routeBlockPatch(map, before.groupId, { q, r, ...patch }))
        enqueue(p, read(p.q, p.r));
      return true;
    },
    [enabled, brush, read, enqueue, qc],
  );

  /**
   * Мазок кисти. Для area-кистей (местность/декор/постройка) при size>1 красит
   * гексагональную область радиусом size, как в редакторе карт. Дорога и объекты
   * — всегда одна клетка.
   */
  const paint = useCallback(
    (q: number, r: number) => {
      if (!enabled || !brush) return false;
      // Кисть биом-выделения ничего в карту не пишет: собранные клетки
      // передаём наружу, а тумблер (добавить/снять) решает верхний слой по
      // состоянию первой клетки мазка — как в hex-editor.
      if (isGenBrush(brush)) {
        const cells =
          size > 1 && AREA_KINDS.includes(brush.kind) ? hexArea(q, r, size) : [{ q, r }];
        onGenToggleRef.current?.(cells, { q, r });
        return true;
      }
      if (size <= 1 || !AREA_KINDS.includes(brush.kind)) return paintOne(q, r);
      let any = false;
      for (const c of paintArea(q, r, size)) {
        if (paintOne(c.q, c.r)) any = true;
      }
      return any;
    },
    [enabled, brush, size, paintOne],
  );

  /**
   * Правка из окна клетки — в ту же очередь, что и мазок кисти. Иначе «убрать
   * декор» уезжало бы отдельным запросом, а «Выгрузить · N» врало бы о том,
   * сколько правок ждёт отправки.
   */
  const queueCell = useCallback(
    (patch: CellPatch) => {
      if (!enabled) return;
      const before = read(patch.q, patch.r);
      // Окно клетки по члену блока правит постройку/декор блока там, где они
      // стоят (routeBlockPatch), — второй слой на члене был бы невидим.
      const map = qc.getQueryData(["beta-raid-map"]) as MapLike;
      for (const p of routeBlockPatch(map, before.groupId, patch)) enqueue(p, read(p.q, p.r));
    },
    [enabled, read, enqueue, qc],
  );

  /** Пачка правок одним коммитом — так кладёт зону генератор: по одной через
   *  queueCell каждая клетка тянула бы свой commit (см. queueCells.ts). */
  const queueCells = useCallback(
    (patches: CellPatch[]) => {
      if (!enabled || patches.length === 0) return;
      const map = qc.getQueryData(["beta-raid-map"]) as MapLike;
      const guard = (p: CellPatch, before: CellDetails) =>
        before.groupId ? stripBlockedLayers(map, before.groupId, p) : p;
      const step = queueCellsDraft(readDraft(), patches, read, guard);
      commit(step.next, step.reverted);
    },
    [enabled, qc, read, commit],
  );

  /**
   * Ластик. По клетке со своими невыгруженными правками работает как отмена:
   * вернул её к исходному виду — счётчик выгрузки уменьшился. По чистой клетке
   * снимает всё, кроме местности, и это уже правка (её выгружать).
   */
  const eraseOne = useCallback(
    (q: number, r: number, target: EraseTarget = "top") => {
      if (!enabled) return false;
      const key = `${q},${r}`;
      const draft = readDraft();
      if (draft.queue[key]) {
        // Клетка уже в летящем пакете: на сервере она вот-вот станет правдой,
        // и «отмена» отменила бы только картинку. Честнее сказать «поздно».
        if (inFlight.current.has(key)) {
          toast(textRef.current.inFlight, { id: "admin-erase-inflight" });
          return true;
        }
        const step = dropCell(draft, key);
        commit(step.next, step.reverted);
        return true;
      }

      // Купол ластик НЕ снимает: у него свой инструмент в палитре. Что именно
      // снимает тап — режим ластика (eraseTarget.ts): по слою сверху, один
      // слой или клетку целиком с местностью (только мир креатора).
      const before = read(q, r);
      const map = qc.getQueryData(["beta-raid-map"]) as MapLike;
      const held = (f: "buildingId" | "decorationId") =>
        before.groupId ? blockLayerHolder(map, before.groupId, f) : null;
      const patch = erasePatch(before, target, q, r, held);
      if (!patch) return false;
      enqueue(patch, read(patch.q, patch.r));
      return true;
    },
    [enabled, read, enqueue, commit, inFlight, qc],
  );

  /** Ластик по области при size>1 (как в редакторе карт), иначе одна клетка. */
  const erase = useCallback(
    (q: number, r: number, target: EraseTarget = "top") => {
      if (!enabled) return false;
      if (size <= 1) return eraseOne(q, r, target);
      let any = false;
      for (const c of paintArea(q, r, size)) {
        if (eraseOne(c.q, c.r, target)) any = true;
      }
      return any;
    },
    [enabled, size, eraseOne],
  );

  /**
   * Снять из очереди накопленные правки по заданным клеткам. Используется
   * панелью биом-генератора: «Забыть правки» отменяет её же прогон, не
   * трогая остальную работу админа. Уехавшие клетки (inFlight) пропускаем —
   * их отмена уже не имеет смысла (см. paintOne/eraseOne).
   */
  const discardKeys = useCallback(
    (keys: string[]) => {
      if (!enabled || keys.length === 0) return;
      const cur = readDraft();
      const queue = { ...cur.queue };
      const base = { ...cur.base };
      const reverted: string[] = [];
      for (const k of keys) {
        if (!queue[k]) continue;
        if (inFlight.current.has(k)) continue;
        delete queue[k];
        delete base[k];
        reverted.push(k);
      }
      if (reverted.length === 0) return;
      commit({ queue, base }, reverted);
    },
    [enabled, commit, inFlight],
  );

  const reset = useCallback(() => {
    if (!enabled) return;
    // Возвращаем по снимкам и карту, и живой список «добытых» — выброшенная
    // правка «погасить» не должна гасить объект дальше.
    dropDraft(qc);
    sync();
    invalidateRaidMap(qc);
  }, [enabled, qc, sync]);

  return {
    brush,
    setBrush,
    size,
    setSize,
    paint,
    erase,
    queue,
    queueCell,
    queueCells,
    discardKeys,
    reset,
    publish,
    pending,
    pendingCells,
    sending,
  };
}
