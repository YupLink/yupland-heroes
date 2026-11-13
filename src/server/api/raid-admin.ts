// РЕЙД-ЛОКАЦИИ — параллельная надстройка над боссом (owner-gated, только владелец).
// НЕ трогает боевого недельного босса и его баланс. Боссы рейда живут в chip_boss
// с пометкой raid_node_id (вне active-очереди). Файл самодостаточный.
//
// Этот модуль — E1 (админ-настройки). Боевые/игровые серверфн (выбор локации,
// бой, навигация, сундуки, турнир, крон) добавляются в следующих этапах.
import { assertBossTemplateUsdt } from "./usdt-templates";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
// Рейды открыты всем админам (в т.ч. партнёру), не только
// владельцу: гейт requireAdmin (ADMIN_WALLETS), а не requirePayoutsAdmin.
import { requireAdmin } from "../auth";
import { assertNoUsdtFillers } from "@/lib/usdtBanned"; // ПРАВИЛА §8.49а
import { assertRewardMoneyRight } from "./reward-money";
import { parseAbilities } from "./beta-raid/abilities";
import { dropFleeCache } from "./beta-raid/flee-cells";
import { parseFiller, type Filler } from "./reward-filler";
import type {
  PgRaidLocation,
  PgRaidNode,
  PgRaidBossTemplate,
  PgChipBoss,
} from "../db/pg";
import { requireDesigner } from "@/server/api/beta-raid/island/island-editor-auth";
import {
  assertBossTemplateFree,
  requireCatalogEditor,
  withoutMoney,
} from "@/server/api/catalog-auth";

// ── Дефолты рейд-боссов (в тон недельному боссу; своя копия, чтобы не связываться
//    с модулем boss.ts). Балансовые числа боевого босса НЕ трогаем. ──
const R_ENERGY_COST = 10;
const R_DMG_BASE = 80;
const R_DMG_GROWTH = 1.6;
const R_DMG_VARIANCE = 0.15;
const R_LIKE_THRESHOLD = 1000;
const R_LIKE_REWARD = 0.1;
const R_HP_GROWTH_DEFAULT = 0; // в рейде HP задаёт админ, авто-рост не нужен
const DEFAULT_SPLIT = [25, 18, 13, 10, 8, 6, 5, 5, 5, 5];

const sqlStr = (v: string) => `'${String(v).replace(/'/g, "''")}'`;

// ── Reward-config (та же схема, что у босса: fillers/split/packs) ──
// Наполнитель берём из общего модуля (импорт в шапке файла): этот файл
// СОХРАНЯЕТ шаблоны боссов, с которых кормится карта, и своя усечённая копия
// типа молча теряла бы ссылку ресурса/товара при чтении-записи.
type PackReward = { packId: string; toPlace: number };
// Артефакт/герой как приз за место (из созданных, mystic_item_template).
type ItemReward = { itemTemplateId: string; toPlace: number };
type RewardConfig = {
  fillers: Filler[];
  split: number[];
  packs: PackReward[];
  items: ItemReward[];
};

function parseRewardConfig(v: unknown): RewardConfig {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const split =
      Array.isArray(o.split) && o.split.length
        ? (o.split as unknown[]).map((x) => Number(x) || 0)
        : [...DEFAULT_SPLIT];
    if (Array.isArray(o.fillers)) {
      return {
        fillers: (o.fillers as Record<string, unknown>[])
          .map(parseFiller)
          .filter((fl): fl is Filler => fl !== null),
        split,
        packs: Array.isArray(o.packs)
          ? (o.packs as Record<string, unknown>[]).map((p) => ({
              packId: String(p.packId),
              toPlace: Number(p.toPlace) || 0,
            }))
          : [],
        items: Array.isArray(o.items)
          ? (o.items as Record<string, unknown>[]).map((p) => ({
              itemTemplateId: String(p.itemTemplateId),
              toPlace: Number(p.toPlace) || 0,
            }))
          : [],
      };
    }
  }
  return { fillers: [], split: [...DEFAULT_SPLIT], packs: [], items: [] };
}

