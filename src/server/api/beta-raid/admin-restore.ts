// Восстановление объектов на активной карте — кнопка для админа.
//
// Босс убит, сундуки вскрыты, монетки собраны — карта пустеет и тестировать
// нечего. Здесь всё выбранное возвращается к полному HP разом.
//
// Клетки, на которых СЕЙЧАС стоят игроки, не трогаем: иначе объект оживёт
// прямо под ногами и заблокирует клетку, на которой человек стоит.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { requireAdmin } from "../../auth";
import { godMapId } from "./god-map";
import { publishRaid } from "../../raidLive";
import { purgeMapBase } from "./map-base";
import { bossLevelSql } from "./bossLevelFilter";
import { readDaraiHold, settleDaraiHold } from "./map-darai-hold";
import { POS_MAP_SQL } from "./pos-map-sql";

// Подсчёт «сколько чего вернётся» живёт отдельным модулем (правило ≤250 строк):
// там разбивка по валютам, здесь — само восстановление.
export { adminRaidRestorePreview } from "./admin-restore-preview";
export type { RestorePreview, PreviewKind, ResourceGroup } from "./admin-restore-preview";
import { BOSS_TEMPLATE_JOIN, resourceFilterSql } from "./restore-reward-sql";
import { returnRunnersHome } from "./runner-home";
import { assertRestoreUsdt } from "./restore-usdt";
import { droppable } from "../craft/crafted-sql";

/** Что восстанавливаем — галочки в админ-блоке на экране рейда. */
const inputSchema = z.object({
  boss: z.boolean().optional(),
  /** Диапазон уровней боссов: «1-10» вернёт только боссов 1..10 уровня. */
  bossLevelFrom: z.number().int().min(1).max(100).optional(),
  bossLevelTo: z.number().int().min(1).max(100).optional(),
  chests: z.boolean().optional(),
  coins: z.boolean().optional(),
  artifacts: z.boolean().optional(),
  /**
   * Поднимать ли объекты, которые платят этой валютой. Снятая галочка держит
   * их мёртвыми — и пул они не качают. По умолчанию обе включены: так кнопка
   * работает ровно как до появления фильтра.
   */
  withDarai: z.boolean().optional().default(true),
  withUsdt: z.boolean().optional().default(true),
});

/**
 * Монетка и сундук в базе — один вид (chest), различаются запасом HP:
 * у монетки он равен 1, выбивать нечего. Тем же правилом живёт и карта.
 */
const KIND_SQL = {
  // Босса поднимаем ТОЛЬКО павшего. Подранок — это чужой начатый бой: игрок
  // выбил половину полосы, ушёл за энергией, а кнопка админа возвращала боссу
  // полное здоровье и обнуляла ему всю работу.
  boss: `c.object_id LIKE 'boss:%' AND h.killed_at IS NOT NULL`,
  chests: `t.kind = 'chest' AND COALESCE((t.meta->>'maxHp')::numeric, 10000) > 1`,
  coins: `t.kind = 'chest' AND COALESCE((t.meta->>'maxHp')::numeric, 10000) <= 1`,
  artifacts: `t.kind = 'artifact' AND ${droppable("t")}`,
} as const;

