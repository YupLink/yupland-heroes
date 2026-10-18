// Догон пополнений счёта: перевод прошёл on-chain, на счёт не зачислен.
//
// Живой случай 29.08: игрок дважды нажал «Пополнить» и отправил 300 000 и
// 500 000 RF. Обе транзакции успешны, у обеих метка «yuplink account top-up» —
// то есть он всё сделал через кнопку. Но зачисление происходит вторым шагом,
// когда клиент докладывает серверу о подписанной квитанции, и этот доклад до
// сервера не дошёл. Денег на счету не появилось, а подобрать их было некому:
// догон билетов такие переводы сознательно пропускает, чтобы не считать
// сиротами (lost-payments-tickets), своего у пополнений не было вовсе.
//
// Теперь есть. Логика та же, что у энергии: берём входящие переводы, читаем
// метку из САМОЙ транзакции (истории доверять нельзя), и всё, что помечено
// пополнением и ещё не зачтено, кладём на счёт отправителя.
import { fetchAdminFtTransferHistory } from "@/server/sendler";
import { sb } from "@/server/db/pg";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/chips-utils";
import { OPERATING_WALLET } from "@/server/api/currency/treasury";
import { readTopUpMemo, TOP_UP_MEMO } from "./lost-payments-account-memo";

/** Не лезем в древность: догоняем только свежие переводы. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type AccountReconcileResult = {
  scanned: number;
  credited: number;
  skippedKnown: number;
  skippedNoMemo: number;
  skippedNoAccount: number;
};

/** Квитанции, которые уже где-то зачтены: пополнением, паком или билетами. */
async function knownTx(): Promise<Set<string>> {
  const rows = (await mcpExec(
    `SELECT lower(tx_hash) AS tx FROM yuplink.acc_deposit_tx
      WHERE created_at > now() - interval '30 days'
     UNION SELECT lower(tx_hash) FROM yuplink.darai_deposits
      WHERE created_at > now() - interval '30 days'
     UNION SELECT lower(tx_hash) FROM yuplink.redemptions
      WHERE tx_hash IS NOT NULL AND redeemed_at > now() - interval '30 days';`,
    { wrapJson: true },
  )) as Array<{ tx: string }>;
  return new Set((rows ?? []).map((r) => r.tx));
}

/** Аккаунт и канонический кошелёк отправителя — на чей счёт класть. */
async function accountOf(wallet: string): Promise<{ account: string; wallet: string } | null> {
  const rows = (await mcpExec(
    `SELECT account_id, wallet FROM yuplink.users
      WHERE wallet = ${sqlStr(wallet)} AND account_id IS NOT NULL LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ account_id: string; wallet: string }>;
  const row = rows?.[0];
  return row?.account_id ? { account: row.account_id, wallet: row.wallet } : null;
}

/**
 * Найти и зачислить пополнения, потерявшиеся между подписью и докладом.
 *
 * Сумму округляем ВНИЗ до целого — ровно как обычное пополнение
 * (currency/deposit): счёт ведётся целыми, остаток остаётся на кошельке
 * проекта. Идемпотентность держит acc_deposit_apply: первичный ключ на хэше,
 * так что повторный прогон крона ничего не задвоит.
 */
/** Токен из нашего реестра: сначала по ft-контракту, затем по символу. */
async function tokenOf(
  symbol: string,
  ftContract: string,
): Promise<{ symbol: string; decimals: number } | null> {
  const { pg } = await import("../db/pg");
  const rows = (await pg.rewardTokens.findMany()) as Array<{
    symbol: string;
    ft_contract: string;
    decimals: number;
  }>;
  const byContract = ftContract
    ? rows.find((r) => r.ft_contract === ftContract)
    : undefined;
  const bySymbol = symbol
    ? rows.find((r) => r.symbol.toLowerCase() === symbol.trim().toLowerCase())
    : undefined;
  const hit = byContract ?? bySymbol;
  return hit ? { symbol: hit.symbol, decimals: Number(hit.decimals) } : null;
}

export async function runAccountTopUpReconcile(): Promise<AccountReconcileResult> {
  const out: AccountReconcileResult = {
    scanned: 0,
    credited: 0,
    skippedKnown: 0,
    skippedNoMemo: 0,
    skippedNoAccount: 0,
  };

  const done = await knownTx();
  const inc = await fetchAdminFtTransferHistory({
    walletId: OPERATING_WALLET,
    direction: "in",
    limit: 200,
  });
  const minTs = Date.now() - MAX_AGE_MS;

  for (const t of inc) {
    out.scanned++;
    const tx = (t.txHash ?? "").trim();
    if (!tx) continue;
    if (done.has(tx.toLowerCase())) {
      out.skippedKnown++;
      continue;
    }
    const ts = t.blockTimestampNs ? Number(t.blockTimestampNs) / 1e6 : NaN;
    if (Number.isFinite(ts) && ts < minTs) continue;

    const info = readTopUpMemo(t);
    if (!info || !info.memo.toLowerCase().includes(TOP_UP_MEMO)) {
      out.skippedNoMemo++;
      continue;
    }

    const who = await accountOf(info.signer);
    if (!who) {
      out.skippedNoAccount++;
      continue;
    }

    // Sendler отдаёт СЫРУЮ сумму (3000 HOPE = 3000×10^18). Без деления на
    // знаки токена на счёт падало число в тысячу триллионов раз больше — так
    // 30.08 у игрока оказалось 3e21 HOPE, и он купил на них энергии.
    //
    // Знаки берём из НАШЕГО реестра (он авторитет), символ — оттуда же:
    // индексер пишет иначе (у нас USDT, у него USDt), а по такому символу
    // acc_move не нашёл бы токен вовсе.
    const rawRow = (t.raw ?? {}) as Record<string, unknown>;
    const tok = await tokenOf(String(t.symbol ?? ""), String(rawRow.ft_contract ?? ""));
    if (!tok) continue;
    const { rawToHuman } = await import("../near");
    const human = Number(rawToHuman(String(t.amount ?? "0"), tok.decimals));
    const amount = Math.floor(human);
    const symbol = tok.symbol;
    if (!(amount > 0)) continue;

    const { error } = await sb.rpc("acc_deposit_apply", {
      p_account: who.account,
      p_wallet: who.wallet,
      p_token: symbol,
      p_amount: amount,
      p_tx: tx,
    });
    if (error) {
      // «Квитанцию уже потратили» — штатный исход гонки с самим игроком:
      // он мог дожать доклад ровно в этот момент. Остальное стоит видеть.
      if (!/tx_already_used|duplicate key/i.test(String(error.message ?? ""))) {
        console.warn(`[lost-payments] пополнение ${tx.slice(0, 10)} не зачлось:`, error.message);
      }
      out.skippedKnown++;
      continue;
    }
    done.add(tx.toLowerCase());
    out.credited++;
    console.log(
      `[lost-payments] догон пополнения: ${who.wallet} +${amount} ${symbol} (tx ${tx.slice(0, 10)})`,
    );
  }
  return out;
}