const rewardConfigSchema = z.object({
  fillers: z
    .array(
      z.object({
        // Ресурс счёта и свой товар — такие же наполнители, только со ссылкой.
        // Схема их ПРОПУСКАЕТ, но не проверяет: строгий разбор один на всех,
        // он в reward-filler (мусор туда и не доедет).
        kind: z.enum(["likes", "tickets", "energy", "token", "resource", "custom"]),
        amount: z.number(),
        token: z.string().nullable().optional(),
        /** kind:"resource" — код ресурса (gold/stone/wood/diamonds). */
        resource: z.string().nullable().optional(),
        /** kind:"custom" — id товара справочника (cst_…). */
        itemId: z.string().nullable().optional(),
        /** kind:"custom" — штучно первым N местам, как пак. */
        toPlace: z.number().nullable().optional(),
      })
    )
    .default([]),
  split: z.array(z.number()).default([...DEFAULT_SPLIT]),
  packs: z
    .array(z.object({ packId: z.string(), toPlace: z.number() }))
    .default([]),
  items: z
    .array(z.object({ itemTemplateId: z.string(), toPlace: z.number() }))
    .default([]),
});

// ──────────────────── АДМИНКА (owner-gated) ────────────────────

/** Список локаций + узлы каждой (для конструктора). Боссы узлов — с HP. */
export const adminListRaidLocations = createServerFn({ method: "GET" }).handler(
  async () => {
    requireAdmin();
    const locs = ((await pg.raidLocation.raw().select("*").order("created_at", {
      ascending: true,
    })).data ?? []) as PgRaidLocation[];
    const nodes = ((await pg.raidNode.raw().select("*").order("ordinal", {
      ascending: true,
    })).data ?? []) as PgRaidNode[];
    // Боссы рейда (по raid_node_id) — для показа HP/имени в конструкторе.
    const bossIds = nodes.map((n) => n.boss_id).filter(Boolean) as string[];
    const bosses =
      bossIds.length > 0
        ? (((await pg.chipBoss.raw().select("*").in("id", bossIds)).data ??
            []) as PgChipBoss[])
        : [];
    const bossById = new Map(bosses.map((b) => [b.id, b]));
    // Ветки развилок: линки fork_node → локация (с именем/картинкой цели).
    const forkLinkRows = (await mcpExec(
      `SELECT fl.id, fl.fork_node_id, fl.target_location_id, fl.ordinal,
              l.name target_name, l.image_url target_image
         FROM yuplink.raid_fork_link fl
         JOIN yuplink.raid_location l ON l.id = fl.target_location_id
        ORDER BY fl.ordinal;`,
      { wrapJson: true }
    )) as Array<{
      id: string;
      fork_node_id: string;
      target_location_id: string;
      ordinal: number;
      target_name: string;
      target_image: string | null;
    }>;
    const linksByFork = new Map<
      string,
      Array<{ id: string; targetLocationId: string; name: string; imageUrl: string | null; ordinal: number }>
    >();
    for (const r of forkLinkRows ?? []) {
      const arr = linksByFork.get(r.fork_node_id) ?? [];
      arr.push({
        id: r.id,
        targetLocationId: r.target_location_id,
        name: r.target_name,
        imageUrl: r.target_image,
        ordinal: r.ordinal,
      });
      linksByFork.set(r.fork_node_id, arr);
    }
    return {
      locations: locs.map((l) => ({
        id: l.id,
        name: l.name,
        imageUrl: l.image_url,
        active: l.active,
        inHub: (l as unknown as { in_hub?: boolean }).in_hub ?? true,
        difficulty:
          (l as unknown as { difficulty?: string | null }).difficulty ?? null,
        cycleNo: l.cycle_no,
        rewardConfig: parseRewardConfig(l.reward_tiers),
        forkNodeId: l.fork_node_id,
        forkImageUrl:
          (nodes.find(
            (n) => n.location_id === l.id && n.node_type === "fork"
          ) as unknown as { image_url?: string | null })?.image_url ?? null,
        forkLinks: l.fork_node_id ? linksByFork.get(l.fork_node_id) ?? [] : [],
        nodes: nodes
          .filter((n) => n.location_id === l.id)
          .map((n) => {
            const b = n.boss_id ? bossById.get(n.boss_id) : null;
            return {
              id: n.id,
              branch: n.branch_key,
              ordinal: n.ordinal,
              type: n.node_type,
              isFinal: n.is_final,
              bossId: n.boss_id,
              // Картинка узла + линки-ветки (для узла-развилки; развилок м.б. несколько).
              imageUrl:
                (n as unknown as { image_url?: string | null }).image_url ?? null,
              forkLinks:
                n.node_type === "fork" ? linksByFork.get(n.id) ?? [] : [],
              chestConfig: n.chest_config
                ? parseRewardConfig(n.chest_config)
                : null,
              boss: b
                ? {
                    name: b.name,
                    imageUrl: b.image_url,
                    backgroundUrl:
                      (b as unknown as { background_url?: string | null })
                        .background_url ?? null,
                    removeWhite:
                      (b as unknown as { remove_white?: boolean })
                        .remove_white ?? false,
                    badgeLabel:
                      (b as unknown as { badge_label?: string | null })
                        .badge_label ?? null,
                    maxHp: Number(b.max_hp),
                    currentHp: Number(b.current_hp),
                    rewardConfig: parseRewardConfig(b.reward_tiers),
                  }
                : null,
            };
          }),
      })),
    };
  }
);

