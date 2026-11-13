// Взаимодействие с постройкой: предложение и сама постройка следующего тира.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { myMapId, playerCell, requireAdjacent } from "./encounter-where";
import { requireNotVoid } from "./voidGate";
import { parseTiers, heroFits, type BuildingTier } from "./buildings";
import { selectedHero } from "./hero-current";
import { cellBuildingEffect, isBuilt } from "@/lib/buildingEffect";
import { isMushroomConfig } from "@/lib/mushroomKinds";
import { skinDisplayName } from "@/lib/skinName";
import { publishRaid } from "../../raidLive";
import { noteEnergyInPrices } from "./econ/trade-hooks";
import { islandGateBlock, islandGateText, requireIslandGate } from "../achievements/gate";
import { isDemoMap, noExitText } from "./island/demo-map";

const cellInput = (d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d);

/**
 * Постройка клетки. Голод города постройкам не помеха: он касается только
 * лавок, привязанных к ратуше (town-shop.ts) — те в голод только принимают еду.
 */
export async function loadCellBuilding(mapId: string, q: number, r: number) {
  const rows = (await mcpExec(
    `SELECT c.building_id, c.building_config, t.name, t.meta,
            c.building_skin_id, sk.name AS skin_name, sk.image AS skin_image,
            COALESCE(s.tier, 0) AS tier
       FROM yuplink.raid_map_cells c
       LEFT JOIN yuplink.mystic_item_template t ON t.id = c.building_id
       LEFT JOIN yuplink.raid_building_skin sk ON sk.id = c.building_skin_id
       LEFT JOIN yuplink.beta_raid_building_state s
              ON s.map_id = c.map_id AND s.q = c.q AND s.r = c.r
      WHERE c.map_id = ${sqlStr(mapId)} AND c.q = ${q} AND c.r = ${r} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{
    building_id: string | null;
    building_config: unknown;
    name: string | null;
    meta: unknown;
    building_skin_id: string | null;
    skin_name: string | null;
    skin_image: string | null;
    tier: number;
  }>;
  const row = rows?.[0];
  if (!row?.building_id) return null;
  // Шаблон удалили из палитры, а id в клетке остался: показывать пустое окно
  // «Постройка» незачем — считаем клетку без постройки.
  if (!row.name) return null;
  let tiers = parseTiers(row.meta);
  const tier = Math.max(0, Number(row.tier) || 0);
  // Облик: карточка игрока обязана показывать ТОТ ЖЕ вид, что и клетка на карте —
  // картинку берём у облика, имя тоже (мусорное числовое имя файла откатывается
  // на «Ворота»). Механика (effect/тиры) — прежняя, шаблонная. Жалоба владельца:
  // «поставил ворота единорога, а внутри базовый замок и пишется Ворота».
  const name =
    row.building_skin_id && row.skin_image
      ? skinDisplayName(row.skin_name, row.name)
      : (row.name ?? "Постройка");
  if (row.building_skin_id && row.skin_image) {
    const img = row.skin_image;
    tiers = tiers.map((t) => ({ ...t, imageUrl: img }));
  }
  return {
    buildingId: row.building_id,
    name,
    /** Поведение ЭТОЙ клетки: назначенное в режиме бога либо из шаблона. */
    effect: cellBuildingEffect(row.building_config, row.meta, row.name),
    meta: row.meta,
    config: row.building_config ?? null,
    tiers,
    tier,
  };
}

function offerOf(tiers: BuildingTier[], tier: number) {
  const current = tiers[tier] ?? null;
  const next = tiers[tier + 1] ?? null;
  // costs — полная цена списком; price оставлен для окна постройки, которое
  // рисует «сколько и чем» одной строкой у старых построек.
  return {
    current,
    next,
    price: current?.price ?? null,
    costs: current?.costs ?? null,
    requires: current?.requires ?? null,
  };
}

/** Что предлагает постройка рядом: следующий тир, цена и пускает ли героя. */
export const getBuildingOffer = createServerFn({ method: "GET" })
  .inputValidator(cellInput)
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    // Гейт стоит и на ЧТЕНИИ: иначе окно постройки выдавало бы имя, облик и
    // цену тира внутри зоны, куда игроку и заглядывать нечем.
    await requireNotVoid(wallet, mapId, data.q, data.r);
    const b = await loadCellBuilding(mapId, data.q, data.r);
    if (!b) throw new Error("Здесь нет постройки");

    const offer = offerOf(b.tiers, b.tier);
    // Гриб DARAI не улучшают (владелец, 22.10.2026: «ускорение фарма недоступно»).
    const next = isMushroomConfig(b.config) ? null : offer.next;
    const { current, price, costs, requires } = offer;
    const hero = await selectedHero(wallet);
    // Портал острова чинится только с ачивками (§8.57) — кнопка серая с причиной.
    const gate = b.effect === "portal" && next ? await islandGateBlock(wallet, mapId) : null;
    // Портал демо-острова никуда не ведёт — чинить незачем (demo-island).
    const demo = b.effect === "portal" && next && (await isDemoMap(mapId));
    const fit = demo
      ? { ok: false, reason: noExitText(mapId) }
      : gate !== null ? { ok: false, reason: islandGateText(gate) } : heroFits(requires, hero);

    // Достроенная верфь/вышка умеют больше, чем менять облик, — что именно,
    // считает отдельный модуль (корабль, разведка). Ратуша — справка о городе.
    const effect = b.effect;
    const built = isBuilt(b.tier, b.tiers.length);
    const { buildingExtra } = await import("./building-extra");
    const extra =
      effect === "town_hall"
        ? await (await import("./town-hall-extra")).townHallExtra(mapId, data.q, data.r)
        : await buildingExtra({
            effect,
            built,
            wallet,
            mapId,
            q: data.q,
            r: data.r,
            hero,
            tier: b.tier,
            meta: b.meta,
            cellConfig: b.config,
          });

    // Кузница: кнопка «Ремонт» артефактов (§8.72) — пока только админам.
    const { forgeRepairShown } = await import("../art-repair/art-repair-gate");
    // Своя постройка мира строителей: разобрать за половину цены, подписать табличку.
    const { ownOffer } = await import("./building-sale/bsale-own");
    const { accAccountId } = await import("../currency/move");
    const account = await accAccountId(wallet).catch(() => null);
    return {
      own: await ownOffer(account, mapId, data.q, data.r),
      effect,
      built,
      extra,
      repair: await forgeRepairShown(wallet, b.buildingId),
      name: b.name,
      tier: b.tier,
      tierName: current?.name ?? null,
      imageUrl: current?.imageUrl ?? null,
      nextName: next?.name ?? null,
      nextImageUrl: next?.imageUrl ?? null,
      /** Дальше строить некуда — последний тир. */
      final: !next,
      price,
      costs,
      requires,
      canBuild: !!next && !!costs && costs.length > 0 && fit.ok,
      blockReason: next ? (costs?.length ? (fit.reason ?? null) : "Цена не задана") : null,
      hero,
    };
  });

/** Построить следующий тир: проверка героя, оплата, смена облика. */
export const buildNextTier = createServerFn({ method: "POST" })
  .inputValidator(cellInput)
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    const pos = await playerCell(wallet);
    requireAdjacent(pos, data.q, data.r);
    await requireNotVoid(wallet, mapId, data.q, data.r);

    const b = await loadCellBuilding(mapId, data.q, data.r);
    if (!b) throw new Error("Здесь нет постройки");
    if (isMushroomConfig(b.config)) throw new Error("dmine.no_upgrade");
    const { next, costs, requires } = offerOf(b.tiers, b.tier);
    if (!next) throw new Error("Постройка уже на верхнем тире");
    if (!costs || costs.length === 0) throw new Error("Для этого перехода не задана цена");

    const hero = await selectedHero(wallet);
    const fit = heroFits(requires, hero);
    if (!fit.ok) throw new Error(fit.reason ?? "Твой герой не подходит");
    if (b.effect === "portal") await requireIslandGate(wallet, mapId);
    if (b.effect === "portal" && (await isDemoMap(mapId))) throw new Error(noExitText(mapId));

    // Ступень занимаем ДО оплаты и только ту, которую прочитали. Прежний
    // безусловный `tier + 1` при двух одновременных нажатиях уводил постройку
    // на тир выше последнего — здание пропадало с карты у ВСЕХ, и оба
    // плательщика теряли лайки.
    const rows = (await mcpExec(
      `INSERT INTO yuplink.beta_raid_building_state (map_id, q, r, tier, updated_at, updated_by)
       VALUES (${sqlStr(mapId)}, ${data.q}, ${data.r}, ${b.tier + 1}, now(), ${sqlStr(wallet)})
       ON CONFLICT (map_id, q, r) DO UPDATE
          SET tier = yuplink.beta_raid_building_state.tier + 1,
              updated_at = now(), updated_by = ${sqlStr(wallet)}
        WHERE yuplink.beta_raid_building_state.tier = ${b.tier}
       RETURNING tier;`,
      { wrapJsonCte: true },
    )) as Array<{ tier: number }>;
    if (!rows?.length) throw new Error("Постройку уже подняли — открой её заново");

    // Ключ платежа включает ПЛАТЕЛЬЩИКА: без него повторный подход к той же
    // ступени другим игроком считался бы уже оплаченным.
    // Постройка игрока мира строителей — ещё и ключ установки: разобрал и поставил
    // заново — та же ступень снова платная (иначе ключ «уже проведён» = даром).
    const { placeEpoch } = await import("./building-sale/bsale-own");
    const ref = `build:${mapId}:${data.q}:${data.r}:${b.tier}:${wallet}${await placeEpoch(mapId, data.q, data.r)}`;
    // Платим ВСЕМИ строками цены разом (дерево + камень + …): общий модуль
    // сам откатит уже списанное, если какая-то строка не прошла.
    const { payResources } = await import("./resource-pay");
    try {
      await payResources(wallet, costs, ref);
    } catch (e) {
      // Не заплатил — ступень возвращаем, иначе постройка уедет бесплатно.
      await mcpExec(
        `UPDATE yuplink.beta_raid_building_state SET tier = ${b.tier}, updated_at = now()
          WHERE map_id = ${sqlStr(mapId)} AND q = ${data.q} AND r = ${data.r}
            AND tier = ${b.tier + 1};`,
      ).catch(() => undefined);
      throw e;
    }
    // Энергия среди строк цены — в причины трат (best-effort, без await).
    void noteEnergyInPrices(wallet, costs, "build");

    // Тир вырос — снимок карты устарел: иначе соседи видели бы прежний облик
    // до конца срока кэша.
    const { dropMapBase } = await import("./map-base");
    dropMapBase();
    // Достроенный склад сразу принимает урожай (кэш складов карты — 30 с).
    (await import("./warehouse-map-cells")).forgetWarehouseCells(mapId);
    publishRaid({ mapId, type: "built", cells: [`${data.q},${data.r}`] });
    // Тир — в журнал карты: соседи видят новый облик дельтой, без перекачки.
    {
      const { recordMapChange } = await import("./map-journal");
      const tier = Number(rows?.[0]?.tier ?? b.tier + 1);
      await recordMapChange(mapId, { patches: [{ q: data.q, r: data.r, tier }] }).catch(() => 0);
    }
    return { ok: true as const, tier: Number(rows?.[0]?.tier ?? b.tier + 1), name: next.name };
  });
