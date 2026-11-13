// Сверка индексатора с записями игры (владелец, 06.11.2026: «подробная и чёткая система
// наблюдения и сверки»). Одна команда — все расхождения строками (вид, важность, ключ,
// подробности); вторая — числа для истории. Окно — с полного покрытия индексатора
// (RECON_SINCE), но не дальше 30 дней; свежие (младше GRACE) не судим — зачисление и
// подтверждение сети ещё идут.
import { sqlStr } from "@/server/api/raid-shared";

/** С этого момента индексатор видит каждую транзакцию своих адресов (опрос адресов с 01.11 вечера). */
export const RECON_SINCE = "2026-11-02T00:00:00Z";
const GRACE = "interval '15 minutes'";
const HASH_RE = "'^[1-9A-HJ-NP-Za-km-z]{43,44}$'";
const W = `GREATEST(${sqlStr(RECON_SINCE)}::timestamptz, now() - interval '30 days')`;

/** Хэши наших исходящих: выплаты, вывод NFT, пачки денег (обмены, раздачи). */
const OUT_HASHES = `
  SELECT tx_hash AS h FROM yuplink.redemptions WHERE tx_hash IS NOT NULL
  UNION SELECT processing_tx_hash FROM yuplink.redemptions WHERE processing_tx_hash IS NOT NULL
  UNION SELECT fee_tx_hash FROM yuplink.redemptions WHERE fee_tx_hash IS NOT NULL
  UNION SELECT tx_hash FROM yuplink.admin_payouts_pending WHERE tx_hash IS NOT NULL
  UNION SELECT jsonb_array_elements_text(tx_hashes) FROM yuplink.admin_batch_payouts_pending
         WHERE jsonb_typeof(tx_hashes) = 'array'
  UNION SELECT tx_hash FROM yuplink.nft_redemptions WHERE tx_hash IS NOT NULL
  UNION SELECT processing_tx_hash FROM yuplink.nft_redemptions WHERE processing_tx_hash IS NOT NULL
  UNION SELECT fee_tx_hash FROM yuplink.nft_redemptions WHERE fee_tx_hash IS NOT NULL
  UNION SELECT tx_hash FROM yuplink.hallway_blockchain_rewards WHERE tx_hash IS NOT NULL
  UNION SELECT open_tx FROM yuplink.nft_token_cycle WHERE open_tx IS NOT NULL
  UNION SELECT close_tx FROM yuplink.nft_token_cycle WHERE close_tx IS NOT NULL
  UNION SELECT jsonb_path_query(steps, '$[*].hash') #>> '{}' FROM yuplink.money_batch`;

/** Хэши наших входящих: пополнения, покупки за токены, вводы NFT, приход обменов. */
const IN_HASHES = `
  SELECT tx_hash AS h FROM yuplink.acc_deposit_tx
  UNION SELECT tx_hash FROM yuplink.darai_deposits WHERE tx_hash IS NOT NULL
  UNION SELECT tx_hash FROM yuplink.energy_pack_purchases WHERE tx_hash IS NOT NULL
  UNION SELECT near_tx_hash FROM yuplink.ticket_purchases WHERE near_tx_hash IS NOT NULL
  UNION SELECT tx_hash FROM yuplink.credit_wait WHERE tx_hash IS NOT NULL
  UNION SELECT tx_hash FROM yuplink.nft_input_op WHERE tx_hash IS NOT NULL
  UNION SELECT tx_hash FROM yuplink.nft_input_used WHERE tx_hash IS NOT NULL
  UNION SELECT jsonb_path_query(steps, '$[*].hash') #>> '{}' FROM yuplink.money_batch`;

/** Последний снимок владельцев NFT у Sendler — крон в 05:00 UTC (с запасом 15 мин). */
const SNAP = `(CASE WHEN now() >= date_trunc('day', now()) + interval '5 hours 15 minutes'
                    THEN date_trunc('day', now()) + interval '5 hours'
                    ELSE date_trunc('day', now()) - interval '19 hours' END)`;

const inList = (xs: readonly string[]) => xs.map(sqlStr).join(", ") || "''";