const locationInput = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(60),
  imageUrl: z.string().nullable().optional(),
  active: z.boolean().default(false),
  // Показывать ли локацию на стартовом перекрёстке (хабе). Дочерние локации
  // развилки (Зимний/Магический лес) — false: доступны только через развилку/карту.
  // optional (без дефолта) — чтобы вызовы без поля (напр. toggleActive) НЕ сбрасывали.
  inHub: z.boolean().optional(),
  // Сложность: цветная плашка у названия. null = снять.
  difficulty: z.enum(["newbie", "medium", "hard"]).nullable().optional(),
  rewardConfig: rewardConfigSchema.optional(),
});

/** Создать/обновить локацию (название, картинка, active, награды турнира). */
export const adminUpsertRaidLocation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => locationInput.parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    assertNoUsdtFillers(data.rewardConfig);
    const cfg = data.rewardConfig ?? { fillers: [], split: [...DEFAULT_SPLIT], packs: [] };
    await assertRewardMoneyRight(cfg, "raid_location", data.id);
    if (data.id) {
      await pg.raidLocation.update(
        { id: data.id },
        {
          name: data.name,
          image_url: data.imageUrl ?? null,
          active: data.active,
          reward_tiers: cfg as unknown,
          // in_hub меняем ТОЛЬКО если поле передано (иначе не сбрасываем при
          // частичных апдейтах вроде toggleActive).
          ...(data.inHub !== undefined
            ? { in_hub: data.inHub }
            : {}),
          ...(data.difficulty !== undefined
            ? { difficulty: data.difficulty }
            : {}),
        } as unknown as Partial<PgRaidLocation>
      );
      return { id: data.id };
    }
    const id = `rl_${nanoid(8)}`;
    await pg.raidLocation.insert({
      id,
      name: data.name,
      image_url: data.imageUrl ?? null,
      active: data.active,
      cycle_no: 1,
      in_hub: data.inHub ?? true,
      difficulty: data.difficulty ?? null,
      reward_tiers: cfg as unknown,
    } as unknown as Partial<PgRaidLocation>);
    return { id };
  });

const bossNodeInput = z.object({
  nodeId: z.string().optional(), // если правим существующий узел-босс
  locationId: z.string().min(1),
  branch: z.string().default("A"),
  ordinal: z.number().int().min(0),
  isFinal: z.boolean().default(false),
  name: z.string().min(1).max(60),
  imageUrl: z.string().nullable().optional(),
  // Фон босса (PNG-босс появляется поверх). Пусто → берётся фон локации.
  backgroundUrl: z.string().nullable().optional(),
  // У картинки босса белый фон → вырезать в прозрачность при показе.
  removeWhite: z.boolean().optional(),
  // Кастомный текст бейджа на сцене (иначе «Босс»/«Финал ветки»).
  badgeLabel: z.string().max(40).nullable().optional(),
  maxHp: z.number().int().min(1),
  rewardConfig: rewardConfigSchema.optional(),
});

