// Квитанции ввода NFT (claim/release) и журнал операций ввода.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ МОДУЛЬ: транспорт к БД (mcpClient) повторяет запрос при
// обрыве SSE/таймауте/502 — и это правильно, иначе игрок ловит «pool is closed»
// на любой операции. Но повтор безопасен ТОЛЬКО для идемпотентного SQL.
// Прежний claim был `INSERT ... ON CONFLICT DO NOTHING RETURNING`: первая
// попытка вставляла строку, ответ терялся, повтор возвращал НОЛЬ строк — и код
// читал это как «квитанцию уже зачли кто-то другой». Отметка есть, пака нет,
// повторный ввод отбит: ровно те сироты, которых догоняли руками.
//
// Лечится не запретом ретрая (он спасает всё остальное приложение), а
// идентификатором операции: строка помечается НАШИМ op_id, и повтор отличает
// «вставил я» от «вставил кто-то другой».
import { nanoid } from "nanoid";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";

export type NftInputKind = "pack" | "chip";
export type NftInputStatus = "started" | "granted" | "failed";

/**
 * Отмечает квитанцию как зачтённую. Ключ — тройка (wallet, tx_hash, token_id):
 * одной транзакцией присылают несколько NFT, и пометка на всю tx хоронила
 * остальные токены (игрок отправил три NFT — получил один пак).
 *
 * true — квитанцию занял ЭТОТ вызов (в том числе его же повтор из транспорта),
 * false — её занял кто-то раньше. `DO UPDATE SET op_id = u.op_id` не меняет
 * строку, но заставляет RETURNING отдать существующий op_id: без него повтор
 * получал пустой ответ и врал «уже зачли».
 */
export async function claimNftInputTx(
  wallet: string,
  txHash: string,
  tokenId?: string,
): Promise<boolean> {
  const opId = `nio_${nanoid(12)}`;
  const rows = (await mcpExec(
    `INSERT INTO yuplink.nft_input_used AS u(wallet, tx_hash, token_id, op_id)
       VALUES(${sqlStr(wallet)}, ${sqlStr(txHash)}, ${sqlStr(tokenId ?? "")}, ${sqlStr(opId)})
       ON CONFLICT (wallet, tx_hash, token_id) DO UPDATE SET op_id = u.op_id
       RETURNING u.op_id AS op_id;`,
    { wrapJsonCte: true },
  )) as Array<{ op_id: string | null }>;
  return rows[0]?.op_id === opId;
}

/**
 * Снимает пометку квитанции: выдача после claim сорвалась. Без этого NFT
 * застревала навсегда — квитанция «зачтена», а бокса нет.
 *
 * Раньше любая ошибка тут глушилась молча, и о несработавшем снятии никто не
 * узнавал. Теперь пишем в лог и возвращаем факт: вызывающий кладёт его в журнал.
 */
export async function releaseNftInputTx(
  wallet: string,
  txHash: string,
  tokenId?: string,
): Promise<boolean> {
  try {
    await mcpExec(
      `DELETE FROM yuplink.nft_input_used
        WHERE wallet=${sqlStr(wallet)} AND tx_hash=${sqlStr(txHash)}
          AND token_id=${sqlStr(tokenId ?? "")};`,
    );
    return true;
  } catch (e) {
    console.error(
      `[nft-input] НЕ СНЯЛАСЬ квитанция wallet=${wallet} tx=${txHash} token=${tokenId ?? ""}:`,
      e instanceof Error ? e.message : String(e),
    );
    return false;
  }
}

// ──────── Журнал операций ввода ────────
//
// Ключ уникальности — (contract, token_id, tx_hash), а НЕ (contract, token_id):
// токен вводится не один раз за жизнь. Выведенная фишка возвращается в игру
// сколько угодно раз (на этом держится «тот же serial»), да и пак-NFT уходит на
// склад магазина и продаётся снова — в проде уже есть токен, введённый дважды
// разными игроками. Жёсткая уникальность по токену заставила бы журнал молча
// терять вторую, настоящую операцию — то самое слепое пятно, ради которого он и
// заводится. Повторы же ОДНОЙ операции (ретрай транспорта, второй клик по той
// же квитанции) схлопываются в одну строку.

/** Журнал не должен ронять выдачу: он наблюдатель, а не гард. */
async function safeExec(sql: string, what: string): Promise<void> {
  try {
    await mcpExec(sql);
  } catch (e) {
    console.warn(`[nft-input] журнал (${what}) не записался:`, e instanceof Error ? e.message : e);
  }
}

