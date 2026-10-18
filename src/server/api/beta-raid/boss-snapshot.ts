// Снимок босса на клетке: чем он был в момент удаления шаблона.
//
// Босс на карте — это одна строчка `object_id = 'boss:<шаблон>'`, а всё
// остальное (имя, картинка, запас HP, награды, способности) жило только в
// самом шаблоне. Удалили шаблон — на карте оставалась чёрная точка: объект
// на клетке числится, значит она занята, а показать и предложить нечего.
//
// Теперь удаление шаблона сначала впечатывает его копию в каждую клетку, где
// этот босс стоит (`raid_map_cells.object_config -> 'tpl'`), и босс живёт
// дальше сам по себе. Ключ отдельный: собственные правки клетки (HP, цена
// входа, награды) лежат в том же object_config верхним уровнем, их читает
// cell-override.parseOverride — снимок с ними не спорит и их не трогает.
import { sqlStr } from "../raid-shared";
import { DEFAULT_MAX_HP, type EncounterTarget } from "./encounter-target";
import { parseAbilities } from "./abilities";

/** Ключ снимка внутри object_config. Всё, что не он, — правки самой клетки. */
export const SNAPSHOT_KEY = "tpl";

/** Копия шаблона босса. Поля названы как в adminListBossTemplates. */
export type BossSnapshot = {
  name: string;
  imageUrl: string | null;
  mapImageUrl: string | null;
  backgroundUrl: string | null;
  badgeLabel: string | null;
  maxHp: number;
  interactionCost: number | null;
  rewardConfig: unknown;
  abilities: unknown;
  damage: string | null;
  level: number;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

const num = (v: unknown, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

/**
 * Разобрать `object_config.tpl`. Снимком считаем только объект с именем: пустая
 * заготовка так же бесполезна, как отсутствующий шаблон, и притворяться живым
 * боссом ей нельзя — иначе клетка снова запрётся ни на чём.
 */
export function parseBossSnapshot(raw: unknown): BossSnapshot | null {
  const cfg = raw as Record<string, unknown> | null | undefined;
  const snapRaw = cfg?.[SNAPSHOT_KEY];
  if (!snapRaw || typeof snapRaw !== "object" || Array.isArray(snapRaw)) return null;
  const s = snapRaw as Record<string, unknown>;
  const name = str(s.name);
  if (!name) return null;
  const cost = Number(s.interactionCost);
  return {
    name,
    imageUrl: str(s.imageUrl),
    mapImageUrl: str(s.mapImageUrl),
    backgroundUrl: str(s.backgroundUrl),
    badgeLabel: str(s.badgeLabel),
    maxHp: num(s.maxHp, DEFAULT_MAX_HP),
    interactionCost: Number.isFinite(cost) && cost >= 0 ? cost : null,
    rewardConfig: s.rewardConfig ?? null,
    abilities: s.abilities ?? null,
    damage: str(s.damage),
    level: num(s.level, 1),
  };
}

/** Энергия за вход в бой по умолчанию — та же, что у шаблона (encounter-target). */
const DEFAULT_COST = 10;

/**
 * Цель боя по снимку — на случай, когда шаблона уже нет. Форма ровно та же,
 * что отдаёт loadEncounterTarget: дальше по коду разницы быть не должно.
 */
export function targetFromSnapshot(
  rawObjectId: string,
  snap: BossSnapshot | null,
): EncounterTarget | null {
  if (!snap || !rawObjectId.startsWith("boss:")) return null;
  return {
    kind: "boss",
    templateId: rawObjectId.slice("boss:".length),
    name: snap.name,
    imageUrl: snap.imageUrl,
    backgroundUrl: snap.backgroundUrl,
    badgeLabel: snap.badgeLabel ?? "Босс",
    maxHp: snap.maxHp,
    interactionCost: snap.interactionCost ?? DEFAULT_COST,
    rewardConfig: snap.rewardConfig ?? null,
    abilities: parseAbilities(snap.abilities),
    damage: snap.damage,
  };
}

/** jsonb-снимок из строки шаблона. `b` — алиас raid_boss_template в запросе. */
export function snapshotSql(b = "b"): string {
  return `jsonb_build_object(
            'name', ${b}.name,
            'imageUrl', ${b}.image_url,
            'mapImageUrl', ${b}.map_image_url,
            'backgroundUrl', ${b}.background_url,
            'badgeLabel', ${b}.badge_label,
            'maxHp', ${b}.max_hp,
            'interactionCost', ${b}.interaction_cost,
            'rewardConfig', ${b}.reward_tiers,
            'abilities', ${b}.abilities,
            'damage', ${b}.damage,
            'level', ${b}.level)`;
}

/** Клетка донастроена вручную: в object_config есть что-то кроме снимка. */
export function customCellSql(c = "c"): string {
  return `(${c}.object_config IS NOT NULL
           AND jsonb_typeof(${c}.object_config) = 'object'
           AND (${c}.object_config - '${SNAPSHOT_KEY}' - 'resHold') <> '{}'::jsonb)`;
}

/**
 * Впечатать снимок шаблона во все клетки, где он стоит. Снимок ДОПИСЫВАЕТСЯ
 * к object_config, а не заменяет его: собственные правки клетки должны
 * пережить удаление шаблона так же, как и сам босс.
 */
export function stampSnapshotSql(templateId: string): string {
  const raw = sqlStr(`boss:${templateId}`);
  return `UPDATE yuplink.raid_map_cells c
             SET object_config = COALESCE(c.object_config, '{}'::jsonb)
                                 || jsonb_build_object('${SNAPSHOT_KEY}', ${snapshotSql()})
            FROM yuplink.raid_boss_template b
           WHERE b.id = ${sqlStr(templateId)} AND c.object_id = ${raw};`;
}

/**
 * Снять с карты копии шаблона — только ПОЛНЫЕ, без собственных правок.
 * Донастроенную клетку не трогаем: там уже своя игра, и стирать её заодно с
 * зачисткой шаблона владелец не просил.
 *
 * Боевое состояние уходит вместе с объектом: осиротевшая строка HP досталась
 * бы следующему объекту на этой клетке, и он встал бы сразу поверженным
 * (та же причина, что в admin-live-batch).
 *
 * Расписку Darai (`darai_ref`) тут НЕ трогаем: обеспечение сводит
 * settleDaraiHold до и после правки — он же и снимает бронь с опустевшей
 * клетки. Стереть ссылку руками означало бы запереть монеты в пуле навсегда.
 */
export function dropPlainCopiesSql(templateId: string): string[] {
  const raw = sqlStr(`boss:${templateId}`);
  const match = `c.map_id = h.map_id AND c.q = h.q AND c.r = h.r
                 AND c.object_id = ${raw} AND NOT ${customCellSql()}`;
  return [
    // Только слой самой клетки: спрятавшийся под копией беглец — чужой объект
    // со своим боевым состоянием (runners.ts).
    `DELETE FROM yuplink.beta_raid_object_hp h
      WHERE h.cycle_no = 0
        AND EXISTS (SELECT 1 FROM yuplink.raid_map_cells c WHERE ${match});`,
    `UPDATE yuplink.raid_map_cells c
        SET object_id = NULL, object_config = NULL, saved_at = now()
      WHERE c.object_id = ${raw} AND NOT ${customCellSql()};`,
  ];
}

/**
 * Есть ли чем показать объект клетки: жив шаблон или снят снимок.
 *
 * По этому же признаку клетка держит проход. Раньше проход держал сам факт
 * `object_id IS NOT NULL`, и клетка с удалённым шаблоном превращалась в глухую
 * стену без имени, картинки и кнопки — «чёрную точку», мимо которой не пройти
 * и с которой нечего делать.
 */
export function objectKnownSql(c = "c"): string {
  const bare = `CASE WHEN ${c}.object_id LIKE '%:%'
                     THEN split_part(${c}.object_id, ':', 2) ELSE ${c}.object_id END`;
  return `(${c}.object_id IS NULL
           OR ${hasSnapshotSql(c)}
           OR EXISTS (SELECT 1 FROM yuplink.raid_boss_template bk
                       WHERE ${c}.object_id LIKE 'boss:%' AND bk.id = ${bare})
           OR EXISTS (SELECT 1 FROM yuplink.mystic_item_template mk
                       WHERE ${c}.object_id NOT LIKE 'boss:%' AND mk.id = ${bare}))`;
}

/**
 * Снимок годен к показу. Условие ровно то же, что у parseBossSnapshot: объект
 * с непустым именем. Иначе SQL и разбор разошлись бы — карта держала бы клетку
 * занятой, а бой отвечал «Объект не найден», и чёрная точка вернулась бы.
 */
export function hasSnapshotSql(c = "c"): string {
  return `(jsonb_typeof(${c}.object_config->'${SNAPSHOT_KEY}') = 'object'
           AND COALESCE(${c}.object_config->'${SNAPSHOT_KEY}'->>'name', '') <> '')`;
}
