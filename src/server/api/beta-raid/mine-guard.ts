// Босс-охранник шахты: владелец ставит купленного босса из рюкзака на СВОЮ
// шахту, тот стоит на защите. Пока охранник жив — шахту не захватить (сначала
// бой, mine-guard-attack.ts). Наград охранник не даёт: только функция охраны.
//
// Хранилище — своя таблица raid_mine_guard (PK map,q,r): один охранник на клетку,
// общий пул HP без регена. damage/abilities снимаются с шаблона при установке.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { actionGate } from "../../rateGate";
import { myMapId } from "./encounter-where";
import { accAccountId } from "../currency/move";
import { loadCellBuilding } from "./building-action";
import { isBuilt } from "@/lib/buildingEffect";
import { cellMineConfig } from "@/lib/mineConfig";
import { mineIslandOf } from "@/lib/mineV2";
import { isMushroomConfig } from "@/lib/mushroomKinds";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { nanoid } from "nanoid";
import { createHash } from "node:crypto";
import { packGuards, type GuardView, type GuardsWire } from "@/lib/mineGuardsWire";
import { resolveBackpack } from "./market-backpack";
import { loadEncounterTarget } from "./encounter-target";
import { publishRaid } from "../../raidLive";
import { isMyChestAt, requireChestNear, sqlRow } from "./chest/chest-row";
import { opDone, takeOneOrRelease } from "./backpack-take-once";
import { claimGuardSql } from "./mine-guard-claim";
import { placeChestGuard } from "@/server/api/beta-raid/chest/chest-guard-place";

// Чтение строки и вид охранника — в mine-guard-read.ts (лимит на размер файла);
// ре-экспорт, чтобы вызывающие (бой, окно шахты) не переезжали.
export {
  guardAbilities,
  guardAlive,
  guardViewIfAlive,
  loadGuardRow,
  type GuardRow,
  type MineGuardView,
} from "./mine-guard-read";
import { abilityView, guardAlive, loadGuardRow, type MineGuardView } from "./mine-guard-read";

/** Гейт захвата: живой охранник — захват запрещён, сначала бой. */
export async function requireMineGuardDefeated(mapId: string, q: number, r: number): Promise<void> {
  const g = await loadGuardRow(mapId, q, r);
  if (guardAlive(g)) throw new Error("Сначала победи охранника шахты");
}

/**
 * Снять ТОЛЬКО поверженного охранника (при захвате). Мёртвый обычно уже удалён
 * (одноразовый), но труп мог зависнуть, если DELETE при добивании не прошёл —
 * тогда чистим по killed_at или нулю HP. Живого (владелец успел поставить
 * нового в окне между гейтом и снятием) НЕ трогаем.
 */
export async function clearDefeatedGuard(mapId: string, q: number, r: number): Promise<void> {
  await mcpExec(
    `DELETE FROM yuplink.raid_mine_guard
      WHERE map_id=${sqlStr(mapId)} AND q=${q} AND r=${r}
        AND (killed_at IS NOT NULL OR current_hp <= 0);`,
  ).catch(() => {});
}

/**
 * Поставить босса из рюкзака на СВОЮ шахту (или к своему магическому
 * сундуку). Проверки: это построенная шахта, владелец — я, живого охранника
 * ещё нет. Списываем одного босса из стека рюкзака выбранного героя и снимаем
 * HP/урон/способности с шаблона.
 */
