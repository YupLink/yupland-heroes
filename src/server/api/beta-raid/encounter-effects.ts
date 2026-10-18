// Эффекты способностей, которые живут ВНЕ боя: замедление (шаг дороже) и
// выжигание энергии. Хранятся с сроком годности, чтобы отпускали сами.
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { WEAKEN_KINDS, type WeakenKind } from "./abilities";

/**
 * Повесить замедление: +value энергии за шаг на minutes минут.
 *
 * Повторное срабатывание не усиливает, а ПРОДЛЕВАЕТ: время складывается с
 * остатком, а если выпала другая прибавка — берём среднее арифметическое по
 * соотношению времени (правило владельца, то же что у яда на фишке).
 * `source` — кто повесил (имя цели): игрок должен видеть, ОТ КОГО дебафф.
 */
export async function applySlow(
  wallet: string,
  value: number,
  minutes: number,
  source?: string | null,
): Promise<void> {
  return applyPlayerEffect(wallet, "slow", value, minutes, source);
}

/**
 * Ослабление героя: −value к характеристике на minutes минут.
 *
 * Хранится там же, где замедление, и по тем же правилам: повтор продлевает,
 * сила усредняется по времени. Виды разные (weak_atk/weak_arm/…), поэтому
 * броня и удача гаснут независимо друг от друга.
 */
export async function applyWeaken(
  wallet: string,
  kind: WeakenKind,
  value: number,
  minutes: number,
  source?: string | null,
): Promise<void> {
  return applyPlayerEffect(wallet, kind, value, minutes, source);
}

/** Потолок остатка дебаффа в базе: замедление и ослабление — по своим числам. */

