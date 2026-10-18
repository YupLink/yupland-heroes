// Яд и оглушение — эффекты на КОНКРЕТНОЙ фишке, живут по реальному времени.
//
// Раньше оба существовали только внутри одного боя и считались в раундах:
// бой кончился — эффект исчез. По задумке владельца они должны переживать бой
// и держаться заданное число МИНУТ на той фишке, в которую попал босс:
//   • яд     — ДЕБАФФ: у фишки срезано % макс. HP, пока эффект жив;
//   • оглушение — фишка отдыхает и не выходит в бой, пока не отпустит.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

export type ChipEffectKind = "poison" | "stun";

export type ChipEffect = {
  chipId: string;
  kind: ChipEffectKind;
  /** Для яда — на сколько % срезан макс. HP. Для оглушения не используется. */
  value: number;
  expiresAt: string;
};

/** Что бой хочет повесить на фишку: минуты считаются от момента записи. */
export type PendingEffect = {
  chipId: string;
  kind: ChipEffectKind;
  value: number;
  minutes: number;
};

/** Активные эффекты для набора фишек (истёкшие не возвращаются). */
export async function loadChipEffects(chipIds: string[]): Promise<ChipEffect[]> {
  const ids = chipIds.filter(Boolean);
  if (ids.length === 0) return [];
  const rows = (await mcpExec(
    `SELECT chip_id, kind, value, expires_at
       FROM yuplink.chip_effects
      WHERE expires_at > now() AND chip_id IN (${ids.map(sqlStr).join(",")});`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{
    chip_id: string;
    kind: string;
    value: number;
    expires_at: string;
  }>;
  return (rows ?? [])
    .filter((r) => r.kind === "poison" || r.kind === "stun")
    .map((r) => ({
      chipId: r.chip_id,
      kind: r.kind as ChipEffectKind,
      value: Number(r.value) || 0,
      expiresAt: r.expires_at,
    }));
}

/**
 * Повесить эффекты после боя.
 *
 * Правило владельца: повторное попадание по той же фишке НЕ усиливает эффект,
 * а ПРОДЛЕВАЕТ его — время складывается с остатком. Если сила выпала другая,
 * берём среднее арифметическое по соотношению времени: слабый яд на час не
 * должен мгновенно вытесняться сильным на минуту, и наоборот.
 */
export async function applyChipEffects(
  effects: PendingEffect[],
  /** Кто повесил (имя цели) — показываем игроку «от кого». */
  source?: string | null,
): Promise<void> {
  // Свернуть по (фишка, вид) ОБЯЗАТЕЛЬНО: за бой босс прокает по одной жертве
  // много раз, а `ON CONFLICT DO UPDATE` не может задеть одну строку дважды —
  // Postgres роняет весь INSERT, и тогда терялись ВСЕ эффекты боя.
  const merged = new Map<string, PendingEffect>();
  for (const e of effects) {
    if (!e.chipId || e.minutes <= 0) continue;
    const key = `${e.chipId}|${e.kind}`;
    const prev = merged.get(key);
    merged.set(key, prev ? mergeEffect(prev, e) : e);
  }
  const rows = [...merged.values()];
  if (rows.length === 0) return;
  const src = source ? sqlStr(source.slice(0, 80)) : "NULL";
  const values = rows
    .map(
      (e) =>
        `(${sqlStr(e.chipId)}, ${sqlStr(e.kind)}, ${Math.max(0, Math.round(e.value))},
          ${Math.max(1, Math.round(e.minutes))})`,
    )
    .join(",");
  // Складываем время с ОСТАТКОМ прежнего эффекта, силу усредняем по времени.
  // GREATEST(expires_at, now()) — чтобы протухший эффект не тянул за собой
  // отрицательный остаток. Потолка у остатка нет: минуты задаёт админ,
  // повтор продлевает (правило владельца). Источник — последний.
  await mcpExec(
    `WITH v(chip_id, kind, value, minutes) AS (VALUES ${values})
     INSERT INTO yuplink.chip_effects (chip_id, kind, value, expires_at, applied_at, source)
     SELECT v.chip_id, v.kind, v.value, now() + (v.minutes || ' minutes')::interval, now(), ${src}
       FROM v
     ON CONFLICT (chip_id, kind) DO UPDATE
       SET value = CASE
             WHEN yuplink.chip_effects.value = EXCLUDED.value THEN EXCLUDED.value
             ELSE ROUND((
               yuplink.chip_effects.value
                 * GREATEST(EXTRACT(EPOCH FROM (yuplink.chip_effects.expires_at - now())), 0)
               + EXCLUDED.value
                 * EXTRACT(EPOCH FROM (EXCLUDED.expires_at - now()))
             ) / NULLIF(
               GREATEST(EXTRACT(EPOCH FROM (yuplink.chip_effects.expires_at - now())), 0)
               + EXTRACT(EPOCH FROM (EXCLUDED.expires_at - now())), 0))
           END,
           expires_at = GREATEST(yuplink.chip_effects.expires_at, now()) + (EXCLUDED.expires_at - now()),
           applied_at = now(),
           source = COALESCE(EXCLUDED.source, yuplink.chip_effects.source);`,
  ).catch((e: unknown) => {
    // Эффект — не деньги: не роняем результат боя, если запись не прошла.
    console.warn("[beta-abilities] chip effects insert failed:", e);
  });
}

/**
 * Слить два прока одного вида по одной фишке: время складывается, сила —
 * среднее арифметическое по соотношению времени (по той же сумме, что и
 * веса: обрезанный знаменатель раздувал бы среднее — см. mergeTimed).
 */
export function mergeEffect(a: PendingEffect, b: PendingEffect): PendingEffect {
  const sum = a.minutes + b.minutes;
  const value =
    a.value === b.value ? a.value : Math.round((a.value * a.minutes + b.value * b.minutes) / sum);
  return { ...a, value, minutes: sum };
}

/** Насколько срезан макс. HP: chipId → %. */
export function poisonByChip(effects: ChipEffect[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of effects) {
    if (e.kind !== "poison" || e.value <= 0) continue;
    out.set(e.chipId, Math.max(out.get(e.chipId) ?? 0, e.value));
  }
  return out;
}