/** Создать/обновить узел-БОССА цепочки (+ его строку в chip_boss с raid_node_id). */
export const adminUpsertRaidBoss = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => bossNodeInput.parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    assertNoUsdtFillers(data.rewardConfig);
    const now = new Date().toISOString();
    const cfg = data.rewardConfig ?? { fillers: [], split: [...DEFAULT_SPLIT], packs: [] };
    // Узел + его босс.
    let nodeId = data.nodeId ?? null;
    let bossId: string | null = null;
    if (nodeId) {
      const node = await pg.raidNode.findOne({ id: nodeId });
      bossId = node?.boss_id ?? null;
    }
    await assertRewardMoneyRight(cfg, "chip_boss", bossId);
    if (bossId) {
      // правим существующего рейд-босса (баланс-константы фикс, HP по админу).
      // current_hp сбрасываем ТОЛЬКО если реально сменился max_hp — иначе правка
      // имени/картинки/наград молча воскресила бы недобитого босса цикла.
      const cur = await pg.chipBoss.findOne({ id: bossId });
      const hpChanged = !cur || Number(cur.max_hp) !== data.maxHp;
      await pg.chipBoss.update(
        { id: bossId },
        {
          name: data.name,
          image_url: data.imageUrl ?? null,
          background_url: data.backgroundUrl ?? null,
          remove_white: data.removeWhite ?? false,
          badge_label: data.badgeLabel ?? null,
          max_hp: data.maxHp,
          ...(hpChanged ? { current_hp: data.maxHp } : {}),
          reward_tiers: cfg as unknown,
        } as unknown as Partial<PgChipBoss>
      );
    } else {
      bossId = `rboss_${nanoid(8)}`;
      await pg.chipBoss.insert({
        id: bossId,
        name: data.name,
        image_url: data.imageUrl ?? null,
        background_url: data.backgroundUrl ?? null,
        remove_white: data.removeWhite ?? false,
        badge_label: data.badgeLabel ?? null,
        max_hp: data.maxHp,
        current_hp: data.maxHp,
        energy_cost: R_ENERGY_COST,
        dmg_base: R_DMG_BASE,
        dmg_growth: R_DMG_GROWTH,
        dmg_variance: R_DMG_VARIANCE,
        like_threshold: R_LIKE_THRESHOLD,
        like_reward: R_LIKE_REWARD,
        active: false, // рейд-босс НЕ в active-очереди недельного босса
        killed_at: null,
        week_no: 0,
        week_started_at: now,
        reward_tiers: cfg as unknown,
        hp_growth_pct: R_HP_GROWTH_DEFAULT,
        created_at: now,
        ordinal: null,
        queue_status: null,
        raid_node_id: "pending", // проставим реальный node_id ниже
      } as unknown as PgChipBoss);
    }
    // Узел.
    if (nodeId) {
      await pg.raidNode.update(
        { id: nodeId },
        {
          branch_key: data.branch,
          ordinal: data.ordinal,
          node_type: data.isFinal ? "final" : "boss",
          is_final: data.isFinal,
          boss_id: bossId,
        }
      );
    } else {
      nodeId = `rn_${nanoid(8)}`;
      // Освободить место под ordinal: сдвинуть узлы ветки на >= ordinal вверх на 1
      // (двухфазно через минус — иначе UNIQUE в процессе). Нужно, когда пролог-босс
      // встаёт ПЕРЕД развилкой (fork на том же ordinal). Для аппенда — no-op.
      await mcpExec(
        `UPDATE yuplink.raid_node SET ordinal = -(ordinal+1)
          WHERE location_id=${sqlStr(data.locationId)} AND branch_key=${sqlStr(
            data.branch
          )} AND ordinal >= ${data.ordinal};`
      );
      await mcpExec(
        `UPDATE yuplink.raid_node SET ordinal = -ordinal
          WHERE location_id=${sqlStr(data.locationId)} AND branch_key=${sqlStr(
            data.branch
          )} AND ordinal < 0;`
      );
      try {
        await pg.raidNode.insert({
          id: nodeId,
          location_id: data.locationId,
          branch_key: data.branch,
          ordinal: data.ordinal,
          node_type: data.isFinal ? "final" : "boss",
          boss_id: bossId,
          chest_config: null,
          is_final: data.isFinal,
        });
      } catch (e) {
        // Узел не встал (напр. UNIQUE ordinal) — не оставляем осиротевший
        // chip_boss с raid_node_id='pending' (иначе накапливается мусор).
        if (!data.nodeId)
          await mcpExec(
            `DELETE FROM yuplink.chip_boss WHERE id=${sqlStr(bossId)} AND raid_node_id='pending';`
          );
        throw e;
      }
    }
    // Привязать босса к узлу (raid_node_id = nodeId).
    await pg.chipBoss.update({ id: bossId }, {
      raid_node_id: nodeId,
    } as unknown as Partial<PgChipBoss>);
    return { nodeId, bossId };
  });

