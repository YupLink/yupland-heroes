// Дерево уровней: даёт выбранному герою +1 уровень за ресурс.
//
// Цену задаёт админ КАЖДОМУ дереву отдельно (настройки клетки), общие цены
// шаблона — запасной вариант. Пока цен нет ни там, ни там, дерево не работает.
// Одному игроку одно дерево помогает единожды.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { myMapId, playerCell, requireAdjacent } from "./encounter-where";
import { requireNotVoid } from "./voidGate";
import { selectedHeroRow } from "./hero-current";
import { buildingUsed } from "./building-extra";
import { loadCellBuilding } from "./building-action";
import { raidOwner } from "./owner";
import { publishRaid } from "../../raidLive";
import { cellTreePrices, isBuilt, priceLabel } from "@/lib/buildingEffect";
import { BASE_LEVEL_BY_RARITY, type HeroRarity } from "@/lib/heroLevels";

/**
 * Потолок дерева — ОБЫЧНЫЙ потолок редкости (10/20/30/40). Повышенные уровни
 * (рар 21–30, эпик 31–40, лег 41–60) владелец оценил лестницей лайков, а цены
 * дерева за них нет. И ещё: подъём здесь идёт ДО оплаты и откатывается при
 * отказе — очки навыков, вложенные в это окно, остались бы сверх заработанного.
 */
export function heroMaxLevel(rarity: string): number {
  return BASE_LEVEL_BY_RARITY[rarity as HeroRarity] ?? 20;
}

export const growHeroLevel = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.number().int(),
        r: z.number().int(),
        /** Какой из вариантов цены выбрал игрок. */
        priceIndex: z.number().int().min(0).max(19),
        // Цена, которую игрок ВИДЕЛ. Если админ успел поменять настройки,
        // списывать «то, что теперь под этим номером» нельзя.
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
    if (b.effect !== "leveltree") throw new Error("Это не дерево уровней");
    // Недостроенное дерево не работает — как верфь и вышка.
    if (!isBuilt(b.tier, b.tiers.length)) throw new Error("Дерево ещё не выросло");

    const price = cellTreePrices(b.config, b.meta)[data.priceIndex];
    if (!price) throw new Error("Дерево ещё не настроено — цена не задана");
    const same =
      price.kind === data.expect.kind &&
      Math.abs(price.amount - data.expect.amount) < 1e-9 &&
      (price.kind !== "token" || (price.token ?? null) === (data.expect.token ?? null));
    if (!same) throw new Error("Цена изменилась — открой дерево заново");

    const hero = await selectedHeroRow(wallet);
    if (!hero) throw new Error("Сначала выбери основного героя");
    const maxLevel = heroMaxLevel(hero.rarity);
    if (hero.level >= maxLevel) throw new Error(`У героя уже максимум — ${maxLevel} ур.`);

    const owner = await raidOwner(wallet);
    if (await buildingUsed(owner, mapId, data.q, data.r, "leveltree")) {
      throw new Error("Это дерево тебе уже помогло");
    }
    // Отметку ставим ДО оплаты: два одновременных нажатия не прокачают дважды.
    const claimed = (await mcpExec(
      `INSERT INTO yuplink.beta_raid_building_use (owner, map_id, q, r, kind)
       VALUES (${sqlStr(owner)}, ${sqlStr(mapId)}, ${data.q}, ${data.r}, 'leveltree')
       ON CONFLICT DO NOTHING RETURNING owner;`,
      { wrapJsonCte: true },
    )) as Array<{ owner: string }>;
    if (!claimed || claimed.length === 0) throw new Error("Это дерево тебе уже помогло");

    const release = async () => {
      await mcpExec(
        `DELETE FROM yuplink.beta_raid_building_use
          WHERE owner = ${sqlStr(owner)} AND map_id = ${sqlStr(mapId)}
            AND q = ${data.q} AND r = ${data.r} AND kind = 'leveltree';`,
      ).catch(() => {});
    };

    // Уровень поднимаем ДО оплаты и условным UPDATE: параллельная прокачка за
    // лайки не потеряется, а через потолок не перескочить.
    const bumped = (await mcpExec(
      `UPDATE yuplink.hero_instance SET level = level + 1, updated_at = now()
        WHERE id = ${sqlStr(hero.id)} AND level < ${maxLevel} RETURNING level;`,
      { wrapJsonCte: true },
    )) as Array<{ level: number }>;
    const level = Number(bumped?.[0]?.level ?? 0);
    if (!level) {
      await release();
      throw new Error(`У героя уже максимум — ${maxLevel} ур.`);
    }

    try {
      const { payServicePrice } = await import("./building-pay");
      // ref свой у каждого игрока: общий ключ дедуплицировался в леджере, и
      // билетами за дерево мог заплатить только первый пришедший.
      await payServicePrice(wallet, price, `tree:${owner}:${mapId}:${data.q}:${data.r}`);
    } catch (e) {
      // Оплата не прошла — возвращаем уровень и снимаем отметку. Условие «выше
      // прочитанного», а не «ровно наш»: если за это окно героя подняли ещё раз
      // (лайками, другим деревом), бесплатной ступень всё равно не останется.
      await mcpExec(
        `UPDATE yuplink.hero_instance SET level = level - 1, updated_at = now()
          WHERE id = ${sqlStr(hero.id)} AND level > ${Number(hero.level)};`,
      ).catch(() => {});
      await release();
      throw e;
    }

    publishRaid({ mapId, type: "built", cells: [`${data.q},${data.r}`] });
    // Цену отдаём ключом словаря, а не готовой фразой: тост про «−100 билетов»
    // собирает клиент на своём языке.
    const paid = priceLabel(price);
    // Уровень вырос — сбрасываем кэш силы героя (15 с) и записи энергии,
    // иначе бой и цена шага ещё четверть минуты считаются по старым статам,
    // а игрок видит «прокачал, но ничего не изменилось».
    const { invalidateHeroPower } = await import("./hero-power");
    invalidateHeroPower(wallet);

    return {
      ok: true as const,
      heroName: hero.name,
      level,
      maxLevel,
      paidKey: paid.key,
      paidParams: paid.params,
    };
  });
