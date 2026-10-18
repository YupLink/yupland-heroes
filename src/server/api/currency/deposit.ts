// Пополнение ресурсного счёта переводом любого токена из реестра.
//
// Пока это владельческая механика: экран живёт в админке, гейт — тот же, что
// у «Выплат». Раскатка на игроков — отдельным шагом, когда механика обкатана.
//
// Проверка перевода идёт через общий verifyFtTransfer: он переберёт все
// sister-кошельки и подождёт финализации. Ручной one-shot RPC-lookup, как в
// старом пополнении DARAI, здесь не годится — на нём уже теряли платежи, когда
// подписывал другой кошелёк того же игрока.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../../db/pg";
import { assertNotMaintenance } from "../../maintenance";
import { OPERATING_WALLET } from "./treasury";
import { depositLimits } from "./limits";
import { accAccountId, accBalances } from "./move";
import { moneyGate } from "../../rateGate";
import { requireAccountUser } from "../account-rollout";

type TokenRow = {
  symbol: string;
  ft_contract: string;
  decimals: number;
  whole_only: boolean;
  min_withdraw: number;
  sort_order: number;
};

/** Реестр токенов + пороги + куда переводить. Всё, что нужно окну пополнения. */
export const getAccountDepositInfo = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = await requireAccountUser();
  const { data } = await pg.rewardTokens
    .raw()
    .select("symbol,ft_contract,decimals,whole_only,min_withdraw,sort_order")
    .order("sort_order", { ascending: true });
  const limits = await depositLimits();
  const tokens = ((data ?? []) as TokenRow[]).map((t) => ({
    symbol: t.symbol,
    ftContract: t.ft_contract,
    decimals: Number(t.decimals),
    // На счёт кладём и забираем только целыми — по всем токенам, а не только
    // по тем, у кого так помечено в реестре.
    wholeOnly: true,
    min: limits.deposit[t.symbol] ?? 1,
    minWithdraw: limits.withdraw[t.symbol] ?? 1,
    allowed: !limits.disabled.includes(t.symbol),
    // STARS — внутренний ресурс: пополняется звёздами Telegram, не с цепи, и
    // не выводится. Клиент по этому флагу даёт звёздный поток и прячет вывод.
    stars: t.symbol === "STARS",
  }));
  // Свои кошельки — выбор получателя при выводе. Чужой адрес счёт не принимает,
  // так что список тут не удобство, а сама граница дозволенного.
  const { getSisterWallets } = await import("../user-shared");
  const wallets = await getSisterWallets(wallet);
  return { receiverId: OPERATING_WALLET, tokens, wallets };
});

/** Балансы счёта текущего игрока — витрина для окна пополнения и вывода. */
export const getMyAccountBalances = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = await requireAccountUser();
  return { balances: await accBalances(wallet) };
});

/**
 * История движений СВОЕГО счёта.
 *
 * Отдельно от админского `adminAccLedger`: тому кошелёк приходит параметром, и
 * когда гейт со счёта снимут, этот параметр станет чужой историей. Здесь
 * кошелёк берётся из сессии, и подставить чужой нечего.
 */
export const getMyAccountHistory = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().int().min(1).max(200).default(50) }).default({}).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const wallet = await requireAccountUser();
    const account = await accAccountId(wallet);
    if (!account) return { rows: [] as Array<Record<string, string | null>> };
    const { mcpExec } = await import("../../db/mcpClient");
    const { sqlStr } = await import("../chips-utils");
    const rows =
      (await mcpExec(
        `SELECT l.id, l.token, l.delta::text AS delta, l.kind, l.ref,
                l.balance_after::text AS balance_after, l.created_at
           FROM yuplink.acc_ledger l
          WHERE l.account_id = ${sqlStr(account)}
          ORDER BY l.seq DESC
          LIMIT ${data.limit};`,
        { wrapJson: true },
      )) ?? [];
    return { rows: rows as Array<Record<string, string | null>> };
  });

/**
 * Зачесть перевод на счёт по квитанции.
 *
 * Порядок: проверяем перевод в сети → зачисляем одной транзакцией в базе.
 * Вся защита от двойного зачёта живёт в acc_deposit_apply: первичный ключ на
 * хэше плюс перекрёстная проверка, что этой же квитанцией не оплатили что-то
 * напрямую. Здесь её не дублируем — иначе получилось бы два разных ответа на
 * один вопрос.
 */
export const verifyAccountDeposit = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        txHash: z.string().min(20).max(64),
        token: z.string().min(1).max(32),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    assertNotMaintenance();
    const wallet = await requireAccountUser();
    await moneyGate("deposit", wallet);

    // Ядро одно на оба входа — живой запрос и отложенный догон. Держать здесь
    // вторую копию значило бы однажды починить только одну из них.
    const { applyAccountDeposit } = await import("./deposit-apply");
    const res = await applyAccountDeposit({
      wallet,
      txHash: data.txHash.trim(),
      token: data.token.trim(),
    });

    // Закрываем ожидание, если оно было: иначе очередь ещё несколько раз
    // сходит в Sendler за уже зачтённым переводом.
    const { closeCreditWait } = await import("../credit-wait");
    await closeCreditWait(`dep:${data.txHash.trim()}`).catch(() => {});

    return { ok: true as const, ...res };
  });
