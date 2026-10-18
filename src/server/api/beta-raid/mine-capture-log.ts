// Уведомления «твою шахту отбили» для окна «Добыча».
//
// ПОЧЕМУ: начисление при перехвате было немым. SQL raid_mine_capture платит
// прежнему хозяину целые незаклеймленные часы в момент захвата — но шахта
// просто пропадала из списка, а ресурс ложился на счёт без подписи. Игрок,
// владевший 10:00–12:00 и открывший игру в 12:30, был уверен, что не получил
// ничего. Теперь та же SQL-транзакция пишет строку в raid_mine_capture_log,
// а здесь она читается и помечается прочитанной.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { accAccountId } from "../currency/move";

export type MineCaptureNotice = {
  id: string;
  q: number;
  r: number;
  /** Что добывала шахта; null — настройка была снята до захвата. */
  resource: string | null;
  token: string | null;
  /** Начислено прежнему хозяину; 0 — держал меньше часа с последнего сбора. */
  amount: number;
  /** Сколько часов шёл секундомер (с долями) и за сколько целых заплатили. */
  hours: number;
  dueHours: number;
  /** Момент захвата, мс эпохи. */
  at: number;
};

type Row = {
  id: string;
  q: number;
  r: number;
  resource: string | null;
  token: string | null;
  amount: number;
  hours: number;
  due_hours: number;
  at_ms: number;
};

/**
 * Непросмотренные захваты моих шахт. Только за 30 дней и не больше 50 строк:
 * это уведомление, а не архив. Время отдаём числом (extract(epoch)), как у
 * captured_at шахт — timestamptz-строку в браузере парсить ненадёжно.
 */
export async function unseenMineCaptures(account: string): Promise<MineCaptureNotice[]> {
  const rows = (await mcpExec(
    `SELECT id, q, r, resource, token, amount, hours, due_hours,
            extract(epoch from seized_at)*1000 AS at_ms
       FROM yuplink.raid_mine_capture_log
      WHERE old_account=${sqlStr(account)} AND seen_at IS NULL
        AND seized_at > now() - interval '30 days'
      ORDER BY seized_at DESC LIMIT 50;`,
    { wrapJson: true },
  )) as Row[];
  return (rows ?? []).map((x) => ({
    id: String(x.id),
    q: Number(x.q),
    r: Number(x.r),
    resource: x.resource ?? null,
    token: x.token ?? null,
    amount: Number(x.amount) || 0,
    hours: Number(x.hours) || 0,
    dueHours: Number(x.due_hours) || 0,
    at: Number(x.at_ms) || 0,
  }));
}

/**
 * «Понятно» в окне «Добыча»: помечаем строки прочитанными. Чужие id не
 * тронутся — условие по old_account. Повтор безвреден (seen_at уже стоит).
 */
export const markMineCapturesSeen = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().min(1)).max(50) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const account = await accAccountId(wallet);
    if (!account) throw new Error("gifts.err_no_account");
    if (data.ids.length === 0) return { ok: true as const, n: 0 };
    const rows = (await mcpExec(
      `UPDATE yuplink.raid_mine_capture_log SET seen_at = now()
        WHERE old_account=${sqlStr(account)} AND seen_at IS NULL
          AND id IN (${data.ids.map((id) => sqlStr(id)).join(",")})
        RETURNING id;`,
      { wrapJsonCte: true },
    )) as Array<{ id: string }>;
    return { ok: true as const, n: (rows ?? []).length };
  });