/** Значения активных ослаблений аккаунта: вид → сколько снято прямо сейчас. */
export async function loadWeakenValues(
  account: string,
): Promise<Partial<Record<WeakenKind, number>>> {
  if (!account) return {};
  const rows = (await mcpExec(
    `SELECT kind, value FROM yuplink.beta_raid_player_effects
      WHERE kind IN (${WEAKEN_KINDS.map(sqlStr).join(",")}) AND expires_at > now()
        AND account_id = ${sqlStr(account)};`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ kind: string; value: number }>;
  const out: Partial<Record<WeakenKind, number>> = {};
  for (const row of rows ?? []) {
    const v = Math.max(0, Math.floor(Number(row.value) || 0));
    if (v > 0) out[row.kind as WeakenKind] = v;
  }
  return out;
}

/**
 * Общая запись эффекта игрока.
 *
 * Правило зависит от вида:
 *  - БАФФЫ (buff_*) живут КАЖДЫЙ в своей строке: два заклинания на атаку +25
 *    и +10 — две независимые строки со своими сроками. Чтение (loadBuffValues)
 *    уже суммирует активные строки, поэтому +25 + +10 = +35 и каждый истечёт
 *    сам. Раньше UNIQUE(account_id, kind) объединял их в одну и усреднение по
 *    времени давало +17 на 30 мин — то, о чём жаловался владелец.
 *  - ДЕБАФФЫ (weak_*, slow) — по-прежнему одна строка на kind с средним по
 *    времени: десять слабых попаданий не должны превращаться в один
 *    смертельный, и это правило важно для баланса.
 *
 * UNIQUE-индекс перебит на partial (миграция effects-01), ensure-хук ниже
 * гарантирует его даже без ручной накатки.
 */
const isSummableBuff = (kind: string) => kind.startsWith("buff_");

let effectsSchemaEnsured = false;
async function ensureEffectsSchema(): Promise<void> {
  if (effectsSchemaEnsured) return;
  try {
    await mcpExec(
      `DROP INDEX IF EXISTS yuplink.beta_raid_player_effects_acc_kind_uniq;
       CREATE UNIQUE INDEX IF NOT EXISTS beta_raid_player_effects_acc_kind_uniq
         ON yuplink.beta_raid_player_effects (account_id, kind)
         WHERE kind NOT LIKE 'buff_%';`,
      { wrapJson: false },
    );
    effectsSchemaEnsured = true;
  } catch (e) {
    console.warn("[effects] ensureEffectsSchema не отработал:", e);
  }
}

export async function applyPlayerEffect(
  wallet: string,
  kind: string,
  value: number,
  minutes: number,
  source?: string | null,
): Promise<void> {
  if (value <= 0 || minutes <= 0) return;
  await ensureEffectsSchema();
  const { raidOwner } = await import("./owner");
  const account = await raidOwner(wallet);
  const src = source ? sqlStr(source.slice(0, 80)) : "NULL";
  if (isSummableBuff(kind)) {
    // Каждый бафф — своя строка со своим сроком. Никакого ON CONFLICT: два
    // заклинания на атаку живут независимо и складываются на чтении.
    await mcpExec(
      `INSERT INTO yuplink.beta_raid_player_effects
         (id, account_id, kind, value, expires_at, created_at, source)
       VALUES (${sqlStr(`bpe_${nanoid(10)}`)}, ${sqlStr(account)}, ${sqlStr(kind)},
               ${Math.floor(value)}, now() + interval '${Math.floor(minutes)} minutes', now(), ${src});`,
    );
    return;
  }
  // Минуты — как задал админ в шаблоне, повтор ПРОДЛЕВАЕТ без потолка
  // (правило владельца; потолок 60 мин, стоявший тут 21.09, резал настроенное).
  // Источник — последний, кто продлил: игроку полезнее свежий.
  const cap = Math.floor(minutes);
  await mcpExec(
    `INSERT INTO yuplink.beta_raid_player_effects
       (id, account_id, kind, value, expires_at, created_at, source)
     VALUES (${sqlStr(`bpe_${nanoid(10)}`)}, ${sqlStr(account)}, ${sqlStr(kind)}, ${Math.floor(value)},
             now() + interval '${cap} minutes', now(), ${src})
     ON CONFLICT (account_id, kind) WHERE kind NOT LIKE 'buff_%' DO UPDATE
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
           source = COALESCE(EXCLUDED.source, yuplink.beta_raid_player_effects.source);`,
  );
}

/**
 * Насколько дороже шаг прямо сейчас (0 — эффекта нет).
 * Читается при расчёте стоимости хода и в списке доступных ходов.
 */
export async function slowExtraCost(account: string): Promise<number> {
  return slowExtraOf(await loadSlowRows(account));
}

/** Одно активное замедление. У аккаунта оно одно на вид эффекта. */
export type SlowRow = { value: number; expiresAt: string; source?: string | null };

/**
 * Все активные замедления аккаунта, сильные впереди.
 *
 * Одна выборка на двух потребителей: и списание (slowExtraCost), и показ на
 * карте (active-effects.ts). Раньше это были ДВА разных запроса с РАЗНЫМИ
 * правилами — max(value) на списании и «строка с самым дальним сроком» на
 * показе. У игрока с двумя замедлениями (+12 на минуту и +2 на пять минут)
 * карта рисовала +2, а сервер снимал +12.
 */
export async function loadSlowRows(account: string): Promise<SlowRow[]> {
  if (!account) return [];
  const rows = (await mcpExec(
    `SELECT value, expires_at, source FROM yuplink.beta_raid_player_effects
      WHERE kind = 'slow' AND expires_at > now()
        AND account_id = ${sqlStr(account)}
      ORDER BY value DESC, expires_at DESC;`,
    { wrapJson: true },
  )) as Array<{ value: number; expires_at: string; source: string | null }>;
  return (rows ?? [])
    .map((r) => ({
      value: Math.max(0, Number(r.value) || 0),
      expiresAt: r.expires_at,
      source: r.source ?? null,
    }))
    .filter((r) => r.value > 0);
}

/**
 * Надбавка к шагу по набору строк: САМОЕ СИЛЬНОЕ из ещё живых замедлений —
 * складывать их нельзя, второе замедление не усиливает первое.
 *
 * Правило вынесено в чистую функцию, потому что клиент применяет его заново по
 * мере того, как строки истекают (components/beta-raid/useSlowExtra.ts): сервер
 * не умеет посчитать «через минуту», а разъезжаться этим двоим нельзя.
 */
export function slowExtraOf(rows: SlowRow[], nowMs = Date.now()): number {
  let extra = 0;
  for (const r of rows) {
    const until = Date.parse(r.expiresAt);
    if (Number.isFinite(until) && until <= nowMs) continue;
    if (r.value > extra) extra = r.value;
  }
  return extra;
}

// Выжигание энергии живёт в energy-burn.ts (файл на 250 строк не резиновый);
// ре-экспорт — чтобы вызывающие не переезжали.
export { burnEnergy } from "./energy-burn";
export { applyPlayerEffect as applyTimedEffect };
