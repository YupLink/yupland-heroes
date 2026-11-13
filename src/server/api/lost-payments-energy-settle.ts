// Зачёт ОДНОГО оплаченного перевода энергии. Вынесено из крон-догона, чтобы
// тем же кодом можно было закрыть оплату игрока сразу по клику, не дожидаясь
// получаса до следующего запуска крона (§13.1).
import { mcpExec } from "@/server/db/mcpClient";
import { isEnergyTransferAccepted } from "@/lib/energyPayAllowed";
import { sqlStr } from "./raid-shared";

export const ENERGY_RECEIVER = "darai_gdrop.near";

export type EnergyPackRow = {
  id: string;
  amount: number;
  price_steps: unknown;
  price_token_symbol: string | null;
  price_token_amount: number | null;
  price_darai: number | null;
};

/** decimals токенов — сумма в истории Sendler приходит в сырых юнитах. */
export async function tokenDecimals(symbol: string): Promise<number | null> {
  if (!symbol.trim()) return null;
  const rows = (await mcpExec(
    `SELECT decimals FROM yuplink.reward_tokens
      WHERE lower(symbol) = lower(${sqlStr(symbol.trim())}) LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ decimals: number | null }>;
  const d = rows?.[0]?.decimals;
  return d == null ? null : Number(d);
}

/** Сырые юниты → человеческая сумма (5000000000000000000000 → 5000). */
export function rawToHuman(raw: number | string, decimals: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return NaN;
  return n / 10 ** decimals;
}

export type SettleOutcome =
  | { ok: true; wallet: string; packId: string; energy: number }
  | { ok: false; reason: "no_memo" | "cheap" | "known" | "bad_tx" | "not_allowed" };

/** Активные паки — по ним разбираем memo `buy energy pack {id}`. */
export async function loadEnergyPacks(): Promise<Map<string, EnergyPackRow>> {
  const rows = (await mcpExec(
    `SELECT id, amount, price_steps, price_token_symbol, price_token_amount, price_darai
       FROM yuplink.energy_packs WHERE active = true;`,
    { wrapJson: true },
  )) as EnergyPackRow[];
  return new Map((rows ?? []).map((p) => [p.id, p]));
}

/** Транзакции, по которым энергия уже зачтена (в т.ч. старым ключом). */
export async function knownEnergyTx(): Promise<Set<string>> {
  const rows = (await mcpExec(
    `SELECT lower(COALESCE(tx_hash, split_part(idempotency_key, ':', 2))) AS tx
       FROM yuplink.energy_pack_purchases
      WHERE tx_hash IS NOT NULL OR idempotency_key LIKE 'ft:%';`,
    { wrapJson: true },
  )) as Array<{ tx: string | null }>;
  return new Set((rows ?? []).map((r) => r.tx).filter((x): x is string => !!x));
}

/**
 * Записывает покупку и начисляет энергию за уже прошедший on-chain перевод.
 * Идемпотентно по tx: ключ `ft:{tx}` уникален.
 */
export async function settleEnergyTransfer(args: {
  tx: string;
  symbol: string;
  paid: number;
  packs: Map<string, EnergyPackRow>;
  /** Метка и подписант ИЗ ЗАПИСИ Sendler — без похода в цепь (см. выше). */
  memo: string;
  signer: string;
  /** Время блока перевода, мс (Sendler blockTimestampNs / 1e6); NaN — неизвестно. */
  blockMs: number;
}): Promise<SettleOutcome> {
  const head = args.signer ? { memo: args.memo, signer: args.signer } : null;
  if (!head) return { ok: false, reason: "bad_tx" };

  const packId = head.memo.match(/buy energy pack (\S+)/)?.[1];
  const pack = packId ? args.packs.get(packId) : undefined;
  if (!packId || !pack) return { ok: false, reason: "no_memo" };

  // §8.61: энергопак за токен (USDT, magicdust, RF…) больше не продаётся.
  // Перевод, отправленный до среза, доезжает; позже — не зачитываем, а пишем
  // в лог для ручного разбора (lib/energyPayAllowed).
  if (!isEnergyTransferAccepted(args.symbol, args.blockMs)) {
    console.warn(
      `[energy-settle] токен не принимается: ${head.signer} ${args.paid} ${args.symbol} tx ${args.tx} пак ${packId}`,
    );
    return { ok: false, reason: "not_allowed" };
  }

  // Хватило ли суммы: сравниваем с САМОЙ ДЕШЁВОЙ ступенью этой валюты —
  // точную ступень задним числом не восстановить, а недоплату пропускать нельзя.
  // ⚠️ В истории Sendler сумма СЫРАЯ: без перевода в human сравнение с ценой
  // всегда проходило, и пак закрывался копеечным переводом.
  const decimals = await tokenDecimals(args.symbol);
  if (decimals == null) return { ok: false, reason: "cheap" };
  const paidHuman = rawToHuman(args.paid, decimals);
  const { cheapestPrice } = await import("./lost-payments-energy-price");
  const min = cheapestPrice(pack, args.symbol);
  if (min == null || !Number.isFinite(paidHuman) || !(paidHuman + 1e-9 >= min))
    return { ok: false, reason: "cheap" };

  const amount = Math.floor(pack.amount);
  // Оплату за DARAI записываем как darai: раньше любая оплата ложилась как
  // «token», и в истории покупок валюта была неверной.
  const isDarai = args.symbol.trim().toLowerCase() === "darai";

  // Выдаём ТОЙ ЖЕ функцией, что и обычная покупка. Раньше догон писал строку
  // и начислял энергию сам — мимо лестницы цен и мимо дневного лимита. Из-за
  // этого пак стоил первую ступень сколько угодно раз: в проде так прошло
  // восемь покупок ниже положенной цены за три дня.
  const { sb } = await import("../db/pg");
  const { getSisterWallets } = await import("./user-shared");
  const sisters = await getSisterWallets(head.signer).catch(() => [head.signer]);
  const { error } = await sb.rpc("buy_energy_pack_atomic", {
    p_wallet: head.signer,
    p_pack_id: packId,
    p_pay_with: isDarai ? "darai" : "token",
    p_sisters: sisters.length ? sisters : [head.signer],
    p_tickets_price: 0,
    p_idk: `ft:${args.tx}`,
    p_token_symbol: isDarai ? null : args.symbol,
    p_token_amount: isDarai ? 0 : paidHuman,
    p_price: isDarai ? paidHuman : null,
  });
  if (error) {
    const msg = String(error.message ?? "");
    // Ступень успела уйти вверх или лимит на сегодня выбран — это не «дёшево
    // по ошибке», а честный отказ. Деньги остаются за игроком, разбор ручной.
    if (/stale_price|daily_limit/.test(msg)) return { ok: false, reason: "cheap" };
    return { ok: false, reason: "known" };
  }

  console.log(
    `[energy-settle] ${head.signer} +${amount}⚡ за ${paidHuman} ${args.symbol} (tx ${args.tx.slice(0, 12)})`,
  );
  return { ok: true, wallet: head.signer, packId, energy: amount };
}
