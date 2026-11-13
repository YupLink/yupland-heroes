// Разбор исполненных чеков NEAR (receipt execution outcomes) — источник любой: транзакции из
// tx.main.fastnear.com (chain-indexer). Чистая функция — без сети и базы: чеки и список «что
// смотреть» на входе, строки на выходе; у каждой строки — высота и время своего блока.
//
// Токены (NEP-141): событие EVENT_JSON {standard:"nep141"} или старые строки контрактов tkn.near —
// «Transfer N from A to B», «Refund N from B to A», следом «Memo: …» (DARAI событий не пишет,
// проверено 02.11.2026). Строку принимаем ТОЛЬКО от самого контракта токена из нашего списка:
// любой контракт может напечатать «Transfer …», и чужой подделал бы оплату. Есть событие — старые
// строки того же чека не читаем (иначе один перевод записался бы дважды).
// NFT (NEP-171): все события наших контрактов — mint / transfer / burn по каждому token_id.
// Неуспешный чек (Failure) пропускаем целиком: его перевод не состоялся.

export type ChainWatch = {
  /** Наши кошельки: перевод токена пишем, если он — отправитель или получатель. */
  accounts: ReadonlySet<string>;
  /** Контракты токенов (reward_tokens.ft_contract) — только от них верим строкам о переводах. */
  tokens: ReadonlySet<string>;
  /** Наши NFT-контракты — их события пишем все. */
  nftContracts: ReadonlySet<string>;
};

export type FtRow = {
  id: string;
  height: number;
  atMs: number;
  txHash: string | null;
  receiptId: string;
  token: string;
  kind: "transfer" | "refund" | "mint" | "burn";
  from: string | null;
  to: string | null;
  amount: string;
  memo: string | null;
};

export type NftRow = {
  id: string;
  height: number;
  atMs: number;
  txHash: string | null;
  receiptId: string;
  contract: string;
  event: "mint" | "transfer" | "burn";
  tokenId: string;
  from: string | null;
  to: string | null;
  memo: string | null;
};

export type Parsed = { ft: FtRow[]; nft: NftRow[] };

/** Исполненный чек: кто исполнил, логи, итог, свой блок. */
export type OutcomeItem = {
  txHash: string | null;
  receiptId: string;
  executor: string;
  logs: string[];
  status: unknown;
  height: number;
  atMs: number;
};

const ACC = "([a-z0-9._-]+)";
const TRANSFER_RE = new RegExp(`^Transfer (\\d+) from ${ACC} to ${ACC}$`);
const REFUND_RE = new RegExp(`^Refund (\\d+) from ${ACC} to ${ACC}$`);
const MEMO_RE = /^Memo: ([\s\S]*)$/;
const DIGITS = /^\d+$/;

const ok = (status: unknown): boolean =>
  !!status &&
  typeof status === "object" &&
  ("SuccessValue" in status || "SuccessReceiptId" in status);

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

type Event = { standard?: string; event?: string; data?: unknown };

function event(log: string): Event | null {
  if (!log.startsWith("EVENT_JSON:")) return null;
  try {
    const e = JSON.parse(log.slice(11)) as Event;
    return e && typeof e === "object" ? e : null;
  } catch {
    return null;
  }
}

const items = (e: Event): Array<Record<string, unknown>> =>
  Array.isArray(e.data)
    ? (e.data.filter((x) => x && typeof x === "object") as Array<Record<string, unknown>>)
    : [];

/** Перевод токена из события NEP-141. */
function ftFromEvent(
  e: Event,
): Array<Omit<FtRow, "id" | "txHash" | "receiptId" | "token" | "height" | "atMs">> {
  const kind =
    e.event === "ft_transfer"
      ? "transfer"
      : e.event === "ft_mint"
        ? "mint"
        : e.event === "ft_burn"
          ? "burn"
          : null;
  if (!kind) return [];
  return items(e).flatMap((d) => {
    const amount = String(d.amount ?? "");
    if (!DIGITS.test(amount)) return [];
    const from =
      kind === "transfer" ? str(d.old_owner_id) : kind === "burn" ? str(d.owner_id) : null;
    const to = kind === "transfer" ? str(d.new_owner_id) : kind === "mint" ? str(d.owner_id) : null;
    return [{ kind, from, to, amount, memo: str(d.memo) }];
  });
}

/** События NEP-171 → по строке на каждый token_id. */
function nftFromEvent(
  e: Event,
): Array<Omit<NftRow, "id" | "txHash" | "receiptId" | "contract" | "height" | "atMs">> {
  const ev =
    e.event === "nft_mint"
      ? "mint"
      : e.event === "nft_transfer"
        ? "transfer"
        : e.event === "nft_burn"
          ? "burn"
          : null;
  if (!ev) return [];
  return items(e).flatMap((d) => {
    const ids = Array.isArray(d.token_ids) ? d.token_ids.map(String) : [];
    const from = ev === "transfer" ? str(d.old_owner_id) : ev === "burn" ? str(d.owner_id) : null;
    const to = ev === "transfer" ? str(d.new_owner_id) : ev === "mint" ? str(d.owner_id) : null;
    return ids.map((tokenId) => ({ event: ev, tokenId, from, to, memo: str(d.memo) }));
  });
}

/** Время блока в мс (timestamp — строка наносекунд). */
export function nanosToMs(ts: unknown): number {
  try {
    return Number(BigInt(String(ts ?? 0)) / 1_000_000n);
  } catch {
    return 0;
  }
}

export function parseOutcomes(list: readonly OutcomeItem[], watch: ChainWatch): Parsed {
  const ft: FtRow[] = [];
  const nft: NftRow[] = [];
  const mine = (a: string | null) => !!a && watch.accounts.has(a);
  for (const o of list) {
    const executor = o.executor;
    const receiptId = o.receiptId;
    if (!receiptId || !ok(o.status)) continue;
    const isToken = watch.tokens.has(executor);
    const isNft = watch.nftContracts.has(executor);
    if (!isToken && !isNft) continue;
    const { logs, txHash, height, atMs } = o;
    const base = { txHash, receiptId, height, atMs };
    const events = logs.map(event);
    const hasFtEvent = events.some((e) => e?.standard === "nep141");
    let lastFt: FtRow | null = null;
    logs.forEach((log, n) => {
      const e = events[n];
      if (e?.standard === "nep141" && isToken) {
        ftFromEvent(e).forEach((d, k) => {
          if (mine(d.from) || mine(d.to))
            ft.push({ id: `${receiptId}:${n}:${k}`, ...base, token: executor, ...d });
        });
        return;
      }
      if (e?.standard === "nep171" && isNft) {
        for (const d of nftFromEvent(e)) {
          nft.push({ id: `${receiptId}:${n}:${d.tokenId}`, ...base, contract: executor, ...d });
        }
        return;
      }
      if (!isToken || hasFtEvent) return;
      const memo = MEMO_RE.exec(log);
      if (memo && lastFt) {
        lastFt.memo = memo[1];
        return;
      }
      const m = TRANSFER_RE.exec(log) ?? REFUND_RE.exec(log);
      lastFt = null;
      if (!m) return;
      const row: FtRow = {
        id: `${receiptId}:${n}`,
        ...base,
        token: executor,
        kind: log.startsWith("Refund") ? "refund" : "transfer",
        from: m[2],
        to: m[3],
        amount: m[1],
        memo: null,
      };
      if (mine(row.from) || mine(row.to)) {
        ft.push(row);
        lastFt = row;
      }
    });
  }
  return { ft, nft };
}
