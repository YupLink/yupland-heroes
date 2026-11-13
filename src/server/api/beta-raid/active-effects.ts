// Что висит на игроке прямо сейчас — для значков над героем на карте.
//
// Замедление живёт на кошельке, яд и оглушение — на конкретных фишках, поэтому
// собираем их вместе и отдаём с именами: игрок должен видеть, КАКАЯ фишка
// выбыла и когда отпустит.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { loadSlowRows, slowExtraOf, type SlowRow } from "./encounter-effects";
import { STRIP_IMMUNE_KIND, WEAKEN_KINDS, type WeakenKind } from "./abilities";
import { BUFF_KINDS } from "./hero-buff";
import { IMMUNE_PREFIX } from "@/lib/hero/boostImmune";
import { SIGHT_KIND } from "@/lib/raid/sight";

export type ActiveChipEffect = {
  chipId: string;
  kind: "poison" | "stun";
  value: number;
  name: string | null;
  level: number;
  expiresAt: string;
  /** Кто повесил (имя цели). Старые строки без него — null. */
  source: string | null;
};

/**
 * Замедление для показа. `value` — надбавка ПРЯМО СЕЙЧАС, ровно та, что спишет
 * сервер (encounter-effects.slowExtraOf по тем же строкам). `expiresAt` — когда
 * замедление отпустит полностью.
 *
 * Из этого же `value` состояние рейда (move.getBetaRaidState) отдаёт поле
 * `slowExtra` старым клиентам — второго похода в базу за теми же строками там
 * больше нет.
 *
 * Строк бывает несколько (по одной на кошелёк-сестру), и сильная не обязана
 * быть самой долгой. Поэтому отдаём их СПИСКОМ: одного числа хватило бы ровно
 * до момента, когда сильное истечёт, — клиент обнулил бы надбавку, а сервер
 * продолжил бы брать по слабому. Со списком клиент пересчитывает максимум по
 * срокам и падает не в ноль, а на оставшееся.
 */
export type ActiveSlow = {
  value: number;
  expiresAt: string;
  rows: SlowRow[];
  /** Кто повесил самое сильное из живых. */
  source: string | null;
};

/**
 * Ослабление героя: вид, сколько пунктов снято, когда отпустит и от кого.
 * Снятие иммунитетов (strip_immune) едет тем же списком — дебафф героя со
 * сроком; силы у него нет, значок рисуется без числа (effectGroups).
 */
export type ActiveWeaken = {
  kind: WeakenKind | typeof STRIP_IMMUNE_KIND;
  value: number;
  expiresAt: string;
  source: string | null;
};

/** Бафф героя: вид (buff_atk, immune_poison и т.п.), сколько пунктов дано и до какого часа. */
export type ActiveBuff = {
  kind: string;
  value: number;
  expiresAt: string;
  source: string | null;
};

export type ActiveEffects = {
  slow: ActiveSlow | null;
  chips: ActiveChipEffect[];
  /** Что сейчас сбито у героя — значками рядом с замедлением. */
  weaken: ActiveWeaken[];
  /** Что сейчас прибавлено бустами — теми же значками, только в плюс. */
  buff: ActiveBuff[];
};

/** Строка beta_raid_player_effects в том виде, как отдаёт мост. */
type EffectRow = { kind: string; value: number; expires_at: string; source: string | null };

