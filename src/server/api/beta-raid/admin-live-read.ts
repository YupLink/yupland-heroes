// Что сейчас на клетке боевой карты — глазами админа.
//
// Игроку карта показывает только то, что он разведал, и без имён. Админу,
// который правит мир на ходу, нужно обратное: полный состав клетки, живой ли
// объект, какой тир у постройки и кто именно там стоит.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { requireAdmin } from "../../auth";
import { sqlStr, type RewardConfig } from "../raid-shared";
import { POS_MAP_SQL } from "./pos-map-sql";
import { isVoidFlag } from "./packCells";
import { cellBuildingEffect, signText, type BuildingEffect } from "@/lib/buildingEffect";
import type { PortalConfig } from "@/lib/portal";
import { requireGodAdmin } from "@/server/api/beta-raid/island/island-editor-auth";

const cellInput = (d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d);

/** Что админ мог перенастроить у объекта на конкретной клетке. */
/** Конфиг постройки на клетке (сериализуемый) — для настройки шахты/таблички
 *  в режиме бога. Прочие постройки кладут сюда свои ключи, читаем лишь нужные. */
export type BuildingCellConfig = {
  resource?: string;
  yield?: number;
  captureCost?: number;
  token?: string | null;
  text?: string;
  /** Настройка портала этой клетки: сеть, уровень героя, цена прохода. */
  portal?: PortalConfig;
};

export type CellObjectConfig = {
  maxHp?: number;
  interactionCost?: number;
  badgeLabel?: string | null;
  rewardConfig?: RewardConfig;
};

export type AdminCellView = {
  q: number;
  r: number;
  terrain: { id: string; name: string } | null;
  /**
   * Клетка накрыта глухим туманом. Свойство КЛЕТКИ, а не её местности: купол
   * лежит поверх и ничего под собой не переписывает — местность под ним своя
   * и настоящая.
   */
  voidFog: boolean;
  decoration: { id: string; name: string } | null;
  /**
   * Живость объекта здесь НЕ отдаётся намеренно: её на всю карту знает живой
   * список (["beta-raid-players"]) — он обновляется событиями сразу, а этот
   * ответ был вторым источником и расходился с ним. Окно клетки писало «жив»
   * про уже добытого босса, и «погасить» на нём ничего не меняло.
   */
  object: {
    id: string;
    name: string;
    /** Правки этого объекта на ЭТОЙ клетке: HP, цена входа, награды. */
    config: CellObjectConfig | null;
  } | null;
  /**
   * Беглец, стоящий на этой клетке (runners.ts). Слоем клетки он НЕ является:
   * правки клетки его не трогают, и «убрать» у него своё (adminRemoveRunner).
   */
  runner: { id: string; name: string } | null;
  building: {
    id: string;
    name: string;
    tier: number;
    tiers: number;
    /** Что постройка даёт достроенной — по нему видно табличку. */
    effect: BuildingEffect;
    /** Текст таблички на ЭТОЙ клетке. */
    text: string;
    /** building_config клетки — для настройки шахты в режиме бога. */
    config: BuildingCellConfig | null;
  } | null;
  /** Кто стоит на клетке — админу можно и по именам. */
  players: string[];
};