/** Все расхождения: kind, severity, key, detail. */
export function reconIssuesSql(
  accounts: readonly string[],
  nftContracts: readonly string[],
): string {
  const acc = inList(accounts);
  const nft = inList(nftContracts);
  return `WITH outh AS (${OUT_HASHES}), inh AS (${IN_HASHES})
  -- 1. Sendler зачислил пополнение, а в сети такого перевода на наш кошелёк нет.
  SELECT 'deposit_not_on_chain' AS kind, 'alarm' AS severity, d.tx_hash AS key,
         jsonb_build_object('at', d.created_at, 'wallet', d.wallet, 'token', d.token, 'amount', d.amount) AS detail
    FROM yuplink.acc_deposit_tx d
   WHERE d.created_at >= ${W} AND d.created_at < now() - ${GRACE}
     AND NOT EXISTS (SELECT 1 FROM yuplink.chain_ft f WHERE f.tx_hash = d.tx_hash AND f.to_id IN (${acc}))
  UNION ALL
  -- 2. В сети пришло на наш кошелёк, а в игре нигде не зачтено.
  SELECT 'chain_not_credited', 'alarm', f.tx_hash,
         jsonb_build_object('at', f.block_at, 'from', f.from_id, 'token', f.token, 'amount', f.amount, 'memo', f.memo)
    FROM yuplink.chain_ft f
   WHERE f.to_id IN (${acc}) AND f.from_id NOT IN (${acc})
     AND f.block_at >= ${W} AND f.block_at < now() - ${GRACE}
     AND NOT EXISTS (SELECT 1 FROM inh WHERE inh.h = f.tx_hash)
     AND NOT EXISTS (SELECT 1 FROM outh WHERE outh.h = f.tx_hash)
  UNION ALL
  -- 3. Сумма зачисления не совпала с суммой в сети.
  SELECT 'deposit_amount_mismatch', 'alarm', d.tx_hash,
         jsonb_build_object('at', d.created_at, 'wallet', d.wallet, 'token', d.token, 'credited', d.amount, 'chain', s.amt)
    FROM yuplink.acc_deposit_tx d
    JOIN yuplink.reward_tokens rt ON lower(rt.symbol) = lower(d.token) AND rt.ft_contract IS NOT NULL AND rt.ft_contract <> ''
    JOIN LATERAL (SELECT sum(f.amount::numeric) / power(10::numeric, rt.decimals) AS amt, count(*) AS n
                    FROM yuplink.chain_ft f
                   WHERE f.tx_hash = d.tx_hash AND f.to_id IN (${acc}) AND f.token = rt.ft_contract) s ON s.n > 0
   WHERE d.created_at >= ${W} AND abs(s.amt - d.amount) > GREATEST(0.000001, abs(d.amount) * 0.000000001)
  UNION ALL
  -- 4. С нашего кошелька ушло, а записи о выплате у нас нет (чужая трата — проверить ключ).
  SELECT 'payout_not_recorded', 'alarm', f.tx_hash,
         jsonb_build_object('at', f.block_at, 'to', f.to_id, 'token', f.token, 'amount', f.amount, 'memo', f.memo)
    FROM yuplink.chain_ft f
   WHERE f.from_id IN (${acc}) AND f.to_id NOT IN (${acc})
     AND f.block_at >= ${W} AND f.block_at < now() - ${GRACE}
     AND NOT EXISTS (SELECT 1 FROM outh WHERE outh.h = f.tx_hash)
  UNION ALL
  -- 5. Выплата у нас «оплачена» с хэшем, а в сети её с нашего кошелька нет.
  SELECT 'payout_not_on_chain', 'alarm', r.tx_hash,
         jsonb_build_object('at', r.redeemed_at, 'wallet', r.wallet, 'token', r.reward_token, 'amount', r.amount, 'src', 'redemption')
    FROM yuplink.redemptions r
   WHERE r.status = 'paid' AND r.tx_hash ~ ${HASH_RE}
     AND r.redeemed_at >= ${W} AND r.redeemed_at < now() - ${GRACE}
     AND NOT EXISTS (SELECT 1 FROM yuplink.chain_ft f WHERE f.tx_hash = r.tx_hash AND f.from_id IN (${acc}))
  UNION ALL
  SELECT 'payout_not_on_chain', 'alarm', p.tx_hash,
         jsonb_build_object('at', p.approved_at, 'wallet', p.recipient, 'token', p.reward_symbol, 'amount', p.amount_human, 'src', 'admin')
    FROM yuplink.admin_payouts_pending p
   WHERE p.tx_hash ~ ${HASH_RE} AND p.approved_at >= ${W} AND p.approved_at < now() - ${GRACE}
     AND NOT EXISTS (SELECT 1 FROM yuplink.chain_ft f WHERE f.tx_hash = p.tx_hash AND f.from_id IN (${acc}))
  UNION ALL
  -- 6. Владелец NFT у Sendler и в сети разный, и это не свежий переход после его снимка.
  SELECT 'nft_owner_differs', 'warn', o.contract || ':' || o.token_id,
         jsonb_build_object('sendler', n.owner_wallet, 'chain', o.owner, 'moved', o.at)
    FROM yuplink.chain_nft_owner o
    JOIN yuplink.nfts n ON n.contract_id = o.contract AND n.token_id = o.token_id
   WHERE o.contract IN (${nft}) AND o.owner IS NOT NULL AND n.owner_wallet IS NOT NULL
     AND o.owner <> n.owner_wallet AND (o.at IS NULL OR o.at < ${SNAP})`;
}

