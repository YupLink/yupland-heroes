// Расклад дуэли (владелец 07.11.2026: «где карта боя… нахер кучу настроек»):
// страница сразу открывается полем. Вы — ваш герой, за противника ходит компьютер.
// Бойцов (до 4, одинаковых можно несколько) выбираете сами из списка (владелец
// 09.11.2026); ваши выходят с жизнями после прошлых боёв (duel_mob_hp), у противника —
// те же, полные; еда одинаковая.
// «Ещё бой» — новая земля и еда, ваш выбор остаётся.
import { useQuery } from "@tanstack/react-query";
import { FOOD_SLOTS } from "@/lib/duel/rules";
import { heroFootAtlas } from "@/lib/gameArt";
import type { SideInput, UnitInput } from "@/lib/duel/types";
import {
  getDuelHero,
  getDuelSetup,
  type DuelHero,
  type DuelMob,
  type DuelSetup,
} from "@/server/api/duel/duel-api";

function useDuelHero(heroId: string | null) {
  return useQuery({
    // Ключ с версией формы ответа: кэш запросов живёт в localStorage, а в
    // старом ответе нет фигурки героя.
    queryKey: ["duel-hero", "sprite", heroId],
    queryFn: () => getDuelHero({ data: { heroId: heroId as string } }),
    enabled: !!heroId,
    staleTime: 60_000,
  });
}

/** Справочники и герои сторон: ваш выбранный герой и следующий за ним (или он же). */
export function useDuelSetup() {
  const setup = useQuery({
    queryKey: ["duel-setup", "field"],
    queryFn: () => getDuelSetup(),
    staleTime: 60_000,
  });
  const heroes = setup.data?.heroes ?? [];
  const heroA = useDuelHero(heroes[0]?.id ?? null);
  const heroB = useDuelHero(heroes[1]?.id ?? heroes[0]?.id ?? null);
  return { setup, heroA, heroB, noHero: !!setup.data && heroes.length === 0 };
}

/** n случайных из списка по сиду (без повторов, пока хватает). */
function pick<T>(list: T[], n: number, seed: number): T[] {
  const pool = [...list];
  const out: T[] = [];
  let s = seed;
  while (out.length < n && pool.length > 0) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    out.push(pool.splice(s % pool.length, 1)[0]);
  }
  return out;
}

/** Моб в бой; hp — его жизни после прошлых боёв (нет — полный). */
const mobUnit = (m: DuelMob, hp = m.hp): UnitInput => ({
  id: m.id,
  kind: "mob",
  name: m.name,
  image: m.image,
  hp: Math.min(m.hp, Math.max(1, hp)),
  maxHp: m.hp,
  dmg: m.dmg,
  arm: 0,
  move: m.move,
  range: m.range,
});

/** Ваши мобы с жизнями по копиям (владелец 09.11: «чтобы в следующем бою их жизни соответствовали»). */
function woundedMobs(mobs: DuelMob[], hp: Record<string, number>): UnitInput[] {
  const copies = new Map<string, number>();
  return mobs.map((m) => {
    const copy = copies.get(m.id) ?? 0;
    copies.set(m.id, copy + 1);
    return mobUnit(m, hp[`${m.id}:${copy}`] ?? m.hp);
  });
}

function heroSide(hero: DuelHero, mobs: UnitInput[], s: DuelSetup, seed: number): SideInput {
  return {
    hero: {
      id: hero.id,
      kind: "hero",
      name: hero.name,
      image: hero.image,
      atlas: heroFootAtlas(hero.sprite),
      // Песочница ничего не списывает: голодный герой выходит сытым, иначе боя нет.
      hp: hero.hp > 0 ? hero.hp : hero.maxHp,
      maxHp: hero.maxHp,
      dmg: hero.dmg,
      arm: hero.arm,
      move: 0,
      range: 1,
    },
    mobs,
    kit: { energy: s.energy, int: hero.int, food: pick(s.foods, FOOD_SLOTS, seed + 7) },
  };
}

/** Обе стороны расклада: ваши бойцы, у противника те же; еда одинаковая. */
export function duelSides(
  s: DuelSetup,
  a: DuelHero,
  b: DuelHero,
  army: DuelMob[],
  seed: number,
): [SideInput, SideInput] {
  return [
    heroSide(a, woundedMobs(army, s.mobHp ?? {}), s, seed),
    heroSide(
      b,
      army.map((m) => mobUnit(m)),
      s,
      seed,
    ),
  ];
}
