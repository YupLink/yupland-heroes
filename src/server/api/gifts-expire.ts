// Срок подарка: не забрали за 48 часов — сгорел.
//
// Правило владельца (20.09): подарок ждёт двое суток, дальше строка уходит в
// `expired` и игроку не показывается. Уведомления о сгорании нет намеренно —
// игрок узнаёт срок из письма о подарке и подписи «сгорит через N ч» в окне.
//
// Зачистка живёт ВНУТРИ процесса приложения, как dead-sweep и сторож перфа:
// root-crontab на сервере нам недоступен, а таймер с unref процесс не держит.
// Воркеров один-два, и у каждого свой таймер — это безопасно: UPDATE ниже
// идемпотентен по WHERE (статус и срок), второй просто найдёт ноль строк.
// Между прогонами просроченный подарок и так не виден (getMyGifts фильтрует
// живые) и не берётся клеймом (CAS требует живой срок), так что окно в десять
// минут существует только в базе.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";

/** Сколько подарок ждёт клейма. Та же цифра — в default колонки (acc-44). */
export const GIFT_TTL_SQL = "now() + interval '48 hours'";

/** Условие «подарок ещё живой». NULL — бессрочный: строки до правила. */
export const GIFT_LIVE_SQL = "(expires_at IS NULL OR expires_at > now())";

/**
 * Что делаем со сгоревшей строкой. Ключ повтора освобождаем: у части раздач он
 * стабильный по (шаблон, аккаунт) — heroes-common-grant, — и без этого
 * повторная выдача тому же игроку после сгорания упиралась бы в ON CONFLICT и
 * рапортовала «выдано», а подарка не было бы.
 */
const EXPIRE_SET = `status = 'expired',
        source_ref = CASE WHEN source_ref IS NULL THEN NULL
                          ELSE source_ref || ':x:' || id END`;

const SWEEP_EVERY_MS = 10 * 60_000;

/** Перевести все просроченные pending в expired. Ошибку не бросаем: это фон. */
export async function expireStaleGifts(): Promise<void> {
  await mcpExec(
    `UPDATE yuplink.player_gift SET ${EXPIRE_SET}
      WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at <= now();`,
  ).catch((e) =>
    console.warn("[gifts] зачистка сгоревших не прошла:", e instanceof Error ? e.message : e),
  );
  // Сгоревший турнирный приз в DARAI — назад в пул карты (повтор безопасен).
  await import("./tournament/tour-expire").then((m) => m.returnExpiredTourDarai()).catch(() => {});
}

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Включить зачистку. Зовётся лениво из первого чтения подарков в процессе
 * (как startDeadSweeper из снимка карты); первый прогон — сразу, чтобы
 * свежеподнятый воркер не ждал десять минут.
 */
export function startGiftExpirySweeper(): void {
  if (timer || typeof setInterval !== "function") return;
  // Только сервер: модуль тянет мост к базе.
  if (!import.meta.env.SSR) return;
  timer = setInterval(() => void expireStaleGifts(), SWEEP_EVERY_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
  void expireStaleGifts();
}

/**
 * Почему клейм не захватил строку. Просроченный pending переводим в expired
 * тут же (зачистка могла ещё не дойти) и честно говорим «сгорел» — иначе игрок
 * читал бы «уже забран» про подарок, которого не получал. Проверяем и уже
 * поставленный зачисткой 'expired': иначе диагноз зависел бы от того, кто
 * успел раньше — таймер или нажатие.
 */
export async function whyNotClaimed(account: string, giftId: string): Promise<"expired" | "taken"> {
  const where = `id = ${sqlStr(giftId)} AND account_id = ${sqlStr(account)}`;
  const stale = (await mcpExec(
    `UPDATE yuplink.player_gift SET ${EXPIRE_SET}
      WHERE ${where} AND status = 'pending'
        AND expires_at IS NOT NULL AND expires_at <= now()
      RETURNING id;`,
    { wrapJsonCte: true },
  ).catch(() => [])) as Array<{ id: string }>;
  if (stale?.[0]) return "expired";
  const rows = (await mcpExec(`SELECT status FROM yuplink.player_gift WHERE ${where};`, {
    wrapJson: true,
  }).catch(() => [])) as Array<{ status: string }>;
  return rows?.[0]?.status === "expired" ? "expired" : "taken";
}