const chestNodeInput = z.object({
  nodeId: z.string().optional(),
  locationId: z.string().min(1),
  branch: z.string().default("A"),
  ordinal: z.number().int().min(0),
  type: z.enum(["chest_normal", "chest_op", "fork"]),
  chestConfig: rewardConfigSchema.optional(),
});

/** Создать/обновить узел-СУНДУК или развилку (без босса). */
export const adminUpsertRaidNode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => chestNodeInput.parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    assertNoUsdtFillers(data.chestConfig);
    const cfg = data.type === "fork" ? null : data.chestConfig ?? null;
    await assertRewardMoneyRight(cfg, "raid_node", data.nodeId);
    if (data.nodeId) {
      await pg.raidNode.update(
        { id: data.nodeId },
        {
          branch_key: data.branch,
          ordinal: data.ordinal,
          node_type: data.type,
          chest_config: cfg as unknown,
        }
      );
      // fork-узел локации фиксируем в raid_location.fork_node_id
      if (data.type === "fork") {
        await pg.raidLocation.update(
          { id: data.locationId },
          { fork_node_id: data.nodeId }
        );
      }
      return { nodeId: data.nodeId };
    }
    const nodeId = `rn_${nanoid(8)}`;
    await pg.raidNode.insert({
      id: nodeId,
      location_id: data.locationId,
      branch_key: data.branch,
      ordinal: data.ordinal,
      node_type: data.type,
      boss_id: null,
      chest_config: cfg as unknown,
      is_final: false,
    });
    if (data.type === "fork") {
      await pg.raidLocation.update(
        { id: data.locationId },
        { fork_node_id: nodeId }
      );
    }
    return { nodeId };
  });

/** Пересохранить порядок узлов ветки после drag-drop. */
export const adminReorderRaidNodes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        locationId: z.string().min(1),
        branch: z.string(),
        orderedIds: z.array(z.string()),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    // Двухфазно, чтобы не ловить UNIQUE(location,branch,ordinal): сперва в минус.
    for (let i = 0; i < data.orderedIds.length; i++) {
      await mcpExec(
        `UPDATE yuplink.raid_node SET ordinal=${-(i + 1)} WHERE id=${sqlStr(
          data.orderedIds[i]
        )} AND location_id=${sqlStr(data.locationId)} AND branch_key=${sqlStr(
          data.branch
        )};`
      );
    }
    for (let i = 0; i < data.orderedIds.length; i++) {
      await mcpExec(
        `UPDATE yuplink.raid_node SET ordinal=${i} WHERE id=${sqlStr(
          data.orderedIds[i]
        )} AND location_id=${sqlStr(data.locationId)} AND branch_key=${sqlStr(
          data.branch
        )};`
      );
    }
    return { ok: true };
  });