export async function loadActiveEffects(account: string): Promise<ActiveEffects> {
  if (!account) return { slow: null, chips: [], weaken: [], buff: [] };

  // Замедление и эффекты фишек друг о друге ничего не знают — спрашиваем разом.
  // Друг за другом они стояли просто по порядку написания, и самый частый ответ
  // рейда платил за это лишним сетевым рейсом.
  const [slowRows, chipRows, weakRows, buffRows] = await Promise.all([
    loadSlowRows(account).catch(() => [] as SlowRow[]),
    mcpExec(
      `SELECT e.chip_id, e.kind, e.value, e.expires_at, e.source, c.level, t.name
         FROM yuplink.chip_effects e
         JOIN yuplink.user_chip_inventory c ON c.id = e.chip_id
         LEFT JOIN yuplink.chip_templates t ON t.id = c.template_id
        WHERE e.expires_at > now() AND c.account_id = ${sqlStr(account)}
        ORDER BY e.expires_at;`,
      { wrapJson: true },
    ).catch(() => []) as Promise<
      Array<{
        chip_id: string;
        kind: string;
        value: number;
        expires_at: string;
        source: string | null;
        level: number;
        name: string | null;
      }>
    >,
    // Ослабления героя лежат там же, где замедление, — берём их тем же рейсом.
    mcpExec(
      `SELECT kind, value, expires_at, source FROM yuplink.beta_raid_player_effects
        WHERE kind IN (${[...WEAKEN_KINDS, STRIP_IMMUNE_KIND].map(sqlStr).join(",")})
          AND expires_at > now() AND account_id = ${sqlStr(account)}
        ORDER BY expires_at DESC;`,
      { wrapJson: true },
    ).catch(() => []) as Promise<EffectRow[]>,
    // Бусты — там же и тем же рейсом: игрок должен видеть, сколько ему осталось
    // ходить усиленным, ровно как видит ослабление. Временный иммунитет
    // (immune_*) едет в том же списке: форма ответа та же, значок свой.
    mcpExec(
      `SELECT kind, value, expires_at, source FROM yuplink.beta_raid_player_effects
        WHERE (kind IN (${[...BUFF_KINDS, SIGHT_KIND].map(sqlStr).join(",")})
               OR left(kind, ${IMMUNE_PREFIX.length}) = ${sqlStr(IMMUNE_PREFIX)})
          AND expires_at > now()
          AND account_id = ${sqlStr(account)}
        ORDER BY expires_at DESC;`,
      { wrapJson: true },
    ).catch(() => []) as Promise<EffectRow[]>,
  ]);

  // Надбавка — по тому же правилу, что и списание. Срок — по последней строке:
  // значок над героем должен гаснуть, когда замедление сойдёт ВСЁ.
  const value = slowExtraOf(slowRows);
  const last = slowRows.reduce<string | null>(
    (acc, r) => (acc === null || Date.parse(r.expiresAt) > Date.parse(acc) ? r.expiresAt : acc),
    null,
  );
  // Источник — у той строки, чью надбавку списывает сервер (самой сильной).
  const slowSource = slowRows.find((r) => r.value === value)?.source ?? null;
  const slow =
    value > 0 && last ? { value, expiresAt: last, rows: slowRows, source: slowSource } : null;

  // По каждому виду показываем самое сильное — ровно то, что вычтет бой.
  const strongest = new Map<string, ActiveWeaken>();
  for (const row of weakRows ?? []) {
    const value = Math.max(0, Math.floor(Number(row.value) || 0));
    if (value <= 0) continue;
    const prev = strongest.get(row.kind);
    if (!prev || value > prev.value) {
      strongest.set(row.kind, {
        kind: row.kind as ActiveWeaken["kind"],
        value,
        expiresAt: row.expires_at,
        source: row.source ?? null,
      });
    }
  }

  return {
    slow,
    weaken: [...strongest.values()],
    buff: (buffRows ?? [])
      .map((r) => ({
        kind: String(r.kind),
        value: Math.max(0, Math.floor(Number(r.value) || 0)),
        expiresAt: r.expires_at,
        source: r.source ?? null,
      }))
      .filter((b) => b.value > 0),
    chips: (chipRows ?? [])
      .filter((r) => r.kind === "poison" || r.kind === "stun")
      .map((r) => ({
        chipId: r.chip_id,
        kind: r.kind as "poison" | "stun",
        value: Number(r.value) || 0,
        name: r.name,
        level: Number(r.level) || 0,
        expiresAt: r.expires_at,
        source: r.source ?? null,
      })),
  };
}
