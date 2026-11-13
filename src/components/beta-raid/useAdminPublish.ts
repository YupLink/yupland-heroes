// Выгрузка накопленных правок: пачками, на свою карту и без молчаливых потерь.
//
// Вынесено из useAdminBrush (правило ≤250 строк): там осталась арифметика тапа,
// здесь — дорога очереди на сервер. Две вещи, которые эта дорога обязана
// соблюдать:
//
// 1. Пачками. Сервер берёт не больше ADMIN_PATCH_MAX_CELLS клеток за раз, а
//    очередь копится сколько угодно: накопил 600 мазков — «Выгрузить» падало на
//    проверке при каждом нажатии, и оставалось только «Забыть», то есть выкинуть
//    всю работу.
// 2. Со своей картой. Пакет уезжал на ту карту, что активна В МОМЕНТ ВЫГРУЗКИ.
//    Бета-карту могли переключить, а черновик мог сутки пролежать в localStorage
//    с прошлой — и правки ложились по тем же координатам чужой живой карты.
//    Теперь имя карты едет вместе с ними, а сервер сверяет его с активной.
import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { invalidateRaidMap } from "@/lib/query";
import { ADMIN_PATCH_MAX_CELLS, adminPatchCells } from "@/server/api/beta-raid/admin-live-batch";
import type { DraftState } from "./patchMapCache";
import { draftMapId } from "./adminDraft";
import { readDraft } from "./adminDraftStore";
import { dropSent } from "./mergeCellPatch";
import type { CellPatch } from "./patchMapCache";
import { chunkKeys, skippedKeys } from "./brushPatch";
import type { BrushText } from "./adminBrushText";
import { DARAI_POOL_KEY } from "./AdminMapPoolBar";
import { FREE_TOKEN_KEY } from "./AdminFreeTokenBar";

/**
 * Отправить пачку правок, пережив обрыв связи.
 *
 * Выкат перезапускает приложение, и запрос, попавший в эту секунду, рвётся на
 * полпути. Админ видел «ошибку правки карты», хотя ни с картой, ни с правкой
 * ничего не случилось — сервер просто уезжал. Одна повторная попытка через
 * секунду закрывает окно перезапуска.
 *
 * Повторяем ТОЛЬКО обрыв связи: отказ по существу («чужая карта», «нужна
 * местность») повторять бессмысленно и вредно — он придёт вторым таким же.
 */
async function sendPart(cells: CellPatch[], mapId: string | null) {
  try {
    return await adminPatchCells({ data: { cells, mapId } });
  } catch (e) {
    const msg = String((e as Error)?.message ?? "");
    const broken = /fetch|network|aborted|ECONNRESET|502|503|504|Сервис обновляется/i.test(msg);
    if (!broken) throw e;
    await new Promise((r) => setTimeout(r, 1000));
    return await adminPatchCells({ data: { cells, mapId } });
  }
}

/** Итог выгрузки: сколько легло, сколько сервер не взял (нет земли), был ли сбой. */
export type PublishResult = { applied: number; stuck: number; failed: boolean };

export function useAdminPublish(
  /** Права админа: без них выгружать нечего и незачем. */
  enabled: boolean,
  /** Единственное место, где меняется очередь (см. useAdminBrush.commit). */
  commit: (next: DraftState) => void,
  /** Тексты живут дольше рендера — берутся через ref, а не из замыкания. */
  text: { current: BrushText },
) {
  const qc = useQueryClient();
  const [sending, setSending] = useState(false);
  /** Клетки уехавшего пакета: отменять их поздно, пока сервер не ответил. */
  const inFlight = useRef<Set<string>>(new Set());

  // quiet — автосохранение мира креатора (creator/useCreatorAutosave): без тоста «выложено».
  const publish = useCallback(async (opts?: { quiet?: boolean }): Promise<PublishResult> => {
    const none: PublishResult = { applied: 0, stuck: 0, failed: false };
    if (!enabled) return none;
    const sent = readDraft().queue;
    const keys = Object.keys(sent);
    if (keys.length === 0) return none;
    const mapId = draftMapId(qc);
    // Пока пакеты едут, «в пути» считается вся очередь: отменять ластиком
    // клетку из ещё не уехавшей пачки поздно — она всё равно отправится.
    inFlight.current = new Set(keys);
    setSending(true);
    const stuck: string[] = [];
    let applied = 0;
    let failed = false;
    try {
      for (const part of chunkKeys(keys, ADMIN_PATCH_MAX_CELLS)) {
        const res = await sendPart(
          part.map((k) => sent[k]),
          mapId,
        );
        applied += res.applied;
        // Клетку без местности сервер пропустил — она остаётся в очереди.
        const skip = new Set(skippedKeys(res, part));
        stuck.push(...skip);
        // Пачки снимаются с очереди по одной: упавшая на середине выгрузка
        // оставляет неуехавшее в очереди, и счётчик показывает ровно его.
        commit(dropSent(readDraft(), sent, part, skip));
      }
    } catch (e) {
      // Чужая карта, оборванная сеть — очередь при этом НЕ чистится.
      failed = true;
      toast.error(humanError(e as Error));
    } finally {
      inFlight.current = new Set();
      setSending(false);
    }
    if (applied > 0 && opts?.quiet !== true) toast.success(text.current.published(applied));
    if (stuck.length > 0) toast.error(text.current.skipped(stuck));
    const result: PublishResult = { applied, stuck: stuck.length, failed };
    if (applied === 0) return result;
    // Карта, admin-cell, beta-raid-players и корабли — всё с refetchType:
    // "all". Без него неактивные запросы (у самого админа окно клетки могло
    // быть закрыто, вкладка admin-cell в кэше — persist сутки) не
    // перечитывались, и «только что выложил — ничего нет» до F5. Черновик
    // возвращает подписка, база отмены пересобирается на свежих данных.
    invalidateRaidMap(qc);
    // Новые объекты заложили свои награды в пул карты, снятые — вернули.
    qc.invalidateQueries({ queryKey: DARAI_POOL_KEY });
    // Разложенные монеты меняют и остаток свободных USDT — иначе после
    // правки карты полоска показывала бы прежнее число до перезагрузки.
    qc.invalidateQueries({ queryKey: FREE_TOKEN_KEY });
    return result;
  }, [enabled, commit, qc, text]);

  return { publish, sending, inFlight };
}
