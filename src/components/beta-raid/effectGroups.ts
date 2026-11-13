// Сборка групп HUD эффектов — чистая функция, без React.
//
// Вынесена из BetaEffectHud.tsx, чтобы правило «что показываем и с каким
// числом» можно было проверить тестом (jsdom в проекте нет — окружение node),
// а сам HUD остался в лимите на размер файла.
import {
  OBLIVION_LV_KIND,
  OBLIVION_LVT_KIND,
  OBLIVION_TIME_KIND,
  oblivionStateOf,
} from "@/lib/hero/boostOblivion";
import { SIGHT_KIND } from "@/lib/raid/sight";

export type HudChipEffect = {
  chipId: string;
  kind: "poison" | "stun";
  name: string | null;
  level: number;
  expiresAt: string;
  /** Кто повесил (имя цели). Старый кэш поля не знает — тогда пусто. */
  source?: string | null;
};
/** Одно замедление: их у аккаунта столько, сколько кошельков-сестёр. */
export type HudSlowRow = { value: number; expiresAt: string; source?: string | null };
export type HudSlow = {
  value: number;
  expiresAt: string;
  rows?: HudSlowRow[];
  source?: string | null;
} | null;
/** Ослабление героя: сколько пунктов сбито, до какого времени и от кого. */
export type HudWeaken = { kind: string; value: number; expiresAt: string; source?: string | null };
/** Бафф героя: сколько пунктов прибавлено и до какого времени. */
export type HudBuff = { kind: string; value: number; expiresAt: string; source?: string | null };

export type EffectGroup = {
  key: string;
  badge: string | null;
  /** До какого часа висит; пусто — без срока (уровень забвения). */
  until: string;
  items: HudChipEffect[];
  /** От кого висит — печатается под подписью. У групп фишек — в каждой строке. */
  source: string | null;
};

/**
 * Живые строки замедления. Пара `value`+`expiresAt` в корне собрана сервером из
 * ДВУХ РАЗНЫХ строк — величина из самой сильной, срок из самой долгой, — и как
 * одно целое она врёт с той секунды, когда сильная истекла. Поэтому считаем по
 * списку. Старый ответ из персистентного кэша списка не знает: тогда это одна
 * строка, ровно как раньше.
 */
export function slowRowsOf(slow: HudSlow): HudSlowRow[] {
  if (!slow) return [];
  const list = Array.isArray(slow.rows) && slow.rows.length > 0 ? slow.rows : [slow];
  return list
    .map((r) => ({
      value: Math.max(0, Number(r.value) || 0),
      expiresAt: String(r.expiresAt),
      source: r.source ?? null,
    }))
    .filter((r) => r.value > 0 && Number.isFinite(Date.parse(r.expiresAt)));
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export function buildEffectGroups(input: {
  chips: unknown;
  slow: HudSlow;
  weaken: unknown;
  buff: unknown;
  /** Забвение (useOblivion): заряды, заряды со сроком, безлимит. Нет — значка нет. */
  oblivion?: unknown;
  now: number;
}): EffectGroup[] {
  const { slow, now } = input;
  // Состояние карты кэшируется у игрока — старый формат не должен ронять экран.
  const chips: HudChipEffect[] = Array.isArray(input.chips) ? (input.chips as HudChipEffect[]) : [];
  const live = chips.filter((c) => new Date(c.expiresAt).getTime() > now);
  const out: EffectGroup[] = [];
  for (const kind of ["poison", "stun"] as const) {
    const items = live.filter((c) => c.kind === kind);
    if (items.length === 0) continue;
    // Показываем, когда эффект сойдёт полностью — то есть по последней фишке.
    const last = items.reduce((a, b) => (a.expiresAt > b.expiresAt ? a : b));
    out.push({
      key: kind,
      badge: items.length > 1 ? `×${items.length}` : null,
      until: last.expiresAt,
      items,
      source: null,
    });
  }
  // Замедление пересчитываем ЗАНОВО на каждый тик и по тому же правилу, что и
  // цены (useSlowExtra, а на сервере slowExtraOf): сильнейшее из ещё живых.
  // Раньше значок печатал серверную пару как есть, и у игрока с двумя
  // замедлениями (+12 на минуту и +2 на пять) после первой минуты кружки цены
  // считали +2, а над героем ещё четыре минуты висело «+12».
  const liveSlow = slowRowsOf(slow).filter((r) => Date.parse(r.expiresAt) > now);
  if (liveSlow.length > 0) {
    const strongest = liveSlow.reduce((m, r) => (r.value > m.value ? r : m));
    // Гаснет значок, когда сойдёт ВСЁ, — значит по самому дальнему сроку.
    const until = liveSlow.reduce((a, b) =>
      Date.parse(a.expiresAt) > Date.parse(b.expiresAt) ? a : b,
    ).expiresAt;
    out.push({
      key: "slow",
      badge: `+${strongest.value}`,
      until,
      items: [],
      source: strongest.source ?? str(slow?.source),
    });
  }
  // Ослабление героя: свой значок на каждую характеристику — «−2» с таймером.
  const weaken: HudWeaken[] = Array.isArray(input.weaken) ? (input.weaken as HudWeaken[]) : [];
  for (const w of weaken) {
    const value = Math.max(0, Number(w.value) || 0);
    if (value <= 0 || Date.parse(w.expiresAt) <= now) continue;
    out.push({
      key: w.kind,
      // Снятие иммунитетов едет этим же списком, но силы у него нет — только таймер.
      badge: w.kind === "strip_immune" ? null : `−${value}`,
      until: w.expiresAt,
      items: [],
      source: str(w.source),
    });
  }
  // Бусты — зеркально ослаблению: «+2» с таймером до снятия.
  const buff: HudBuff[] = Array.isArray(input.buff) ? (input.buff as HudBuff[]) : [];
  for (const b of buff) {
    const value = Math.max(0, Number(b.value) || 0);
    if (value <= 0 || Date.parse(b.expiresAt) <= now) continue;
    out.push({
      key: b.kind,
      // У иммунитета и бинокля «силы» нет — только таймер, без «+1».
      badge: b.kind.startsWith("immune_") || b.kind === SIGHT_KIND ? null : `+${value}`,
      until: b.expiresAt,
      items: [],
      source: str(b.source),
    });
  }
  // Забвение — по значку на вид и в порядке траты: безлимит (только таймер),
  // заряды со сроком («3 Lv» и таймер), вечные заряды («3 Lv» без таймера).
  const obl = oblivionStateOf(input.oblivion);
  const push = (key: string, badge: string | null, until: string) =>
    out.push({ key, badge, until, items: [], source: null });
  if (obl.until && Date.parse(obl.until) > now) push(OBLIVION_TIME_KIND, null, obl.until);
  if (obl.timedLevel > 0 && obl.timedUntil && Date.parse(obl.timedUntil) > now)
    push(OBLIVION_LVT_KIND, `${obl.timedLevel} Lv`, obl.timedUntil);
  if (obl.level > 0) push(OBLIVION_LV_KIND, `${obl.level} Lv`, "");
  return out;
}
