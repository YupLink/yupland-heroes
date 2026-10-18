// Админка турниров: список, черновик (создать/изменить/удалить), запуск,
// остановка и очки участника — «доказуемо».
//
// Слово владельца (03.10.2026): админ объявляет категорию, число дней (по
// умолчанию 7), места одной колонкой и призы (сохранение — tour-admin-save.ts,
// там же цена записи). Создан — черновик; «Запустить»
// фиксирует начало (конец — через N дней) и бронирует DARAI-фонд из пула карты;
// «Остановить» у идущего — завершить сейчас тем же финишем, что по таймеру.
// Расписание (04.10.2026): начало и конец по UTC — задано начало, черновик
// стартует сам (tour-tick → autoStartDue); пусто — старт кнопкой.
// Ошибки — ключами перевода tour.err.*.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireAdmin } from "../../auth";
import type { TourAdminRow, TourPointRow, TourStatus } from "@/lib/tournament/types";
import { TOUR_COLS, toAdminRow, type TourDbRow } from "./tour-rows";
import { startTournament } from "./tour-start";
import { finishTournament } from "./tour-finish";
import { dropTourCache } from "./tour-note";
import { loadBoard, type BoardLine } from "./tour-board";
import { oneRow } from "./tour-sql";

// Сохранение черновика (с ценой записи) — свой модуль; импортёры прежние.
export { adminTourSave, draftError } from "./tour-admin-save";

const idInput = z.object({ id: z.string().min(1).max(64) });

/** Часы турниров стартуют и отсюда: админ может открыть турниры раньше игроков. */
const ensureTicker = () => void import("./tour-tick").then((m) => m.startTourTicker());

export const adminTourList = createServerFn({ method: "GET" }).handler(
  async (): Promise<TourAdminRow[]> => {
    requireAdmin();
    ensureTicker();
    const rows = (await mcpExec(
      `SELECT ${TOUR_COLS} FROM yuplink.tournament t ORDER BY t.created_at DESC LIMIT 200`,
      { wrapJson: true },
    )) as TourDbRow[] | null;
    return (rows ?? []).map(toAdminRow);
  },
);

/**
 * Удалить черновик одним оператором: строки записей запираем (FOR UPDATE) —
 * отметка «оплачено», пришедшая в эту же миллисекунду, либо успеет и
 * остановит удаление (lk видит её строку оплаченной), либо будет ждать и
 * промахнётся по стёртой строке (плательщик вернёт плату сам). Погашенная
 * строка с невернувшейся платой тоже держит удаление: каскад стёр бы её
 * вместе с долгом игроку.
 */
export const deleteDraftSql = (id: string): string => `WITH lk AS (
  SELECT e.paid, e.pay_ref FROM yuplink.tournament_entry e
   WHERE e.tournament_id = ${sqlStr(id)}
   FOR UPDATE
),
d AS (
  DELETE FROM yuplink.tournament t
   WHERE t.id = ${sqlStr(id)} AND t.status = 'draft'
     AND NOT EXISTS (SELECT 1 FROM lk WHERE lk.paid OR lk.pay_ref LIKE '%:void')
  RETURNING t.id
)
SELECT row_to_json(_t.*) AS _row FROM (
  SELECT (SELECT id FROM d) AS id,
         EXISTS (SELECT 1 FROM lk WHERE lk.paid) AS paid,
         EXISTS (SELECT 1 FROM lk WHERE lk.pay_ref LIKE '%:void') AS owed
) _t;`;

export const adminTourDelete = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    requireAdmin();
    // Удалить можно только черновик: у идущего и завершённого есть очки и бронь.
    // И только без оплаченных записей: за запись заплачено — каскад стёр бы её
    // молча. Неоплаченные (и свежие тоже: попытка могла упасть, заплатив)
    // разбираем до каскада — плата по ключу возвращается (tour-entry-settle);
    // живая плата, которая ещё идёт, промахнётся отметкой и вернёт деньги сама.
    const { sweepStaleEntries } = await import("./tour-entry-settle");
    await sweepStaleEntries(data.id);
    const id = sqlStr(data.id);
    const res = oneRow<{ id: string | null; paid: boolean; owed: boolean }>(
      (await mcpExec(deleteDraftSql(data.id))) as unknown[] | null,
    );
    if (res?.id) return { ok: true };
    const left = (await mcpExec(
      `SELECT status FROM yuplink.tournament t WHERE t.id = ${id} LIMIT 1;`,
      { wrapJson: true },
    )) as Array<{ status: TourStatus }> | null;
    // Повтор после удачного удаления строки уже не найдёт — это успех.
    if (!left?.[0]) return { ok: true };
    if (left[0].status !== "draft") throw new Error("tour.err.state");
    if (res?.paid) throw new Error("tour.err.has_entries");
    if (res?.owed) throw new Error("tour.err.refund_pending");
    throw new Error("tour.err.state");
  });

export const adminTourStart = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    requireAdmin();
    const res = await startTournament(data.id);
    dropTourCache();
    ensureTicker();
    return res;
  });

export const adminTourStop = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    requireAdmin();
    const res = await finishTournament(data.id);
    if (res.ok) return { ok: true };
    // Не захватили: уже выплачивается или завершён — остановка состоялась.
    const now = (await mcpExec(
      `SELECT status FROM yuplink.tournament WHERE id = ${sqlStr(data.id)} LIMIT 1;`,
      { wrapJson: true },
    )) as Array<{ status: TourStatus }> | null;
    const st = now?.[0]?.status;
    if (st === "paying" || st === "done") return { ok: true };
    throw new Error("tour.err.state");
  });

/** Таблица для админки — с аккаунтами, чтобы открыть очки участника. */
export const adminTourTable = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    idInput.extend({ offset: z.number().int().min(0).max(100_000) }).parse(d),
  )
  .handler(async ({ data }): Promise<{ rows: BoardLine[]; total: number }> => {
    requireAdmin();
    const st = (await mcpExec(
      `SELECT status FROM yuplink.tournament WHERE id = ${sqlStr(data.id)} LIMIT 1;`,
      { wrapJson: true },
    )) as Array<{ status: TourStatus }> | null;
    const status = st?.[0]?.status;
    if (!status) throw new Error("tour.err.not_found");
    const b = await loadBoard(data.id, status, data.offset);
    return { rows: b.lines, total: b.total };
  });

/** Последние 200 очков участника: что засчитано, за что (ref) и когда. */
export const adminTourPoints = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => idInput.extend({ accountId: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }): Promise<TourPointRow[]> => {
    requireAdmin();
    const rows = (await mcpExec(
      `SELECT ref, qty::float8 AS qty, extract(epoch from at) * 1000 AS at_ms
         FROM yuplink.tournament_point
        WHERE tournament_id = ${sqlStr(data.id)} AND account_id = ${sqlStr(data.accountId)}
        ORDER BY at DESC LIMIT 200`,
      { wrapJson: true },
    )) as Array<{ ref: string; qty: number | string; at_ms: number | string }> | null;
    return (rows ?? []).map((r) => ({
      ref: r.ref,
      qty: Number(r.qty) || 0,
      at: new Date(Number(r.at_ms) || 0).toISOString(),
    }));
  });
