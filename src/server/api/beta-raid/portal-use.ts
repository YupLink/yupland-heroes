// Проход через портал: заплатил — и вышел в случайном портале своей сети.
//
// Дверь (сеть 0) работает тем же входом, но никуда не переносит: берёт плату,
// пропускает и на этом всё. Так на карте появляются платные ворота.
//
// Порядок жёсткий: проверки → деньги → перенос. Не хватило денег — шага не
// было; перенос не удался — деньги возвращаются (payPortal откатывает сам,
// здесь возвращаем уже снятое целиком).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireBetaRaid } from "./gate";
import { myMapId, playerCell, requireAdjacent } from "./encounter-where";
import { leaveShipBehind, movePlayerThroughPortal, portalShipContext } from "./portal-ship";
import { requireNotVoid } from "./voidGate";
import { loadCellBuilding } from "./building-action";
import { isBuilt } from "@/lib/buildingEffect";
import { heroLevelFits, isDoor, moveEnergyFits, portalConfig } from "@/lib/portal";
import { selectedHeroRow } from "./hero-current";
import { pickExit, portalExits, roomOf } from "./portal-exits";
import { isLiveMap } from "./floors";
import { payPortal, refundPortal } from "./portal-pay";
import { publishRaid } from "../../raidLive";
import { raidOwner } from "./owner";
import { notePricesPaid } from "./econ/trade-hooks";
import { finishIsland, islandPortalExit } from "./island/island-exit";
import type { PortalConfig } from "@/lib/portal";

/**
 * Комната портала: номер сети на этаже назначения (пусто — на своём). Выход —
 * любой другой портал этой комнаты на открытом этаже: так порталы разных этажей
 * в одной комнате ведут друг в друга. Закрытый этаж (черновик) не пускает —
 * игрока в недоделанный мир. Выясняем ДО оплаты: комната из одного портала не
 * должна забирать деньги за проход в никуда.
 */
async function networkExit(cfg: PortalConfig, mapId: string, q: number, r: number) {
  const room = roomOf(cfg, mapId);
  if (room.mapId !== mapId && !(await isLiveMap(room.mapId))) {
    throw new Error("braid.portal_floor_closed");
  }
  const exit = pickExit(await portalExits(room, { mapId, q, r }));
  if (!exit)
    throw new Error(room.mapId !== mapId ? "braid.portal_floor_empty" : "braid.portal_alone");
  return exit;
}

