// Вывод со счёта на свой кошелёк.
//
// Списание идёт ДО перевода: иначе между «проверил баланс» и «транзакция
// подтвердилась» те же деньги успевают уйти на покупку внутри игры. Заявка
// уходит в существующий конвейер выплат — там уже есть захват строки,
// минимальная сумма, проверка остатка кошелька и разбор зависших.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg, sb } from "../../db/pg";
import { requirePayoutsAdmin } from "../../auth";
import { assertNotMaintenance } from "../../maintenance";
import { OPERATING_WALLET } from "./treasury";
import { accAccountId, humanizeAccError } from "./move";
import { moneyGate } from "../../rateGate";
import { requireAccountUser } from "../account-rollout";

type TokenRow = {
  symbol: string;
  ft_contract: string;
  decimals: number;
  whole_only: boolean;
  min_withdraw: number;
};

/**
 * Завести заявку на вывод со счёта: списать и положить строку в очередь выплат.
 *
 * Отдельной функцией, потому что зовётся из двух мест — с экрана «Кошелёк» и
 * из общего вывода в «Мои NFT». Оба терминала работают с одними деньгами, и
 * заводить заявку по-разному было бы способом однажды разойтись.
 */
export async function draftAccountWithdrawal(opts: {
  wallet: string;
  token: string;
  amount: number;
  recipient: string;
  /** Ключ нажатия. Без него повтор запроса заводит вторую заявку. */
  opId?: string;
}): Promise<{ requestId: string; balance: number }> {
  const token = opts.token.trim();
  const recipient = opts.recipient.trim().toLowerCase();

  const { getSisterWallets } = await import("../user-shared");
  const sisters = await getSisterWallets(opts.wallet);
  if (!sisters.includes(recipient)) {
    throw new Error("Выводить можно только на свой кошелёк");
  }
  // Внутренний идентификатор tg<telegram_id> — НЕ NEAR-account. Такой
  // «кошелёк» есть у игроков, которые ещё не привязали настоящий адрес: в
  // цепи его нет, ft_transfer уходит в никуда, средства оседают на балансе
  // контракта. Ровно так был потерян вывод у player10 (20 GDarai,
  // сентябрь 2026). Гейт стоит здесь, до списания.
  const { isValidNearAccountForPayout } = await import("../near-account-validate");
  if (!isValidNearAccountForPayout(recipient)) {
    throw new Error(
      "Кошелёк не привязан. Прикрепи NEAR-адрес (…​.tg / …​.near / 64-hex) и выведи заново — в текущий адрес отправить нельзя, он не существует в цепи.",
    );
  }

  const row = (await pg.rewardTokens.findOne({ symbol: token })) as TokenRow | null;
  if (!row) throw new Error(`Токен ${token} не заведён в реестре`);

  // STARS — внутренний невыводимый ресурс. Из списка вывода он убран, но гард
  // нужен и здесь: прямой вызов в обход UI обязан отбиться понятной причиной,
  // а не пытаться перевести токен, у которого и ft-контракта нет.
  if (token.toUpperCase() === "STARS" || !row.ft_contract) {
    throw new Error(`${token} нельзя вывести — это внутренний ресурс`);
  }

  // Только целыми — по всем токенам. Дробный остаток копится на счёте.
  const amount = Math.floor(opts.amount);
  const { minWithdrawFor } = await import("./limits");
  const min = await minWithdrawFor(token);
  if (!(amount > 0)) throw new Error(`${token} выводится только целыми числами`);
  if (amount < min) {
    throw new Error(
      `Минимальный вывод ${token} — ${min.toLocaleString("ru-RU")}. ` +
        `У тебя сейчас ${Math.floor(opts.amount).toLocaleString("ru-RU")}`,
    );
  }

  // Платёжеспособность: хватает ли на ЭТОТ вывод. Раньше здесь стояло
  // «хватает ли сразу на всех» — пока счёт был владельческим, это была
  // разумная осторожность, а после раскатки такая проверка режет каждого:
  // общие обязательства по токену почти всегда больше остатка на кошельке,
  // и человек с 57 GDarai получал отказ, хотя выплатить их нечем не было.
  // Общее покрытие видно на /admin/treasury — там ему и место.
  //
  // Не прочитали баланс — НЕ отказываем. Публичные RPC регулярно отдают
  // 429/410 разом на всех эндпоинтах; при таком отказе баланс превращался в
  // ноль, и вывод переставал работать у всех сразу — ровно это и увидели
  // игроки. Покрытие токенов владелец держит сам, а недостачу поймает уже
  // сам перевод.
  const { getOperatingBalanceRaw, rawToHuman } = await import("../../near");
  let operating: number | null = null;
  try {
    operating = Number(
      rawToHuman(await getOperatingBalanceRaw(row.ft_contract), Number(row.decimals)),
    );
    if (!Number.isFinite(operating)) operating = null;
  } catch (e) {
    console.warn(
      `[withdraw] баланс ${token} на кошельке проекта не прочитан, пропускаю проверку:`,
      e instanceof Error ? e.message : e,
    );
  }
  if (operating != null && operating < amount) {
    throw new Error(
      `Недостаточный баланс ${token} на сервисном кошельке — попробуй позже. ` +
        `Сейчас доступно к выводу: ${operating}`,
    );
  }

  const account = await accAccountId(opts.wallet);
  if (!account) throw new Error("Не найден аккаунт для кошелька");

  // Ключ нажатия. Нет своего — собираем из того, что однозначно опознаёт
  // намерение: тот же кошелёк, тот же токен, та же сумма, тот же получатель
  // в пределах минуты — это один и тот же вывод, а не два.
  const idk =
    opts.opId ?? `auto:${token}:${amount}:${recipient}:${Math.floor(Date.now() / 60_000)}`;
  // DARAI из NFT-холдеров выходят последними, через 7–30 дней и с комиссией (§8.51).
  if (token === "Darai") {
    const { holderWithdraw } = await import("./withdraw-holder");
    const held = await holderWithdraw({ account, wallet: opts.wallet, amount, recipient, idk });
    if (held) return held;
  }

  const { data: res, error } = await sb.rpc("acc_withdraw_request", {
    p_account: account,
    p_wallet: opts.wallet,
    p_token: token,
    p_amount: amount,
    p_recipient: recipient,
    p_idk: idk,
  });
  if (error) {
    const msg = String(error.message ?? "");
    const notEnough = msg.match(/not_enough_currency:([^:]+):([\d.-]+):([\d.-]+)/);
    if (notEnough) {
      throw new Error(
        `Не хватает ${notEnough[1]}: нужно ${Number(notEnough[3])}, есть ${Number(notEnough[2])}`,
      );
    }
    throw new Error(msg ? humanizeAccError(msg) : "Не удалось создать заявку на вывод");
  }
  const out = (res as Array<{ redemption_id: string; balance: number }> | null)?.[0];
  return { requestId: String(out?.redemption_id ?? ""), balance: Number(out?.balance ?? 0) };
}

export const requestAccountWithdraw = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(1).max(32),
        amount: z.number().positive(),
        recipient: z.string().min(2).max(80),
        opId: z.string().min(8).max(40).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    assertNotMaintenance();
    const wallet = await requireAccountUser();
    await moneyGate("withdraw", wallet);
    const r = await draftAccountWithdrawal({
      wallet,
      token: data.token.trim(),
      amount: data.amount,
      recipient: data.recipient,
      opId: data.opId,
    });
    return {
      ok: true as const,
      token: data.token.trim(),
      amount: Math.floor(data.amount),
      recipient: data.recipient.trim().toLowerCase(),
      requestId: r.requestId,
      balance: r.balance,
      note: `Заявка создана. Дальше вывод идёт обычным путём с ${OPERATING_WALLET}.`,
    };
  });
