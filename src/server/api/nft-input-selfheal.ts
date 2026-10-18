// Самолечение ввода NFT: игрок открыл игру — его недоехавший пак ищется сразу.
//
// Зачем: догон жил только в кроне (раз в полчаса), и игрок успевал написать в
// чат раньше, чем система чинилась сама. Открытие игры — самый ранний момент,
// когда пострадавший гарантированно рядом: он же только что отправил NFT.
//
// Цена вопроса держится низкой тремя приёмами:
//   1. Троттлинг в памяти процесса: один заход на кошелёк в 10 минут.
//   2. Дешёвая проверка сначала: два COUNT'а по индексам. У игрока, который
//      никогда не вводил NFT и ничего не выводил, на этом всё и кончается.
//   3. Дорогой шаг (личная история в Sendler) — только тем, у кого есть повод:
//      свежий ввод, NFT «на руках» или незавершённая операция в журнале.
//
// Ожидающий игрок (ввод прошёл, Sendler не успел подтвердить) идёт БЕЗ очереди:
// ему обещано «в течение минуты», а не «в течение десяти».
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";
import { journalUnfinished } from "./nft-input-journal-read";
import { chasePendingInput, hasPendingInput } from "./nft-input-pending";
import { recoverWallet } from "./nft-input-recover-target";

const CHECK_TTL_MS = 10 * 60_000;
/** Больше этого числа кошельков в памяти не держим — карта чистится целиком. */
const MAX_TRACKED = 5000;

const lastCheck = new Map<string, number>();

function throttled(wallet: string): boolean {
  const at = lastCheck.get(wallet);
  if (at != null && Date.now() - at < CHECK_TTL_MS) return true;
  if (lastCheck.size > MAX_TRACKED) lastCheck.clear();
  lastCheck.set(wallet, Date.now());
  return false;
}

/** Есть ли у игрока вообще повод искать сироту. Два счётчика, один запрос. */
async function hasInputActivity(wallet: string): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT
       (SELECT count(*) FROM yuplink.nft_input_used u
         WHERE u.wallet=${sqlStr(wallet)} AND u.used_at > now() - interval '48 hours')::int AS recent_inputs,
       (SELECT count(*) FROM yuplink.chip_nft_mints m
         WHERE m.minted_by=${sqlStr(wallet)} AND m.returned_at IS NULL)::int AS out_chips;`,
    { wrapJson: true },
  )) as Array<{ recent_inputs: number; out_chips: number }>;
  const r = rows[0];
  return !!r && (Number(r.recent_inputs) > 0 || Number(r.out_chips) > 0);
}

/**
 * Тихо и best-effort: любая ошибка гасится, вызывающий (getSession) не должен
 * ни ждать результат, ни знать о нём.
 */
export async function selfHealNftInputs(wallet: string | null): Promise<void> {
  if (!wallet) return;
  // Ожидающему очередь не помеха: обещание «в течение минуты» важнее экономии.
  const waiting = hasPendingInput(wallet);
  if (!waiting && throttled(wallet)) return;
  try {
    if (waiting) {
      const granted = await chasePendingInput(wallet);
      if (granted > 0) {
        console.log(`[nft-input-selfheal] ${wallet}: догнали ${granted} по ожиданию`);
      }
      return;
    }

    // Незавершённая операция в журнале — самый точный сигнал: ввод начался и не
    // дошёл до выдачи. Но выдаём НЕ по ней: журнал теперь заводит и ввод, чей
    // перевод ещё не подтверждён, а значит в строке лежит то, что прислал
    // клиент. Строка служит поводом, а кто и что прислал — заново разбирает
    // Sendler по личной истории кошелька.
    const stuck = await journalUnfinished({ wallet, minAgeMin: 1, limit: 10 });
    if (stuck.length > 0) {
      const granted = await chasePendingInput(wallet);
      console.log(
        `[nft-input-selfheal] ${wallet}: незавершённых в журнале ${stuck.length}, догнали ${granted}`,
      );
      return;
    }

    if (!(await hasInputActivity(wallet))) return;
    const r = await recoverWallet(wallet);
    if (r.summary.granted > 0) {
      console.log(
        `[nft-input-selfheal] ${wallet}: догнали ${r.summary.granted} по личной истории ` +
          `(паков ${r.summary.packs}, фишек ${r.summary.chips})`,
      );
    }
  } catch (e) {
    console.warn("[nft-input-selfheal] пропущено:", e instanceof Error ? e.message : e);
  }
}