/** Числа прогона: за сутки и за окно сверки. */
export function reconStatsSql(
  accounts: readonly string[],
  nftContracts: readonly string[],
): string {
  const acc = inList(accounts);
  const nft = inList(nftContracts);
  const day = "now() - interval '24 hours'";
  return `WITH outh AS (${OUT_HASHES}), inh AS (${IN_HASHES}),
    din AS (SELECT * FROM yuplink.chain_ft WHERE to_id IN (${acc}) AND from_id NOT IN (${acc}) AND block_at >= ${W}),
    dout AS (SELECT * FROM yuplink.chain_ft WHERE from_id IN (${acc}) AND to_id NOT IN (${acc}) AND block_at >= ${W}),
    dep AS (SELECT * FROM yuplink.acc_deposit_tx WHERE created_at >= ${W}),
    own AS (SELECT o.owner AS c, n.owner_wallet AS s, o.at
              FROM yuplink.chain_nft_owner o
              FULL JOIN yuplink.nfts n ON n.contract_id = o.contract AND n.token_id = o.token_id
             WHERE coalesce(o.contract, n.contract_id) IN (${nft}))
  SELECT jsonb_build_object(
    'since', ${W},
    'deposits', jsonb_build_object(
      'sendler', (SELECT count(*) FROM dep), 'sendler24', (SELECT count(*) FROM dep WHERE created_at >= ${day}),
      'matched', (SELECT count(*) FROM dep WHERE EXISTS (SELECT 1 FROM din WHERE din.tx_hash = dep.tx_hash)),
      'chainIn', (SELECT count(DISTINCT tx_hash) FROM din), 'chainIn24', (SELECT count(DISTINCT tx_hash) FROM din WHERE block_at >= ${day}),
      'credited', (SELECT count(DISTINCT tx_hash) FROM din WHERE EXISTS (SELECT 1 FROM inh WHERE inh.h = din.tx_hash) OR EXISTS (SELECT 1 FROM outh WHERE outh.h = din.tx_hash))),
    'payouts', jsonb_build_object(
      'chainOut', (SELECT count(DISTINCT tx_hash) FROM dout), 'chainOut24', (SELECT count(DISTINCT tx_hash) FROM dout WHERE block_at >= ${day}),
      'recorded', (SELECT count(DISTINCT tx_hash) FROM dout WHERE EXISTS (SELECT 1 FROM outh WHERE outh.h = dout.tx_hash))),
    'nft', jsonb_build_object(
      'total', (SELECT count(*) FROM own), 'same', (SELECT count(*) FROM own WHERE c = s),
      'burnedOurs', (SELECT count(*) FROM own WHERE c IS NULL AND s IS NOT NULL AND at IS NOT NULL),
      'movedAfterSnap', (SELECT count(*) FROM own WHERE c IS NOT NULL AND s IS NOT NULL AND c <> s AND at >= ${SNAP}),
      'differs', (SELECT count(*) FROM own WHERE c IS NOT NULL AND s IS NOT NULL AND c <> s AND (at IS NULL OR at < ${SNAP})),
      'onlyOurs', (SELECT count(*) FROM own WHERE s IS NULL AND c IS NOT NULL),
      'onlySendler', (SELECT count(*) FROM own WHERE c IS NULL AND s IS NOT NULL AND at IS NULL)),
    'health', (SELECT to_jsonb(h) - 'name' FROM yuplink.chain_health h WHERE h.name = 'indexer'),
    'cursors', (SELECT jsonb_object_agg(name, jsonb_build_object('blockAt', block_at, 'updatedAt', updated_at)) FROM yuplink.chain_cursor)
  ) AS stats`;
}