export const enterBetaPortal = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d))
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    // Стоять надо рядом — как у любой другой постройки. Заодно это не даёт
    // прыгать по сети, не доходя до входа ногами.
    const at = await playerCell(wallet);
    requireAdjacent(at, data.q, data.r);
    await requireNotVoid(wallet, mapId, data.q, data.r);

    const b = await loadCellBuilding(mapId, data.q, data.r);
    if (!b) throw new Error("Здесь нет постройки");
    if (b.effect !== "portal") throw new Error("Это не портал");
    if (!isBuilt(b.tier, b.tiers.length)) throw new Error("Портал ещё строится");

    const cfg = portalConfig(b.config);
    // Уровень берём у ВЫБРАННОГО героя: портал судит по тому, кем игрок ходит
    // по карте, а не по лучшему герою в инвентаре.
    const hero = await selectedHeroRow(wallet);
    if (!heroLevelFits(cfg, hero ? Number(hero.level) : null)) {
      throw new Error(
        hero
          ? `Нужен герой ${Math.min(cfg.levelFrom, cfg.levelTo)}–${Math.max(cfg.levelFrom, cfg.levelTo)} уровня`
          : "Сначала выбери героя",
      );
    }
    // Порог по «пройденной» энергии: пропускает только если игрок уже
    // потратил на шаги минимум N. Считаем счёт по move-energy-spent — тот же,
    // что инкрементирует move-step.
    if (cfg.moveEnergyMinOn && cfg.moveEnergyMin > 0) {
      const { moveEnergySpent } = await import("./move-energy-spent");
      const spent = await moveEnergySpent(wallet);
      if (!moveEnergyFits(cfg, spent)) {
        throw new Error(`Пройди ещё ${Math.max(0, cfg.moveEnergyMin - spent)}⚡ по клеткам`);
      }
    }

    // Дверь кнопкой не открывают: плату за неё берёт САМ ШАГ на клетку
    // (gate-toll). Пока кнопка была, дверь брала дважды — и её можно было
    // жать, уже стоя на пороге, списывая цену за пустоту.
    if (isDoor(cfg)) throw new Error("braid.gate_on_step");

    // Портал острова новичка ведёт прямо в основной мир (island-exit).
    const islandExit = await islandPortalExit(wallet, mapId);
    const exit = islandExit ?? (await networkExit(cfg, mapId, data.q, data.r));
    const crossMap = exit.mapId !== mapId ? exit.mapId : null;
    // Мир строителей (lib/landPlace) — пока только тем, кому открыта фича
    // builder_world (админам всегда). Выйти из него можно всегда.
    if (crossMap) {
      const { isBuilderWorld } = await import("./land/builder-world");
      if (await isBuilderWorld(crossMap)) {
        const { canUseFeature } = await import("../testers");
        if (!(await canUseFeature(wallet, "builder_world"))) throw new Error("builder.closed");
      }
    }

    // Свой этаж: судно проходит переход вместе с капитаном. На другой этаж судно
    // не едет — остаётся у входа (leaveShipBehind ниже), а на водном выходе
    // игрок садится в свободное судно или выходит на ближайший берег.
    const ctx = crossMap
      ? { ship: null, exitWater: (await portalShipContext(wallet, crossMap, exit)).exitWater }
      : await portalShipContext(wallet, mapId, exit);

    const ref = `portal:${mapId}:${data.q},${data.r}:${nanoid(10)}`;
    await payPortal(wallet, cfg.prices, ref);

    const leftShip = crossMap ? await leaveShipBehind(wallet) : false;
    // Карта выхода уходит в позицию: на другом этаже игрок с этого шага там.
    const res = await movePlayerThroughPortal(wallet, exit.mapId, exit, ctx);
    if (!res.moved) {
      // Деньги возвращаем: перехода не было. Так же ведёт себя любой отказ
      // после оплаты — иначе портал брал бы за неслучившийся шаг. Ключ — тот же,
      // что у оплаты: по нему возврат находит снимок списанного товара (вид и
      // метки происхождения, ПРАВИЛА §8.18); ключи возврата получат свой `:back`.
      await refundPortal(wallet, cfg.prices, ref);
      throw new Error("Портал не сработал — попробуй ещё раз");
    }
    const islandCut = islandExit ? await finishIsland(wallet, mapId) : null;
    // Переход состоялся — плата в журнал сделок (и энергия в причины трат); best-effort.
    void notePricesPaid({
      source: "portal",
      wallet,
      mapId,
      q: data.q,
      r: data.r,
      prices: cfg.prices,
      ref,
    });

    // Свой этаж — с клетками (точка переезжает у соседей без перечитки).
    // Между этажами: на прежнем точка исчезает, на новом появляется — оба
    // этажа перечитывают раскладку, каждый своим событием.
    if (crossMap) {
      publishRaid({ mapId, type: "moved" });
      publishRaid({ mapId: crossMap, type: "moved" });
    } else {
      publishRaid({
        mapId,
        type: "moved",
        from: { q: at.q, r: at.r },
        to: { q: exit.q, r: exit.r },
      });
    }
    // Судно осталось у входа — на прежнем этаже.
    if (leftShip) publishRaid({ mapId, type: "ships" });
    // map — новый этаж: клиент по нему перекачивает карту целиком.
    return { ok: true as const, q: exit.q, r: exit.r, ship: res.mode, map: crossMap, islandCut };
  });
