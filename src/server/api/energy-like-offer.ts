// «Энергия за лайки»: витрина для игрока и покупка по лестнице цен.
// Настройка и формат счётчика — src/lib/energyLikeOffer.ts, админка —
// energy-like-offer-admin.ts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg, sb } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { assertNotMaintenance } from "../maintenance";
import {
  ENERGY_LIKE_OFFER_KEY,
  formatLikeDaily,
  likeOfferView,
  parseEnergyLikeOffer,
  parseLikeDaily,
  type EnergyLikeOffer,
} from "@/lib/energyLikeOffer";

const energyLikeKey = (account: string) => `energy_like_daily:${account}`;
const utcToday = () => new Date().toISOString().slice(0, 10);

function requireWallet(): string {
  const w = getCurrentWallet();
  if (!w) throw new Error("Кошелёк не подключён");
  assertNotMaintenance(w);
  return w;
}

/** Суточный гейт считается на аккаунт: смена набора адресов его не обнуляет. */
async function canonicalWallet(wallet: string): Promise<string> {
  const { accountOf } = await import("./user-shared");
  return accountOf(wallet);
}

export async function loadEnergyLikeOffer(): Promise<EnergyLikeOffer> {
  const row = await pg.settings.findOne({ key: ENERGY_LIKE_OFFER_KEY });
  return parseEnergyLikeOffer(row?.value);
}

export const getEnergyLikeOffer = createServerFn({ method: "GET" }).handler(async () => {
  const offer = await loadEnergyLikeOffer();
  const wallet = getCurrentWallet();
  const first = offer.steps[0]?.amount ?? 0;
  if (!wallet || !offer.enabled) {
    return {
      visible: false,
      boughtToday: false,
      priceLikes: first,
      amount: offer.amount,
      used: 0,
      total: 0,
    };
  }
  const row = await pg.settings.findOne({ key: energyLikeKey(await canonicalWallet(wallet)) });
  const v = likeOfferView(offer, parseLikeDaily(row?.value, utcToday()));
  // Форма ответа прежняя (visible/boughtToday/priceLikes/amount) — у игроков
  // ответ лежит в кэше сутки (§11.13в); used/total только добавлены.
  return {
    visible: true,
    boughtToday: v.price == null,
    priceLikes: v.price ?? offer.steps.at(-1)?.amount ?? first,
    amount: offer.amount,
    used: v.used,
    total: v.total,
  };
});