/** Удалить узел (+ снять raid_node_id с босса, если был). */
export const adminDeleteRaidNode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ nodeId: z.string().min(1) }).parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const node = await pg.raidNode.findOne({ id: data.nodeId });
    // Развилка = обычный узел: удаляем её линки-ветки (локации-цели не трогаем) и,
    // если локация ссылалась на неё как на fork_node_id, снимаем ссылку.
    if (node?.node_type === "fork") {
      await mcpExec(
        `DELETE FROM yuplink.raid_fork_link WHERE fork_node_id=${sqlStr(data.nodeId)};`
      );
      const loc = await pg.raidLocation.findOne({ id: node.location_id });
      if (loc?.fork_node_id === data.nodeId)
        await pg.raidLocation.update({ id: node.location_id }, { fork_node_id: null });
    }
    if (node?.boss_id) {
      // рейд-босс осиротел — помечаем (не удаляем строку chip_boss, чтобы не
      // потерять историю урона; снимаем привязку к узлу).
      await mcpExec(
        `UPDATE yuplink.chip_boss SET raid_node_id=NULL WHERE id=${sqlStr(
          node.boss_id
        )};`
      );
    }
    await pg.raidNode.delete({ id: data.nodeId });
    // Перенумеровать оставшиеся узлы ветки в 0..n-1 (без дыр) — иначе следующий
    // «+ Босс» (ordinal=count) поймал бы UNIQUE(location,branch,ordinal). Двухфазно.
    if (node) {
      const { data: rest } = await pg.raidNode
        .raw()
        .select("id")
        .eq("location_id", node.location_id)
        .eq("branch_key", node.branch_key)
        .order("ordinal", { ascending: true });
      const ids = ((rest ?? []) as Array<{ id: string }>).map((r) => r.id);
      for (let i = 0; i < ids.length; i++)
        await mcpExec(
          `UPDATE yuplink.raid_node SET ordinal=${-(i + 1)} WHERE id=${sqlStr(ids[i])};`
        );
      for (let i = 0; i < ids.length; i++)
        await mcpExec(
          `UPDATE yuplink.raid_node SET ordinal=${i} WHERE id=${sqlStr(ids[i])};`
        );
    }
    return { ok: true };
  });

/** Убрать развилку: удалить fork-узел + его линки-ветки (на локации). Локации-
 *  цели НЕ трогаем (они самостоятельны). Легаси-узлы веток A/B (если вдруг
 *  остались от старой модели) осиротим и удалим — безопасно. */
export const adminDeleteRaidFork = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ locationId: z.string().min(1) }).parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const loc = await pg.raidLocation.findOne({ id: data.locationId });
    const forkId = loc?.fork_node_id ?? null;
    // Линки развилки → локации (сами локации-цели остаются).
    if (forkId)
      await mcpExec(
        `DELETE FROM yuplink.raid_fork_link WHERE fork_node_id=${sqlStr(forkId)};`
      );
    // Легаси: осиротить/удалить встроенные узлы веток A/B, если остались.
    await mcpExec(
      `UPDATE yuplink.chip_boss SET raid_node_id=NULL WHERE raid_node_id IN (
         SELECT id FROM yuplink.raid_node
          WHERE location_id=${sqlStr(data.locationId)}
            AND (branch_key IN ('A','B') OR node_type='fork'));`
    );
    await mcpExec(
      `DELETE FROM yuplink.raid_node
        WHERE location_id=${sqlStr(data.locationId)}
          AND (branch_key IN ('A','B') OR node_type='fork');`
    );
    await pg.raidLocation.update({ id: data.locationId }, { fork_node_id: null });
    return { ok: true };
  });

/** Локации, доступные для привязки к КОНКРЕТНОЙ развилке (все, кроме локации самой
 *  развилки + уже привязанных к этой развилке). */
export const adminListLinkableLocations = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ forkNodeId: z.string().min(1), locationId: z.string().min(1) })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const { data: all } = await pg.raidLocation
      .raw()
      .select("id,name,image_url")
      .order("created_at", { ascending: true });
    const linked = new Set<string>();
    const rows = (await mcpExec(
      `SELECT target_location_id t FROM yuplink.raid_fork_link
        WHERE fork_node_id=${sqlStr(data.forkNodeId)};`,
      { wrapJson: true }
    )) as Array<{ t: string }>;
    for (const r of rows ?? []) linked.add(r.t);
    return {
      locations: ((all ?? []) as Array<{ id: string; name: string; image_url: string | null }>)
        .filter((l) => l.id !== data.locationId && !linked.has(l.id))
        .map((l) => ({ id: l.id, name: l.name, imageUrl: l.image_url })),
    };
  });

