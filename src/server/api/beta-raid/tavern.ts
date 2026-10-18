// Таверна: меняет основного героя за лайки, но не бесконечно.
//
// В замке смена героя бесплатна, но замок один и стоит в центре карты. Таверна
// — то же самое в дороге: подошёл, заплатил лайками, пошёл дальше другим
// героем. Цену задаёт админ (yuplink.settings, ключ hero_swap_price_likes),
// а сколько раз в сутки трактир вообще открыт — тир постройки: второй даёт одну
// смену в сутки, третий — две по двенадцать часов (heroSwapLimit). Заряды у
// каждой таверны свои (tavern-limit).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { pg } from "../../db/pg";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { myMapId, playerCell, requireAdjacent } from "./encounter-where";
import { requireNotVoid } from "./voidGate";
import { loadCellBuilding } from "./building-action";
import { raidOwner } from "./owner";
import { spendLikes } from "../heroes-shared";
import { tavernSwapLimit } from "@/lib/hero/heroSwapLimit";
import { claimSwap, releaseSwap, tavernSwapState, type SwapClaim } from "./tavern-limit";
import { tavernHeroes, tavernHeroInstanceId } from "./tavern-heroes";
import { freeHeroSql, heroLockSql, requireHeroFree } from "../hero-rest";
import { sqlRow } from "./chest/chest-row";

/** Настройки админа: лайки за смену героя — отдельно у обычной и улучшенной. */
export const HERO_SWAP_PRICE_KEY = "hero_swap_price_likes";
export const HERO_SWAP_PRICE_UP_KEY = "hero_swap_price_likes_upgraded";
export const HERO_SWAP_PRICE_DEFAULT = 50;
export const HERO_SWAP_PRICE_UP_DEFAULT = 30;

/** Значение настройки; её нет или мусор — работает значение по умолчанию. */
export async function priceSetting(key: string, fallback: number): Promise<number> {
  const row = await pg.settings.findOne({ key }).catch(() => null);
  const n = Math.round(Number(row?.value));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Цена смены по тиру клетки: улучшенная таверна берёт дешевле обычной —
 * достроил трактир до третьего тира, и трактирщик подобрел.
 */
export async function heroSwapPrice(tier: number): Promise<number> {
  return tier >= 2
    ? priceSetting(HERO_SWAP_PRICE_UP_KEY, HERO_SWAP_PRICE_UP_DEFAULT)
    : priceSetting(HERO_SWAP_PRICE_KEY, HERO_SWAP_PRICE_DEFAULT);
}

const cellInput = (d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d);

/** Владелец в SQL-виде: аккаунт игрока. */
export async function walletList(wallet: string): Promise<string> {
  return sqlStr(await raidOwner(wallet));
}

/** Таверна на этой клетке уже трактир? Первый тир — стройка, менять героя негде. */
async function requireTavern(wallet: string, mapId: string, q: number, r: number) {
  const b = await loadCellBuilding(mapId, q, r);
  if (!b) throw new Error("Здесь нет постройки");
  if (b.effect !== "tavern") throw new Error("Это не таверна");
  const limit = tavernSwapLimit(b.tier);
  if (!limit) throw new Error("braid.tavern_unfinished");
  await requireNotVoid(wallet, mapId, q, r);
  return { b, limit };
}

/** Кого можно поставить основным, за сколько и хватает ли лайков. */
export const getTavernOffer = createServerFn({ method: "GET" })
  .inputValidator(cellInput)
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    const { b, limit } = await requireTavern(wallet, mapId, data.q, data.r);

    const priceLikes = await heroSwapPrice(b.tier);
    // Лайки живут на sister-кошельках порознь — стягиваем, иначе таверна
    // считала бы, что денег нет, когда они лежат на соседнем кошельке.
    const { pullSiblingLikesTo } = await import("../likes");
    const likes = await pullSiblingLikesTo(wallet).catch(() => 0);
    const list = await walletList(wallet);
    const heroes = await tavernHeroes(wallet, list);
    const currentId = heroes.find((h) => h.selected)?.id ?? null;
    const swaps = await tavernSwapState(list, { mapId, q: data.q, r: data.r }, limit);
    return { priceLikes, likes, currentId, heroes, swaps };
  });