export const buyEnergyForLikes = createServerFn({ method: "POST" })
  // Старый клиент зовёт без данных — ожидаемая цена необязательна.
  .inputValidator((d: unknown) =>
    z.object({ expectedPrice: z.number().positive().optional() }).optional().parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const offer = await loadEnergyLikeOffer();
    if (!offer.enabled) throw new Error("Предложение сейчас недоступно");
    const today = utcToday();
    const key = energyLikeKey(await canonicalWallet(wallet));
    const { mcpExec } = await import("../db/mcpClient");
    const { sqlStr } = await import("./chips-utils");

    // Сначала читаем, потом ТРАТИМ, и только потом занимаем слот. Порядок
    // «слот первым» сжигал покупку на любом сбое до списания.
    const prev = await pg.settings.findOne({ key });
    const used = parseLikeDaily(prev?.value, today);
    const { price, total } = likeOfferView(offer, used);
    if (price == null) {
      throw new Error(
        total > 1
          ? `Лимит на сегодня исчерпан (${used} из ${total})`
          : "Уже покупал сегодня — доступно раз в день",
      );
    }
    // Карточка показала одну цену, а ступень уже сменилась (купил в другой
    // вкладке, админ поправил лестницу) — не списываем молча другую сумму.
    if (data?.expectedPrice != null && data.expectedPrice !== price) {
      throw new Error(`Цена уже сменилась: сейчас ${price} 👍 — обнови и купи снова`);
    }

    const { likeAccountId, addLikes } = await import("../likesAccount");
    const likeAcc = await likeAccountId(wallet);

    const { data: eData, error: eErr } = await sb.rpc("compute_energy", { p_wallet: wallet });
    if (eErr) throw new Error(eErr.message);
    const eRow = (eData as Array<{ energy_now: number; max_energy: number }>)[0];

    // Списание переживает и параллельное нажатие, и слепой повтор транспорта.
    const { guardedSpend } = await import("./guarded-spend");
    const spent = await guardedSpend({
      table: "yuplink.user_like_balance",
      where: `account_id = ${sqlStr(likeAcc)}`,
      set: `available = available - ${price}, lifetime_spent = lifetime_spent + ${price}`,
      cond: `available >= ${price}`,
      ret: "available",
    });
    if (!spent.ok) {
      const bal = await pg.userLikeBalance.findOne({ account_id: likeAcc });
      const avail = Number(bal?.available ?? 0);
      throw new Error(`Нужно ${price} лайков, у тебя ${avail.toFixed(2)}`);
    }

    // Слот — ПОСЛЕ оплаты, CAS по точному прежнему значению счётчика: цена
    // выше посчитана именно от него. В значение кладём метку операции: мост
    // повторяет запись вслепую, и повтор своей же записи отвечает «ноль строк»
    // — без метки это не отличить от чужого нажатия (лайки назад, слот сгорел).
    const op = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const next = formatLikeDaily(today, used + 1, op);
    const refund = () =>
      addLikes(likeAcc, price, "lifetime_granted", `energy_like_refund:${op}`).catch(
        () => undefined,
      );
    const claimSql = prev
      ? `UPDATE yuplink.settings SET value = ${sqlStr(next)}
          WHERE key = ${sqlStr(key)} AND value = ${sqlStr(prev.value)} RETURNING key;`
      : `INSERT INTO yuplink.settings(key, value) VALUES (${sqlStr(key)}, ${sqlStr(next)})
         ON CONFLICT (key) DO NOTHING RETURNING key;`;
    const claimed = (await mcpExec(claimSql, { wrapJsonCte: true }).catch(() => null)) as Array<{
      key: string;
    }> | null;
    if (!claimed?.length) {
      const now = await pg.settings.findOne({ key }).catch(() => null);
      if (now?.value !== next) {
        // Параллельное нажатие уже заняло эту ступень (или админ сбросил лимиты).
        await refund();
        throw new Error(
          "Покупка уже идёт в другой вкладке — лайки вернули, обнови и попробуй ещё раз",
        );
      }
    }

    // Ошибку начисления обязаны увидеть: лайки назад, слот освобождаем
    // (тоже CAS — не затереть чужую покупку, сделанную следом). Но сперва
    // леджер: ответ мог потеряться уже после начисления, и откат подарил бы
    // энергию даром.
    const creditRef = `energy_like:${op}`;
    const { error: addErr } = await sb.rpc("add_energy", {
      p_wallet: wallet,
      p_amount: offer.amount,
      p_kind: "energy_like",
      p_ref: creditRef,
    });
    if (addErr) {
      const seen = (await mcpExec(
        `SELECT 1 AS x FROM yuplink.currency_ledger
          WHERE token = 'Energy' AND kind = 'energy_like' AND ref = ${sqlStr(creditRef)} LIMIT 1;`,
        { wrapJson: true },
      ).catch(() => null)) as Array<{ x: number }> | null;
      if (!seen?.length) {
        await refund();
        await mcpExec(
          `UPDATE yuplink.settings SET value = ${sqlStr(prev?.value ?? "")}
            WHERE key = ${sqlStr(key)} AND value = ${sqlStr(next)} RETURNING key;`,
          { wrapJsonCte: true },
        ).catch(() => undefined);
        throw new Error("Энергия не начислилась — лайки вернули, попробуй ещё раз");
      }
    }
    return {
      ok: true,
      amount: offer.amount,
      energyNow: eRow.energy_now + offer.amount,
      likesLeft: Math.round(Number(spent.row?.available ?? 0) * 100) / 100,
    };
  });
