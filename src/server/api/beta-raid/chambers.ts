// Покои: герой отдыхает, с игрока снимаются дебаффы за плату.
//
// Спека владельца 14.09: постройка вешает эффект "chambers", админ задаёт
// цены (как у дерева уровней — несколько вариантов), игрок выбирает вариант,
// сервер списывает и стирает ВСЕ дебаффы, что висят: замедление (slow),
// ослабления героя (weak_*), а также оглушение (stun) и яд (poison) на его
// фишках. Бустов (buff_*) не трогаем — их снимает время.
//
// Ограничения по количеству входов НЕТ: покои — это платная услуга, ходить
// в них можно сколько угодно, только заплати. Если ничего не висит — окно
// это скажет и списывать не станет.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { myMapId, playerCell, requireAdjacent } from "./encounter-where";
import { requireNotVoid } from "./voidGate";
import { loadCellBuilding } from "./building-action";
import { raidOwner } from "./owner";
import { cellChambersPrices, isBuilt, priceLabel } from "@/lib/buildingEffect";
import { WEAKEN_KINDS } from "./abilities";

const KIND_LIST = ["slow", ...WEAKEN_KINDS].map(sqlStr).join(",");

export const restInChambers = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.number().int(),
        r: z.number().int(),
        priceIndex: z.number().int().min(0).max(19),
        // Цена, которую игрок ВИДЕЛ (защита от подмены под пальцем).
        expect: z.object({
          kind: z.enum(["tickets", "likes", "token", "energy"]),
          token: z.string().nullable().optional(),
          amount: z.number().positive(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    requireAdjacent(await playerCell(wallet), data.q, data.r);
    await requireNotVoid(wallet, mapId, data.q, data.r);

    const b = await loadCellBuilding(mapId, data.q, data.r);
    if (!b) throw new Error("Здесь нет постройки");
    if (b.effect !== "chambers") throw new Error("Это не покои");
    if (!isBuilt(b.tier, b.tiers.length)) throw new Error("Покои ещё не достроены");

    const price = cellChambersPrices(b.config, b.meta)[data.priceIndex];
    if (!price) throw new Error("Покои закрыты — цена не задана");
    const same =
      price.kind === data.expect.kind &&
      Math.abs(price.amount - data.expect.amount) < 1e-9 &&
      (price.kind !== "token" || (price.token ?? null) === (data.expect.token ?? null));
    if (!same) throw new Error("Цена изменилась — открой покои заново");

    const account = await raidOwner(wallet);

    // Считаем сколько эффектов реально висит: чтобы не списывать за пустой
    // визит и внятно ответить «сейчас снимать нечего».
    const hangingRows = (await mcpExec(
      `SELECT COUNT(*)::int AS n
         FROM yuplink.beta_raid_player_effects
        WHERE account_id = ${sqlStr(account)}
          AND kind IN (${KIND_LIST}) AND expires_at > now();`,
      { wrapJson: true },
    )) as Array<{ n: number }>;
    // Плюс эффекты на фишках (stun/poison) — их лечим той же услугой.
    const chipRows = (await mcpExec(
      `SELECT COUNT(*)::int AS n
         FROM yuplink.chip_effects e
         JOIN yuplink.user_chip_inventory c ON c.id = e.chip_id
        WHERE c.account_id = ${sqlStr(account)} AND e.expires_at > now();`,
      { wrapJson: true },
    )) as Array<{ n: number }>;
    const total = (hangingRows[0]?.n ?? 0) + (chipRows[0]?.n ?? 0);
    if (total <= 0) throw new Error("Сейчас снимать нечего — покои не нужны");

    // Оплата первой: если платёж сорвётся, эффекты остаются на месте.
    const { payServicePrice } = await import("./building-pay");
    await payServicePrice(
      wallet,
      price,
      // ref персональный по клетке+сумме+моменту: разные визиты в БД одинаковы,
      // а идемпотентно их различает клиент, повтор всплывёт «уже списано».
      `chambers:${account}:${mapId}:${data.q}:${data.r}:${Date.now()}`,
    );

    // Снимаем эффекты игрока (замедление + ослабления).
    await mcpExec(
      `DELETE FROM yuplink.beta_raid_player_effects
        WHERE account_id = ${sqlStr(account)}
          AND kind IN (${KIND_LIST});`,
    ).catch(() => {});
    // Плюс stun/poison на всех фишках аккаунта.
    await mcpExec(
      `DELETE FROM yuplink.chip_effects
        WHERE chip_id IN (
          SELECT id FROM yuplink.user_chip_inventory WHERE account_id = ${sqlStr(account)}
        );`,
    ).catch(() => {});
    // Ослабление вшито в кэш силы героя (computeHeroView → weakenHero): без
    // сброса ещё 15 с бой и цена шага шли по ослабленному герою.
    const { invalidateHeroPower } = await import("./hero-power");
    invalidateHeroPower(wallet);

    const paid = priceLabel(price);
    return {
      ok: true as const,
      cleared: total,
      paidKey: paid.key,
      paidParams: paid.params,
    };
  });