/** Привязать локацию к КОНКРЕТНОЙ развилке (ветка = вход в другую локацию). */
export const adminAddForkLink = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        forkNodeId: z.string().min(1),
        locationId: z.string().min(1),
        targetLocationId: z.string().min(1),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    if (data.targetLocationId === data.locationId)
      throw new Error("Нельзя привязать локацию к самой себе");
    const fnode = await pg.raidNode.findOne({ id: data.forkNodeId });
    if (!fnode || fnode.node_type !== "fork")
      throw new Error("Развилка не найдена");
    const target = await pg.raidLocation.findOne({ id: data.targetLocationId });
    if (!target) throw new Error("Локация-цель не найдена");
    const dup = (await mcpExec(
      `SELECT 1 FROM yuplink.raid_fork_link
        WHERE fork_node_id=${sqlStr(data.forkNodeId)}
          AND target_location_id=${sqlStr(data.targetLocationId)} LIMIT 1;`,
      { wrapJson: true }
    )) as unknown[];
    if (dup?.length) throw new Error("Эта локация уже привязана");
    const ordRows = (await mcpExec(
      `SELECT COALESCE(MAX(ordinal),-1)+1 o FROM yuplink.raid_fork_link
        WHERE fork_node_id=${sqlStr(data.forkNodeId)};`,
      { wrapJson: true }
    )) as Array<{ o: number }>;
    const ord = Number(ordRows?.[0]?.o ?? 0);
    await mcpExec(
      `INSERT INTO yuplink.raid_fork_link (id,fork_node_id,target_location_id,ordinal)
       VALUES (${sqlStr(`fl_${nanoid(8)}`)},${sqlStr(data.forkNodeId)},${sqlStr(
         data.targetLocationId
       )},${ord})
       ON CONFLICT (fork_node_id,target_location_id) DO NOTHING;`
    );
    return { ok: true };
  });

/** Отвязать локацию от развилки (линк-ветку удалить; локация-цель остаётся). */
export const adminRemoveForkLink = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ linkId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    await mcpExec(
      `DELETE FROM yuplink.raid_fork_link WHERE id=${sqlStr(data.linkId)};`
    );
    return { ok: true };
  });

/** Картинка узла-развилки (сцена выбора локации). */
export const adminSetForkImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ nodeId: z.string().min(1), imageUrl: z.string().nullable() })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    await mcpExec(
      `UPDATE yuplink.raid_node SET image_url=${
        data.imageUrl ? sqlStr(data.imageUrl) : "NULL"
      } WHERE id=${sqlStr(data.nodeId)} AND node_type='fork';`
    );
    return { ok: true };
  });

// ──────── Шаблоны боссов (сохранить/загрузить конфиг) ────────

export const adminListBossTemplates = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireDesigner();
    const { data } = await pg.raidBossTemplate
      .raw()
      .select("*")
      .order("created_at", { ascending: false });
    return {
      templates: ((data ?? []) as PgRaidBossTemplate[]).map((t) => {
        const ext = t as unknown as {
          background_url?: string | null;
          remove_white?: boolean;
          badge_label?: string | null;
          abilities?: unknown;
          damage?: string | null;
          land?: string | null;
          map_image_url?: string | null;
          level?: number | null;
          flees?: boolean | null;
        };
        return {
          id: t.id,
          name: t.name,
          imageUrl: t.image_url,
          maxHp: Number(t.max_hp),
          rewardConfig: parseRewardConfig(t.reward_tiers),
          backgroundUrl: ext.background_url ?? null,
          removeWhite: ext.remove_white ?? false,
          badgeLabel: ext.badge_label ?? null,
          abilities: parseAbilities(ext.abilities),
          damage: ext.damage ?? null,
          land: ext.land ?? null,
          // Отдельная картинка для гекс-карты. Пусто — берём боевую.
          mapImageUrl: ext.map_image_url ?? null,
          // Уровень босса: 1..100. Раньше админ писал его прямо в имя
          // («Горный Хомяк (1 Lv)») — по строке ни отобрать, ни отфильтровать.
          level: Number(ext.level ?? 1) || 1,
          // «Убегает»: подошёл вплотную — объект уходит на клетку дальше
          // (beta-raid/flee-move). Свойство шаблона, а не клетки: бегает сам
          // зверь, а не место, где он стоит.
          flees: ext.flees === true,
        };
      }),
    };
  }
);

