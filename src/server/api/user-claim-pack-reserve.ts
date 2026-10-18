// Бронь клейма ПЕРЕД выдачей пака.
//
// Порядок был обратный: сначала выдавали паки, потом писали строку клейма.
// Строка клейма — это и есть замок «эту NFT уже гасили» (уникальный индекс по
// кампании, контракту и токену), причём замок ГЛОБАЛЬНЫЙ, а предварительный
// отсев в коде смотрит только свои кошельки. NFT, погашенная прежним
// владельцем, отсев проходила, паки выдавались, вставка падала — и ошибку
// гасили в console.warn. В проде так набежало 1110 лишних паков на 23 кошелька.
import { nanoid } from "nanoid";
import { pg } from "../db/pg";

/**
 * Строка клейма под пак. Одна и та же в трёх местах выдачи — раньше жила
 * тройной копипастой, и правка в одном месте расходилась с двумя другими.
 */
export function packRedemptionRow(a: {
  dropId: string;
  contractId: string;
  tokenId: string;
  wallet: string;
  rewardToken: string;
  ticketCost: number;
  redeemedAt: string;
  id?: string;
}) {
  return {
    id: a.id ?? nanoid(),
    contract_id: a.contractId,
    token_id: a.tokenId,
    campaign_id: a.dropId,
    wallet: a.wallet,
    amount: 0,
    tx_hash: null,
    status: "paid",
    reward_token: a.rewardToken,
    ft_contract: null,
    decimals: null,
    ticket_cost: a.ticketCost,
    redeemed_at: a.redeemedAt,
  };
}

function isDuplicate(e: unknown): boolean {
  const msg = String(e instanceof Error ? e.message : e);
  return /duplicate key|already exists|23505|unique constraint/i.test(msg);
}

/**
 * Забронировать клейм и выдать паки. Возвращает сколько выдано;
 * `null` — эту NFT уже погасили (не обязательно мы), выдавать нечего.
 *
 * Бронь снимается, если выдать не удалось: иначе NFT останется «погашенной»
 * без единого пака в руках.
 */
export async function claimPacksReserved(opts: {
  /** Одна строка или набор (комбо гасит несколько NFT разом). */
  redemption?: Record<string, unknown> & { id: string };
  redemptions?: Array<Record<string, unknown> & { id: string }>;
  grant: () => Promise<number>;
}): Promise<number | null> {
  const rows = opts.redemptions ?? (opts.redemption ? [opts.redemption] : []);
  if (rows.length === 0) throw new Error("claimPacksReserved: нечего бронировать");

  const done: string[] = [];
  const undo = async () => {
    for (const id of done) {
      await pg.redemptions.delete({ id } as never).catch(() => undefined);
    }
  };

  for (const row of rows) {
    try {
      await pg.redemptions.insert(row as never);
      done.push(row.id);
    } catch (e) {
      // Часть набора уже погашена — снимаем свою бронь целиком и уходим.
      await undo();
      if (isDuplicate(e)) return null;
      throw e;
    }
  }

  let granted = 0;
  try {
    granted = await opts.grant();
  } catch (e) {
    await undo();
    throw e;
  }
  if (granted === 0) {
    await undo();
    return 0;
  }
  return granted;
}