/**
 * Итог ПРОВЕРКИ перевода — до того, как началась выдача.
 *
 * Раньше журнал начинался только после успешной проверки, поэтому её провалы не
 * попадали в него вовсе: 74 записи, все granted, ни одной failed — и ровно то
 * слепое пятно, из-за которого «падает через раз» пришлось искать руками.
 * Строки на этот момент ещё нет, поэтому пишем сразу с итогом.
 *
 * `waiting` — перевод состоялся, но Sendler его пока не отдал. Такая операция
 * остаётся незавершённой (status='started'), и её подхватывают догоны:
 * journalUnfinished берёт всё, что не granted. Отдельного статуса в таблице нет
 * (CHECK разрешает started/granted/failed), а менять схему на живом ради ярлыка
 * незачем — состояние читается по тексту причины.
 */
export async function journalCheckOutcome(o: {
  wallet: string;
  contract: string;
  tokenId: string;
  txHash: string;
  kind: NftInputKind;
  outcome: "waiting" | "rejected";
  reason: string;
}): Promise<void> {
  const status = o.outcome === "waiting" ? "started" : "failed";
  const note = `${o.outcome === "waiting" ? "ждём подтверждения" : "проверка отклонила"}: ${o.reason}`;
  await safeExec(
    `INSERT INTO yuplink.nft_input_op AS j
       (id, wallet, contract, token_id, tx_hash, kind, status, error)
     VALUES(${sqlStr(`nop_${nanoid(10)}`)}, ${sqlStr(o.wallet)}, ${sqlStr(o.contract)},
            ${sqlStr(o.tokenId)}, ${sqlStr(o.txHash)}, ${sqlStr(o.kind)},
            ${sqlStr(status)}, ${sqlStr(note.slice(0, 500))})
     ON CONFLICT (contract, token_id, tx_hash) DO UPDATE SET
       wallet = EXCLUDED.wallet,
       kind = EXCLUDED.kind,
       status = CASE WHEN j.status = 'granted' THEN 'granted' ELSE EXCLUDED.status END,
       error = CASE WHEN j.status = 'granted' THEN j.error ELSE EXCLUDED.error END,
       updated_at = now();`,
    "check",
  );
}

/** Операция началась: строка появляется ДО первой необратимой записи. */
export async function journalStart(o: {
  wallet: string;
  contract: string;
  tokenId: string;
  txHash: string;
  kind: NftInputKind;
}): Promise<void> {
  await safeExec(
    `INSERT INTO yuplink.nft_input_op AS j
       (id, wallet, contract, token_id, tx_hash, kind, status)
     VALUES(${sqlStr(`nop_${nanoid(10)}`)}, ${sqlStr(o.wallet)}, ${sqlStr(o.contract)},
            ${sqlStr(o.tokenId)}, ${sqlStr(o.txHash)}, ${sqlStr(o.kind)}, 'started')
     ON CONFLICT (contract, token_id, tx_hash) DO UPDATE SET
       wallet = EXCLUDED.wallet,
       kind = EXCLUDED.kind,
       status = CASE WHEN j.status = 'granted' THEN 'granted' ELSE 'started' END,
       error = CASE WHEN j.status = 'granted' THEN j.error ELSE NULL END,
       updated_at = now();`,
    "start",
  );
}

/** Выдача прошла: фиксируем, что именно выдано (id грантов или фишки). */
export async function journalGranted(o: {
  contract: string;
  tokenId: string;
  txHash: string;
  grantIds: string[];
  /**
   * Перевод зачтён без своей выдачи (выдано вне кругов): уже записанную выдачу
   * не перетираем — параллельный запрос того же перевода мог её только что внести.
   */
  keepGranted?: boolean;
}): Promise<void> {
  const ids = JSON.stringify(o.grantIds);
  await safeExec(
    `UPDATE yuplink.nft_input_op
        SET status='granted', grant_ids=${sqlStr(ids)}::jsonb, error=NULL, updated_at=now()
      WHERE contract=${sqlStr(o.contract)} AND token_id=${sqlStr(o.tokenId)}
        AND tx_hash=${sqlStr(o.txHash)}${o.keepGranted ? " AND status <> 'granted'" : ""};`,
    "granted",
  );
}

/**
 * Операция встала. Уже выданную (granted) не перетираем: сначала выдали, потом
 * упал побочный шаг — бокс у игрока есть, и жалоба разбирается не отсюда.
 */
export async function journalFailed(o: {
  contract: string;
  tokenId: string;
  txHash: string;
  error: string;
}): Promise<void> {
  await safeExec(
    `UPDATE yuplink.nft_input_op
        SET status='failed', error=${sqlStr(o.error.slice(0, 500))}, updated_at=now()
      WHERE contract=${sqlStr(o.contract)} AND token_id=${sqlStr(o.tokenId)}
        AND tx_hash=${sqlStr(o.txHash)} AND status <> 'granted';`,
    "failed",
  );
}
