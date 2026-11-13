// Повтор эффекта, который держит одну строку на вид (всё, кроме buff_*:
// дебаффы, иммунитеты): срок ПРОДЛЕВАЕТСЯ без потолка, сила усредняется по
// оставшемуся времени. Общий хвост вставки для applyPlayerEffect
// (encounter-effects.ts) и зелий (potion-drink-sql.ts) — правило одно.
//
// Цель вставки — БЕЗ алиаса: SET ссылается на полное имя таблицы.
export const TIMED_EFFECT_UPSERT = `ON CONFLICT (account_id, kind) WHERE kind NOT LIKE 'buff_%' DO UPDATE
       SET value = CASE
             WHEN yuplink.beta_raid_player_effects.value = EXCLUDED.value THEN EXCLUDED.value
             ELSE GREATEST(1, ROUND((
               yuplink.beta_raid_player_effects.value
                 * GREATEST(EXTRACT(EPOCH FROM (yuplink.beta_raid_player_effects.expires_at - now())), 0)
               + EXCLUDED.value * EXTRACT(EPOCH FROM (EXCLUDED.expires_at - now()))
             ) / NULLIF(
               GREATEST(EXTRACT(EPOCH FROM (yuplink.beta_raid_player_effects.expires_at - now())), 0)
               + EXTRACT(EPOCH FROM (EXCLUDED.expires_at - now())), 0)))
           END,
           expires_at = GREATEST(yuplink.beta_raid_player_effects.expires_at, now())
             + (EXCLUDED.expires_at - now()),
           source = COALESCE(EXCLUDED.source, yuplink.beta_raid_player_effects.source)`;