/** Сменить основного героя за лайки. Стоять надо рядом с таверной. */
export const swapHeroInTavern = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        // heroId — у героя с экземпляром; templateId — у спящего, которого
        // ещё ни разу не качали и не ставили основным.
        heroId: z.string().min(1).optional(),
        templateId: z.string().min(1).optional(),
        q: z.number().int(),
        r: z.number().int(),
      })
      .refine((v) => !!v.heroId || !!v.templateId, { message: "Не выбран герой" })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    requireAdjacent(await playerCell(wallet), data.q, data.r);
    const { b, limit } = await requireTavern(wallet, mapId, data.q, data.r);
    const cell = { mapId, q: data.q, r: data.r };

    const list = await walletList(wallet);
    // Спящему героя-предмету экземпляр заводим здесь: сама проверка владения
    // сидит в пробуждении (предмет обязан лежать в инвентаре игрока).
    const heroId = await tavernHeroInstanceId(wallet, data.heroId, data.templateId);
    // Спрашиваем ровно этого героя, а не весь список: у игрока их могут быть
    // сотни, и «не нашёлся в первых шестидесяти» выглядело бы как чужой герой.
    const own = (await mcpExec(
      `SELECT h.id, h.selected_at, COALESCE(NULLIF(t.name, ''), 'Герой') AS name
         FROM yuplink.hero_instance h
         LEFT JOIN yuplink.mystic_item_template t ON t.id = h.template_id
        WHERE h.id = ${sqlStr(heroId)} AND h.account_id IN (${list}) LIMIT 1;`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ id: string; selected_at: string | null; name: string }>;
    const hero = own?.[0];
    if (!hero) throw new Error("Это не твой герой");
    if (hero.selected_at) throw new Error("Этот герой уже основной");
    // Занятый основным не становится и здесь — батрачащий и отдыхающий
    // (hero-rest.ts). До заряда: отказ не должен съедать попытку.
    await requireHeroFree(heroId);

    // Заряд занимаем до смены: иначе два одновременных запроса поменяли бы
    // героя дважды за одну суточную попытку.
    const claim: SwapClaim = await claimSwap(list, wallet, heroId, cell, limit);

    const prevRows = (await mcpExec(
      `SELECT id FROM yuplink.hero_instance
        WHERE account_id IN (${list}) AND selected_at IS NOT NULL
        ORDER BY selected_at DESC LIMIT 1;`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ id: string }>;
    const prevId = prevRows?.[0]?.id ?? null;

    const priceLikes = await heroSwapPrice(b.tier);
    // Сначала переставляем отметку, потом платим: так две одновременные смены
    // не спишут лайки дважды за одного и того же героя.
    await mcpExec(
      `UPDATE yuplink.hero_instance SET selected_at = NULL
        WHERE account_id IN (${list}) AND selected_at IS NOT NULL;`,
    );
    // Под замком героя: постановка на грядку держит тот же (guardedJoinSql).
    const set = sqlRow<{ done: boolean }>(
      (await mcpExec(
        `${heroLockSql(heroId)}
         WITH up AS (
           UPDATE yuplink.hero_instance h SET selected_at = now()
            WHERE h.id = ${sqlStr(heroId)} AND h.account_id IN (${list})
              AND ${freeHeroSql("h")} RETURNING h.id
         )
         SELECT row_to_json(_t.*) AS _row FROM (SELECT count(*) > 0 AS done FROM up) _t;`,
      )) as unknown[],
    );

    /** Вернуть прежнего основного и заряд: оплата не прошла — смены не было. */
    const restore = async () => {
      await releaseSwap(claim);
      await mcpExec(
        `UPDATE yuplink.hero_instance SET selected_at = NULL WHERE id = ${sqlStr(heroId)};`,
      ).catch(() => {});
      if (prevId) {
        // Прежний мог за это время уйти на грядку или отдыхать — занятого в
        // основные не возвращаем (под его замком, как любое назначение).
        await mcpExec(
          `${heroLockSql(prevId)}
           UPDATE yuplink.hero_instance h SET selected_at = now()
            WHERE h.id = ${sqlStr(prevId)} AND ${freeHeroSql("h")};`,
        ).catch(() => {});
      }
    };

    if (!set?.done) {
      await restore();
      // Занятым он мог стать между проверкой и записью — назовём причину.
      await requireHeroFree(heroId);
      throw new Error("Это не твой герой");
    }

    let likes = 0;
    try {
      likes =
        priceLikes > 0
          ? await spendLikes(wallet, priceLikes, "tavern_swap", `${data.q},${data.r}`)
          : 0;
    } catch (e) {
      await restore();
      throw e;
    }

    // Кэш силы героя держит статы, отряд и снаряжение — после смены он врёт.
    const { invalidateHeroPower } = await import("./hero-power");
    invalidateHeroPower(wallet);
    const swaps = await tavernSwapState(list, cell, limit);
    return {
      ok: true as const,
      heroId,
      heroName: hero.name,
      paid: priceLikes,
      likes,
      swaps,
    };
  });