/** Полный состав клетки: местность, что на ней стоит и кто на ней стоит. */
export const getAdminCell = createServerFn({ method: "GET" })
  .inputValidator(cellInput)
  .handler(async ({ data }): Promise<AdminCellView> => {
    const { mapId } = await requireGodAdmin();
    // Алиас обязателен у КАЖДОГО поля: в запросе клетки шесть JOIN, и голое
    // `q` там неоднозначно.
    const cellWhere = `c.map_id = ${sqlStr(mapId)} AND c.q = ${data.q} AND c.r = ${data.r}`;

    // Дорогу здесь НЕ спрашиваем нарочно: окно клетки берёт её из того же кэша
    // карты, что и рисует (patchMapCache.readCellDetails), — иначе невыгруженный
    // мазок кистью и показанная дорога расходились бы. Вторым источником эта
    // колонка была бы ровно тем расхождением, ради которого разбор свели в одно
    // место (map-roads).
    const cells = (await mcpExec(
      `SELECT c.terrain_id, c.decoration_id, c.object_id, c.building_id,
              c.void_fog, t.name AS terrain_name, rn.object_id AS runner_id,
              d.name AS decor_name,
              b.name AS building_name, b.meta AS building_meta, c.building_config, c.object_config,
              COALESCE(s.tier, 0) AS tier
         FROM yuplink.raid_map_cells c
         LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
         LEFT JOIN yuplink.mystic_item_template d ON d.id = c.decoration_id
         LEFT JOIN yuplink.mystic_item_template b ON b.id = c.building_id
         LEFT JOIN yuplink.beta_raid_building_state s
                ON s.map_id = c.map_id AND s.q = c.q AND s.r = c.r
         LEFT JOIN yuplink.beta_raid_runner rn
                ON rn.map_id = c.map_id AND rn.q = c.q AND rn.r = c.r
        WHERE ${cellWhere} LIMIT 1;`,
      { wrapJson: true },
    )) as Array<Record<string, unknown>>;
    const row = cells?.[0] ?? {};

    // Суда окно клетки берёт из своего источника (["beta-raid-ships"]) — здесь
    // их не спрашиваем, это был лишний поход в базу на каждое открытие клетки.
    /** Имя объекта по его id — годится и для объекта клетки, и для беглеца. */
    const nameOf = (raw: unknown): Promise<Array<{ name: string | null }>> =>
      raw
        ? (mcpExec(
            `SELECT COALESCE(t.name, rbt.name) AS name
               FROM (SELECT ${sqlStr(String(raw))} AS raw) x
               LEFT JOIN yuplink.mystic_item_template t
                      ON t.id = split_part(x.raw, ':', 2) OR t.id = x.raw
               LEFT JOIN yuplink.raid_boss_template rbt ON rbt.id = split_part(x.raw, ':', 2)
              LIMIT 1;`,
            { wrapJson: true },
          ) as Promise<Array<{ name: string | null }>>)
        : Promise.resolve([]);

    const [players, objectName, runnerName] = await Promise.all([
      mcpExec(
        // Админу показываем адрес, если он у игрока есть, иначе сам аккаунт:
        // играть можно и без кошелька.
        `SELECT COALESCE((SELECT u.wallet FROM yuplink.users u
                           WHERE u.account_id = p.account_id
                           ORDER BY u.created_at LIMIT 1), p.account_id) AS wallet
           FROM yuplink.beta_raid_positions p
          WHERE p.q = ${data.q} AND p.r = ${data.r}
            AND ${POS_MAP_SQL("p")} = ${sqlStr(mapId)};`,
        { wrapJson: true },
      ) as Promise<Array<{ wallet: string }>>,
      nameOf(row.object_id),
      nameOf(row.runner_id),
    ]);

    const named = (id: unknown, name: unknown) =>
      id ? { id: String(id), name: String(name ?? id) } : null;
    const tiers = Array.isArray((row.building_meta as { tiers?: unknown[] } | null)?.tiers)
      ? ((row.building_meta as { tiers: unknown[] }).tiers.length as number)
      : 0;

    return {
      q: data.q,
      r: data.r,
      terrain: row.terrain_id
        ? { id: String(row.terrain_id), name: String(row.terrain_name ?? row.terrain_id) }
        : null,
      // Терпимое чтение флага — то же, что у карты: булево из row_to_json
      // приезжает и строкой, а строгое `=== true` молча открыло бы зону.
      voidFog: isVoidFlag(row.void_fog),
      decoration: named(row.decoration_id, row.decor_name),
      object: row.object_id
        ? {
            id: String(row.object_id),
            // Имя из шаблона, а нет шаблона — из снимка клетки: у босса,
            // пережившего удаление заготовки, окно клетки иначе показывало
            // техническое «boss:rbt_…» вместо названия (boss-snapshot).
            name: String(
              objectName?.[0]?.name ??
                (row.object_config as { tpl?: { name?: unknown } } | null)?.tpl?.name ??
                row.object_id,
            ),
            config: (row.object_config as CellObjectConfig | null) ?? null,
          }
        : null,
      runner: row.runner_id
        ? {
            id: String(row.runner_id),
            name: String(runnerName?.[0]?.name ?? row.runner_id),
          }
        : null,
      building: row.building_id
        ? {
            id: String(row.building_id),
            name: String(row.building_name ?? row.building_id),
            tier: Number(row.tier) || 0,
            tiers,
            effect: cellBuildingEffect(
              row.building_config,
              row.building_meta,
              String(row.building_name ?? ""),
            ),
            text: signText(row.building_config),
            config: (row.building_config as BuildingCellConfig | null) ?? null,
          }
        : null,
      players: (players ?? []).map((p) => p.wallet),
    };
  });
