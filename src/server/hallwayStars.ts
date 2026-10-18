// SERVER-ONLY. Выдача оплаченных за Telegram Stars триал-фишек. Вынесено из
// api/hallway.ts (который импортируется клиентом), т.к. использует node:crypto
// (randomInt) — в клиентском бандле его нет. Вызывается ТОЛЬКО из вебхука
// api.tg-webhook.ts (серверный роут).
import { nanoid } from "nanoid";
import { randomInt } from "node:crypto";
import { pg } from "./db/pg";
import { getHallwayConfig } from "./api/hallwayConfig";

const randI = (min: number, max: number) =>
  max <= min ? min : randomInt(min, max + 1); // inclusive

// ИДЕМПОТЕНТНО по charge_id (star_payments UNIQUE): первый вызов пишет платёж и
// выдаёт фишки, повтор (ретрай апдейта Telegram) выигрывает 0 и ничего не выдаёт.
export async function grantStarHallwayChips(opts: {
  chargeId: string;
  tgId: number;
  offerId: string;
  amountStars: number;
}): Promise<{ granted: boolean; count: number; stars: number[] }> {
  const cfg = await getHallwayConfig();
  const offer = (cfg.starShop?.offers ?? []).find((o) => o.id === opts.offerId);
  if (!offer) {
    console.error("[stars] неизвестный offerId", opts.offerId);
    return { granted: false, count: 0, stars: [] };
  }
  // Набор должен быть включён, а звёзд — не меньше его цены. Раньше ни того,
  // ни другого не проверялось: вебхуку верили на слово.
  if (!offer.active || !cfg.starShop?.enabled) {
    console.error("[stars] набор выключен", opts.offerId);
    return { granted: false, count: 0, stars: [] };
  }
  if (opts.amountStars < (offer.priceStars ?? 0)) {
    console.error("[stars] недоплата", opts.offerId, opts.amountStars);
    return { granted: false, count: 0, stars: [] };
  }
  // Кошелёк аккаунта по telegram_id (любой sister — фишки читаются по всем).
  const { data: urows } = await pg.users
    .raw()
    .select("wallet")
    .eq("telegram_id", opts.tgId)
    .order("created_at", { ascending: true })
    .limit(1);
  const wallet = ((urows ?? [])[0] as { wallet?: string } | undefined)?.wallet;
  if (!wallet) {
    console.error("[stars] нет кошелька для tg", opts.tgId);
    return { granted: false, count: 0, stars: [] };
  }
  // Идемпотентная запись платежа: UNIQUE(charge_id). Конкурентный/повторный
  // апдейт получит 23505 → уже обработан, фишки НЕ дублируем.
  const { error: insErr } = await pg.starPayments.raw().insert({
    id: `sp_${nanoid(10)}`,
    telegram_payment_charge_id: opts.chargeId,
    telegram_id: opts.tgId,
    wallet,
    kind: "hallway_chips",
    offer_id: offer.id,
    payload: { count: offer.count, star: offer.star, kind: offer.kind },
    amount_stars: opts.amountStars,
    granted: false,
  });
  if (insErr) {
    if (
      String((insErr as { code?: string }).code) === "23505" ||
      /duplicate|unique/i.test(insErr.message)
    ) {
      return { granted: false, count: 0, stars: [] }; // уже обработан
    }
    throw new Error(insErr.message);
  }
  // Выдаём фишки. fixed — все offer.star; random — у каждой звёздность случайно
  // 1/1.5/2/2.5/3 (равный шанс 20%, crypto-RNG).
  // ⚠️ Защита «купленное ВСЕГДА переходит при выпуске» — ТОЛЬКО для ПЛАТНЫХ
  // покупок (amountStars>0). Бесплатные офферы (0⭐, тест/раздача) НЕ защищаем:
  // source='stars_free' → при выпуске ведут себя как гача (переходят только если
  // в топ-N). Иначе бесплатные фишки клонировались бы в игру навсегда.
  const chipSource = opts.amountStars > 0 ? "stars" : "stars_free";
  const STARS = [1, 1.5, 2, 2.5, 3];
  const now = new Date().toISOString();
  const stars: number[] = []; // звёздности выданных фишек — для ревила
  for (let i = 0; i < offer.count; i++) {
    const star =
      offer.kind === "random" ? STARS[randI(0, STARS.length - 1)] : offer.star;
    stars.push(star);
    await pg.hallwayTrainingChips.insert({
      id: `htc_${nanoid(10)}`,
      wallet,
      telegram_id: opts.tgId,
      star,
      source: chipSource,
      obtained_at: now,
      consumed_at: null,
    });
  }
  await pg.starPayments.update(
    { telegram_payment_charge_id: opts.chargeId },
    { granted: true }
  );
  return { granted: true, count: offer.count, stars };
}
