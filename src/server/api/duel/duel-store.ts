// Данные песочницы дуэли: свои герои, мобы казарм, еда с сытостью, энергия, поле.
// Только чтение. Ход и дальность моба — его поля duel_move/duel_range. Жизни раненых
// мобов после прошлых боёв — duel-mob-hp.ts.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { accountOf } from "@/server/api/user-shared";
import { energyOf } from "@/server/api/raid-helpers";
import { HERO_HIT, MOB_MOVE, parseDamage } from "@/lib/duel/rules";
import { parseBoostEffects } from "@/lib/hero/boost";
import type { Food } from "@/lib/duel/types";
import { duelField, type DuelField } from "./duel-field";
import { mobHpOf } from "./duel-mob-hp";

export type DuelHeroRow = { id: string; name: string; image: string | null; level: number };
export type DuelMob = {
  id: string;
  name: string;
  image: string | null;
  hp: number;
  dmg: [number, number];
  level: number;
  move: number;
  /** Дальность удара: 1 — вплотную, 2+ — стреляет. */
  range: number;
};
export type DuelHero = {
  id: string;
  name: string;
  image: string | null;
  /** Фигурка по расе — та же, что ходит по карте (рыцарь, если расы нет). */
  sprite: string;
  hp: number;
  maxHp: number;
  dmg: [number, number];
  arm: number;
  int: number;
  atk: number;
};
export type DuelSetup = {
  heroes: DuelHeroRow[];
  mobs: DuelMob[];
  foods: Food[];
  energy: number;
  /** Земля и препятствия — из местности, где стоит герой. */
  field: DuelField;
  /** Раненые мобы после прошлых боёв: «шаблон:копия» → жизни (нет — полный). */
  mobHp: Record<string, number>;
};

const q = async <T>(sql: string): Promise<T[]> =>
  ((await mcpExec(sql, { wrapJson: true })) ?? []) as T[];

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export async function duelSetup(wallet: string): Promise<DuelSetup> {
  const account = await accountOf(wallet);
  const [heroes, mobs, foods, field, energy, mobHp] = await Promise.all([
    q<Record<string, unknown>>(
      `SELECT h.id, h.level, t.name, t.image_url FROM yuplink.hero_instance h
         JOIN yuplink.mystic_item_template t ON t.id = h.template_id
        WHERE h.account_id = ${sqlStr(account)}
        ORDER BY h.selected_at DESC NULLS LAST, h.level DESC LIMIT 200;`,
    ),
    // Мобы — те, что продают казармы (вид позиции boss).
    q<Record<string, unknown>>(
      `SELECT DISTINCT ON (bt.id) bt.id, bt.name, COALESCE(bt.map_image_url, bt.image_url) AS img,
              bt.max_hp, bt.damage, bt.level, bt.duel_move, bt.duel_range
         FROM yuplink.raid_market_item mi
         JOIN yuplink.raid_boss_template bt ON bt.id = mi.ref_id
        WHERE mi.kind = 'boss' ORDER BY bt.id;`,
    ),
    // Все форматы бустов (массив, {effects}, одиночный) разбирает общий парсер игры.
    q<Record<string, unknown>>(
      `SELECT id, name, image, boost FROM yuplink.raid_custom_item
        WHERE boost::text LIKE '%satiety%';`,
    ),
    duelField(account),
    energyOf(wallet).catch(() => 0),
    mobHpOf(account),
  ]);
  return {
    heroes: heroes.map((h) => ({
      id: String(h.id),
      name: String(h.name ?? ""),
      image: str(h.image_url),
      level: Number(h.level) || 0,
    })),
    mobs: mobs
      .map((m) => ({
        id: String(m.id),
        name: String(m.name ?? ""),
        image: str(m.img),
        hp: Math.max(1, Number(m.max_hp) || 1),
        dmg: parseDamage(m.damage as string | null),
        level: Number(m.level) || 1,
        move: Number(m.duel_move) > 0 ? Number(m.duel_move) : MOB_MOVE,
        range: Number(m.duel_range) >= 2 ? Number(m.duel_range) : 1,
      }))
      .sort((a, b) => a.level - b.level || a.hp - b.hp),
    foods: foods
      .map((f) => {
        const sat = parseBoostEffects(f.boost).find((e) => e.stat === "satiety");
        return {
          id: String(f.id),
          name: String(f.name ?? ""),
          image: str(f.image),
          value: Number(String(sat?.value ?? "").split("-")[0]) || 0,
        };
      })
      .filter((f) => f.value > 0)
      .sort((a, b) => a.value - b.value),
    energy: Math.floor(Number(energy) || 0),
    field,
    mobHp,
  };
}

/** Герой в бой: жизни — сытость, удар — атака × правило, броня и интеллект — итоговые. */
export async function duelHero(wallet: string, heroId: string): Promise<DuelHero> {
  const { loadOwnedHero } = await import("@/server/api/beta-raid/hero-load");
  const { buildHeroPower } = await import("@/server/api/beta-raid/hero-power");
  const { spriteForRace } = await import("@/server/api/beta-raid/hero-look");
  const { info } = buildHeroPower(await loadOwnedHero(wallet, heroId));
  const atk = Math.round(info.stats.atk);
  return {
    id: info.heroId,
    name: info.name,
    image: info.imageUrl,
    sprite: spriteForRace(info.race) ?? "knight",
    hp: Math.round(info.satiety.now),
    maxHp: Math.round(info.satiety.max),
    dmg: [atk * HERO_HIT, atk * HERO_HIT],
    arm: Math.round(info.stats.arm),
    int: Math.round(info.stats.int),
    atk,
  };
}

/** Ход и дальность моба (окно моба → «Дуэль»). Пусто — 3 клетки и удар вплотную. */
export type MobDuelStats = { move: number | null; range: number | null };

const intOrNull = (v: unknown): number | null => (Number(v) > 0 ? Math.round(Number(v)) : null);

export async function mobDuelStats(id: string): Promise<MobDuelStats> {
  const rows = await q<Record<string, unknown>>(
    `SELECT duel_move, duel_range FROM yuplink.raid_boss_template WHERE id = ${sqlStr(id)};`,
  );
  return { move: intOrNull(rows[0]?.duel_move), range: intOrNull(rows[0]?.duel_range) };
}

export async function setMobDuelStats(id: string, s: MobDuelStats): Promise<void> {
  const sql = (v: number | null) => (v === null ? "NULL" : String(Math.round(v)));
  await mcpExec(
    `UPDATE yuplink.raid_boss_template SET duel_move = ${sql(s.move)}, duel_range = ${sql(s.range)}
      WHERE id = ${sqlStr(id)};`,
  );
}