export const adminSaveBossTemplate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().optional(), // Если передан — обновляем существующий
        name: z.string().min(1).max(60),
        imageUrl: z.string().nullable().optional(),
        maxHp: z.number().int().min(1),
        rewardConfig: rewardConfigSchema.optional(),
        backgroundUrl: z.string().nullable().optional(),
        // Картинка только для карты (в окне боя не используется).
        mapImageUrl: z.string().nullable().optional(),
        removeWhite: z.boolean().optional(),
        badgeLabel: z.string().nullable().optional(),
        land: z.string().nullable().optional(),
        level: z.number().int().min(1).max(100).optional(),
        /** Убегает от подошедшего игрока (см. beta-raid/flee-rules.ts). */
        flees: z.boolean().optional(),
        // Способности: единый формат с объектами карты (см. beta-raid/abilities).
        abilities: z
          .array(
            z.object({
              kind: z.string().min(1),
              chance: z.number().min(0).max(100),
              value: z.union([z.string(), z.number()]).optional(),
              duration: z.union([z.string(), z.number()]).optional(),
            })
          )
          .optional(),
        // Урон босса диапазоном («80» / «80-120»). Пусто — эталонные 80.
        damage: z.union([z.string(), z.number()]).nullable().optional(),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    // Админ — как было; право catalogs — без денег (catalog-auth).
    const actor = await requireCatalogEditor();
    const isUpdate = !!data.id;
    const id = data.id ?? `rbt_${nanoid(8)}`;
    if (isUpdate) await assertBossTemplateFree(actor, id);
    data.rewardConfig = withoutMoney(actor, data.rewardConfig);
    // USDT в награде шаблона — обещание каждого живого босса этого шаблона (§8.49а).
    if (isUpdate) await assertBossTemplateUsdt(id, data.rewardConfig?.fillers);
    await assertRewardMoneyRight(data.rewardConfig, "raid_boss_template", data.id);
    const row: Record<string, unknown> = {
      name: data.name,
      image_url: data.imageUrl ?? null,
      max_hp: data.maxHp,
      reward_tiers: (data.rewardConfig ?? {
        fillers: [],
        split: [...DEFAULT_SPLIT],
        packs: [],
      }) as unknown,
    };
    if (data.backgroundUrl !== undefined) row.background_url = data.backgroundUrl;
    if (data.mapImageUrl !== undefined) row.map_image_url = data.mapImageUrl;
    if (data.removeWhite !== undefined) row.remove_white = data.removeWhite;
    if (data.badgeLabel !== undefined) row.badge_label = data.badgeLabel;
    if (data.land !== undefined) row.land = data.land;
    if (data.level !== undefined) row.level = data.level;
    if (data.flees !== undefined) row.flees = data.flees;
    if (data.abilities !== undefined) row.abilities = data.abilities;
    if (data.damage !== undefined) row.damage = data.damage === null ? null : String(data.damage);

    if (isUpdate) {
      await pg.raidBossTemplate.update({ id }, row);
    } else {
      row.id = id;
      row.created_at = new Date().toISOString();
      await pg.raidBossTemplate.insert(row);
    }
    // Галочку «убегает» могли поставить или снять — снимок убегающих объектов
    // на картах собран по этому флагу и больше не годится (flee-cells.ts).
    dropFleeCache();
    return { id };
  });

// Удаление шаблона живёт в raid-boss-templates.ts: у него теперь два исхода
// (оставить копии на карте по снимку или убрать полные), и обоим нужен доступ
// к клеткам и обеспечению Darai.