export const adminRestoreRaidObjects = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    const wanted = (Object.keys(KIND_SQL) as Array<keyof typeof KIND_SQL>).filter((k) => data[k]);
    if (wanted.length === 0) throw new Error("Не выбрано, что восстанавливать");

    const mapId = await godMapId();
    // Диапазон касается ТОЛЬКО боссов: сундукам и монеткам уровня не завезли.
    const levels = bossLevelSql(data.bossLevelFrom, data.bossLevelTo);
    const kindFilter = wanted
      .map((k) => (k === "boss" ? `(${KIND_SQL[k]}${levels})` : `(${KIND_SQL[k]})`))
      .join(" OR ");

    // Каждый поднятый объект снова обещает игроку свою награду, поэтому её
    // номинал заново закладывается в пул карты. Снимок берём ДО подъёма: после
    // него уже не отличить «забрал игрок» от «стоял нетронутым».
    const hold = await readDaraiHold(mapId, null);

    // Валюта решает отдельно от вида: объект, который платит запрещённой
    // монетой, остаётся мёртвым — и пул за него не двигается.
    const resourceOk = resourceFilterSql("c", { darai: data.withDarai, usdt: data.withUsdt });
    // USDT — живые деньги: поднимаем, только если хватает свободного с запасом (§8.49а).
    if (data.withUsdt) {
      await assertRestoreUsdt(mapId, kindFilter, (o) =>
        resourceFilterSql(o, { darai: data.withDarai, usdt: true }),
      );
    }

    // Убегающие возвращаются ДОМОЙ — на клетку, куда их поставил админ, а не
    // туда, где их застало последнее бегство. Делается ДО общего подъёма: те,
    // кто вернулся в свою клетку, поднимаются уже вместе со всеми.
    const home = await returnRunnersHome({
      mapId,
      // Те же условия, но про строку беглеца: у него своя таблица и своё
      // боевое состояние. Оговорку «только павшего» для беглецов снимаем:
      // восстановление возвращает карту к тому виду, в каком её собрали, а
      // живой гриб в десяти клетках от своего места — это не тот вид.
      kindFilter: kindFilter.replace(/\bc\./g, "rn.").replace(/AND h\.killed_at IS NOT NULL/g, ""),
      resourceOk: resourceFilterSql("rn", { darai: data.withDarai, usdt: data.withUsdt }),
    }).catch((e) => {
      console.warn("[beta-restore] беглецы домой не вернулись:", e);
      return { returned: 0, parked: 0 };
    });

    const rows = (await mcpExec(
      `UPDATE yuplink.beta_raid_object_hp h
          SET current_hp = h.max_hp, killed_at = NULL, killed_by = NULL,
              -- новая жизнь объекта: награда за неё ещё не роздана, а урон
              -- прошлой жизни в дележе не участвует
              generation = h.generation + 1, updated_at = now(),
              -- урон прошлой жизни отсекается и по времени: так зачёт не
              -- разъедется, даже если объект оживят мимо этой кнопки
              life_started_at = now()
        FROM yuplink.raid_map_cells c
        LEFT JOIN yuplink.mystic_item_template t
               ON t.id = CASE WHEN c.object_id LIKE '%:%'
                              THEN split_part(c.object_id, ':', 2) ELSE c.object_id END
        ${BOSS_TEMPLATE_JOIN("c")}
        WHERE c.map_id = h.map_id AND c.q = h.q AND c.r = h.r
          AND h.map_id = '${mapId}' AND h.cycle_no = 0
          AND (h.killed_at IS NOT NULL OR h.current_hp < h.max_hp)
          AND (${kindFilter})
          AND (${resourceOk})
          -- клетка занята игроком — не оживляем
          AND NOT EXISTS (
            SELECT 1 FROM yuplink.beta_raid_positions p
             WHERE p.q = h.q AND p.r = h.r AND ${POS_MAP_SQL("p")} = h.map_id
          )
        RETURNING h.q, h.r, h.id;`,
      { wrapJsonCte: true },
    )) as Array<{ q: number; r: number; id: string }>;

    await settleDaraiHold(hold);

    // Метка «награда за этот объект уже роздана» жила без поколения: после
    // восстановления объект бился, но ничего не отдавал.
    for (const row of rows ?? []) {
      await mcpExec(
        `DELETE FROM yuplink.raid_reward_distributed WHERE scope_key = 'beta:${row.id}';`,
      ).catch(() => {});
    }

    // Сколько пропустили из-за игроков — админу полезно видеть.
    const skipped = (await mcpExec(
      `SELECT count(*)::int AS n
         FROM yuplink.beta_raid_object_hp h
         JOIN yuplink.beta_raid_positions p
           ON p.q = h.q AND p.r = h.r AND ${POS_MAP_SQL("p")} = h.map_id
        WHERE h.map_id = '${mapId}' AND h.cycle_no = 0
          AND (h.killed_at IS NOT NULL OR h.current_hp < h.max_hp);`,
      { wrapJson: true },
    )) as Array<{ n: number }>;

    // Карта ожила — у всех открытых экранов она перерисуется сразу.
    if ((rows?.length ?? 0) > 0 || home.returned > 0 || home.parked > 0) {
      // Жёсткий сброс: тот же admin/скрипт восстановления сразу перечитает,
      // и stale-снапшот скрыл бы поднятые объекты за фоновый refresh.
      purgeMapBase(mapId);
      const { noteMapRebuilt } = await import("./map-change-hooks");
      await noteMapRebuilt(mapId);
      publishRaid({ mapId, type: "restored" });
    }

    return {
      ok: true as const,
      restored: rows?.length ?? 0,
      skippedUnderPlayers: Number(skipped?.[0]?.n ?? 0),
      /** Убегающие: вернулись в свою клетку / переехали домой слоем. */
      runnersHome: home.returned,
      runnersParked: home.parked,
    };
  });
