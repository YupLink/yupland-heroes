// Пробежка оптимизации: VACUUM ANALYZE горячих таблиц + сброс SWR-кэшей карты.
//
// Ночной pg_cron делает ту же работу глобально, но между запусками таблицы с
// частыми апдейтами (позиции игроков, ledger, лут) успевают протухнуть
// статистикой и рассыпать планы. Эту ручку админ дёргает вручную «когда
// лагает».
//
// Никаких REINDEX и никаких дорогих DDL — только сбор статистики и уборка
// dead tuples. VACUUM без FULL не блокирует чтение/запись.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "../db/mcpClient";
import { requireAdmin } from "../auth";

/** Горячие таблицы. Порядок — сначала карта и позиции (их читают чаще всего). */
const HOT_TABLES = [
  "raid_map_cells",
  "beta_raid_positions",
  "beta_raid_ship",
  "beta_raid_object_hp",
  "beta_raid_player_effects",
  "beta_raid_credit_wait",
  "raid_building_skin",
  "raid_building_group",
  "hero_instance",
  "user_game_item",
  "acc_ledger",
  "acc_move",
  "ticket_move",
  "user_energy",
  "chip_effects",
];

/**
 * Индексы, которые доводят top-10 slowlog: подсказки planner'у по горячим
 * фильтрам (map_id + cycle_no у HP, jsonb-путь у field-построек, статус у
 * chip_inventory). CONCURRENTLY = не блокирует запросы. `IF NOT EXISTS` —
 * повторный запуск не падает.
 */
const HOT_INDEXES: Array<{ name: string; sql: string }> = [
  {
    name: "raid_map_cells_map_building_idx",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS raid_map_cells_map_building_idx
            ON yuplink.raid_map_cells (map_id)
            WHERE building_id IS NOT NULL;`,
  },
  {
    name: "beta_raid_object_hp_map_cycle_idx",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS beta_raid_object_hp_map_cycle_idx
            ON yuplink.beta_raid_object_hp (map_id, cycle_no);`,
  },
  {
    name: "beta_raid_object_hp_killed_idx",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS beta_raid_object_hp_killed_idx
            ON yuplink.beta_raid_object_hp (map_id, killed_at)
            WHERE killed_at IS NOT NULL;`,
  },
  {
    name: "user_chip_inventory_wallet_status_idx",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS user_chip_inventory_wallet_status_idx
            ON yuplink.user_chip_inventory (wallet, status);`,
  },
  {
    name: "user_chip_inventory_account_status_idx",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS user_chip_inventory_account_status_idx
            ON yuplink.user_chip_inventory (account_id, status);`,
  },
  {
    name: "hero_instance_item_id_idx",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS hero_instance_item_id_idx
            ON yuplink.hero_instance (item_id)
            WHERE item_id IS NOT NULL;`,
  },
  {
    name: "hero_instance_account_template_idx",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS hero_instance_account_template_idx
            ON yuplink.hero_instance (account_id, template_id);`,
  },
  // Прямо под шаг игрока: `WHERE building_id IS NOT NULL AND
  // building_config->'field' IS NOT NULL AND …` — 321k вызовов/13мс на
  // прод-графике. B-tree по map_id уже стоит, узкое место дальше — jsonb.
  {
    name: "raid_map_cells_building_config_gin",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS raid_map_cells_building_config_gin
            ON yuplink.raid_map_cells USING gin (building_config jsonb_path_ops)
            WHERE building_config IS NOT NULL;`,
  },
  // Префиксный LIKE на object_id (объекты вроде 'boss_%', 'chest_%'):
  // 56k×23мс. text_pattern_ops умеет по префиксу.
  {
    name: "raid_map_cells_object_id_pattern_idx",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS raid_map_cells_object_id_pattern_idx
            ON yuplink.raid_map_cells (object_id text_pattern_ops)
            WHERE object_id IS NOT NULL;`,
  },
];

export const runOptimization = createServerFn({ method: "POST" }).handler(async () => {
  requireAdmin();
  const t0 = Date.now();
  const results: Array<{ table: string; ok: boolean; ms: number; error?: string }> = [];
  // 1. VACUUM (ANALYZE) горячих таблиц — планировщик получает свежую статистику.
  for (const t of HOT_TABLES) {
    const start = Date.now();
    try {
      await mcpExec(`VACUUM (ANALYZE) yuplink.${t};`);
      results.push({ table: t, ok: true, ms: Date.now() - start });
    } catch (e) {
      results.push({
        table: t,
        ok: false,
        ms: Date.now() - start,
        error: String((e as Error).message ?? e).slice(0, 200),
      });
    }
  }
  // 2. Пропущенные индексы. CONCURRENTLY — не блокирует читателей/писателей;
  //    IF NOT EXISTS — повторный клик просто ничего не делает. Если индекс
  //    сейчас строится параллельно, PG сам скажет и мы пометим ошибкой.
  const indexes: Array<{ name: string; ok: boolean; ms: number; error?: string }> = [];
  for (const idx of HOT_INDEXES) {
    const start = Date.now();
    try {
      await mcpExec(idx.sql);
      indexes.push({ name: idx.name, ok: true, ms: Date.now() - start });
    } catch (e) {
      indexes.push({
        name: idx.name,
        ok: false,
        ms: Date.now() - start,
        error: String((e as Error).message ?? e).slice(0, 200),
      });
    }
  }
  // Свежая статистика — сбросим и наш SWR-снапшот карт, чтобы следующий
  // запрос уже пошёл по новому плану.
  try {
    const { purgeMapBase } = await import("./beta-raid/map-base");
    purgeMapBase();
  } catch {
    /* модуль опциональный */
  }
  // Самые «горячие» запросы за смену — покажем 10 верхних для админа.
  let slow: Array<{ q: string; calls: number; total_ms: number; mean_ms: number }> = [];
  try {
    const rows = (await mcpExec(
      `SELECT substr(query, 1, 200) AS q,
              calls,
              round(total_exec_time)::int AS total_ms,
              round(mean_exec_time)::numeric(10,2) AS mean_ms
         FROM extensions.pg_stat_statements
        WHERE query NOT ILIKE '%pg_stat_statements%'
          AND query NOT ILIKE 'VACUUM%'
        ORDER BY total_exec_time DESC
        LIMIT 10;`,
      { wrapJson: true },
    ).catch(() => [])) as typeof slow;
    slow = rows ?? [];
  } catch {
    /* расширения может не быть — молча пропускаем */
  }
  return {
    ok: true,
    totalMs: Date.now() - t0,
    tables: results,
    indexes,
    slow,
  };
});