export const placeMineGuard = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ q: z.number().int(), r: z.number().int(), stackKey: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true; guard: MineGuardView }> => {
    const wallet = await requireBetaRaid();
    await actionGate("mine-guard-place", wallet);
    const mapId = await myMapId(wallet);
    const account = await accAccountId(wallet);
    if (!account) throw new Error("Нужен аккаунт — привяжи Telegram");

    // Магический сундук (правило владельца 28.09.2026): охрана по желанию —
    // сюда владелец приходит, когда охраны на его сундуке нет. Сундук — не
    // постройка, шахтные проверки ему не нужны, а вот стоять надо рядом.
    const onChest = await isMyChestAt(mapId, data.q, data.r, account);
    if (onChest) {
      await requireChestNear(wallet, mapId, data.q, data.r);
    } else {
      // Это построенная и настроенная шахта.
      const b = await loadCellBuilding(mapId, data.q, data.r);
      if (!b) throw new Error("Здесь нет постройки");
      if (b.effect !== "mine") throw new Error("Это не шахта");
      // На DARAI-шахту охрану не ставят (владелец, 22.10.2026; lib/daraiMine).
      if (isMushroomConfig(b.config)) throw new Error("dmine.no_guard");
      if (!isBuilt(b.tier, b.tiers.length)) throw new Error("Шахта ещё не построена");
      // Шахта острова (§8.59 п. 11) живёт 7 дней и истощается — босс сбежал бы.
      if (mineIslandOf(b.config) && isIslandMapId(mapId)) {
        throw new Error("braid.mine_island_no_guard");
      }

      // Владелец шахты — я (охрану ставят только на свою захваченную шахту).
      // Сломанная v2 (§8.59) ничья: охрана с неё сбежит при уборке — не ставим.
      const { loadMineCell } = await import("./mine-v2-read");
      const cell = await loadMineCell(mapId, data.q, data.r);
      if (cell.view?.broken) throw new Error("braid.mine_broken");
      if (cell.owner !== account) {
        throw new Error("Охрану можно поставить только на свою шахту");
      }
    }

    // Быстрый ранний отказ (атомарно закрепим ниже — тут просто вежливая ошибка).
    if (guardAlive(await loadGuardRow(mapId, data.q, data.r))) {
      throw new Error("Охранник уже стоит");
    }

    // Из рюкзака выбираем ТОЛЬКО босса: ключ стека boss:<templateId>.
    if (!data.stackKey.startsWith("boss:")) throw new Error("Это не босс");
    const templateId = data.stackKey.slice("boss:".length);
    const tpl = await loadEncounterTarget(`boss:${templateId}`);
    if (!tpl) throw new Error("Босс не найден");
    // Охрана сундука — закреп и списание босса одним оператором: «Забрать
    // сундук» вернёт её боссом, и неоплаченная строка охраны стала бы дюпом.
    if (onChest) {
      const at = { mapId, q: data.q, r: data.r };
      return placeChestGuard({ ...at, wallet, account, stackKey: data.stackKey, templateId, tpl });
    }

    const bp = await resolveBackpack(wallet);
    if (!bp) throw new Error("Нет выбранного героя — у рюкзака владелец герой");

    // АТОМАРНО закрепляем клетку за охранником ДО списания босса. Ставим (или
    // заменяем МЁРТВОГО) только если живого ещё нет. Не закрепили — клетку уже
    // занял живой (гонка/дабл-тап), и мы выходим НЕ тронув рюкзак. Ключ
    // операции (mine-guard-claim.ts) отличает повтор моста от чужого охранника,
    // а ошибку после коммита — от «не закрепили».
    const nonce = nanoid(12);
    const op = `guardplace:${nonce}`;
    const claimed = await mcpExec(
      claimGuardSql({ mapId, q: data.q, r: data.r, account, templateId, tpl, op }),
    ).then(
      (rows) => {
        const row = sqlRow<{ placed: boolean; mine?: boolean }>(rows as unknown[]);
        if (row?.placed === true) return true;
        // Под локом шахты её уже нет или она не моя (забрали, отбили).
        if (row?.mine === false) throw new Error("Охрану можно поставить только на свою шахту");
        return false;
      },
      async (e: unknown) => {
        if (await opDone(op)) return true;
        throw e;
      },
    );
    if (!claimed) throw new Error("Охранник уже стоит");

    // Клетка закреплена — теперь списываем босса, со своим ключом. Не хватило
    // (пустой стек/чужой вид) — закреп снимается, только если списания точно
    // не было (backpack-take-once.ts), и шахта остаётся без охраны.
    const took = await takeOneOrRelease({
      heroId: bp.heroId,
      stackKey: data.stackKey,
      op: `guardplace-take:${nonce}`,
      kind: "boss",
      hold: {
        table: "yuplink.raid_mine_guard",
        where: `map_id=${sqlStr(mapId)} AND q=${data.q} AND r=${data.r}
                AND owner_account=${sqlStr(account)}`,
      },
    });
    if (!took) throw new Error("Нет такого босса в рюкзаке");
    // Другим игрокам подсветить, что на клетке что-то поменялось.
    publishRaid({ mapId, type: "built", mine: true, cells: [`${data.q},${data.r}`] });
    return {
      ok: true as const,
      guard: {
        templateId,
        name: tpl.name,
        image: tpl.imageUrl,
        background: tpl.backgroundUrl,
        maxHp: tpl.maxHp,
        currentHp: tpl.maxHp,
        alive: true,
        damage: tpl.damage != null ? String(tpl.damage) : null,
        // При установке способности берём напрямую из шаблона — их же
        // положат в базу и вернёт guardViewIfAlive следующим чтением.
        abilities: (tpl.abilities ?? []).map(abilityView),
      },
    };
  });

/** Живые охранники на активной карте — для оверлея (рисуем поверх шахты). */
export const getMineGuards = createServerFn({ method: "GET" })
  // since — версия охраны у клиента (lib/mineGuardsWire). Без неё (клиент до
  // выката) — прежний ответ целиком, чтобы его карта не осталась без охраны.
  .inputValidator((d: unknown) =>
    z
      .object({ since: z.string().max(64) })
      .optional()
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ guards: Record<string, GuardView> } | GuardsWire> => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    const rows = (await mcpExec(
      `SELECT q, r, boss_template_id, image, name
           FROM yuplink.raid_mine_guard
          WHERE map_id=${sqlStr(mapId)} AND killed_at IS NULL AND current_hp > 0;`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{
      q: number;
      r: number;
      boss_template_id: string;
      image: string | null;
      name: string;
    }>;
    const guards: Record<string, GuardView> = {};
    for (const row of rows ?? []) {
      guards[`${Number(row.q)},${Number(row.r)}`] = {
        templateId: row.boss_template_id,
        image: row.image,
        name: row.name,
      };
    }
    if (!data) return { guards };
    const wire = packGuards(guards);
    const v = createHash("sha1").update(JSON.stringify(wire)).digest("base64url").slice(0, 16);
    return data.since === v ? { v, same: true } : { v, ...wire };
  });
