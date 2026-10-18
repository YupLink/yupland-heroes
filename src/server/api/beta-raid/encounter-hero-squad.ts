// Кто пойдёт в бой от героя: сила героя и — только по просьбе — его отряд.
//
// Вынесено из encounter-attack: тот держится у потолка в 250 строк, а здесь
// одна законченная мысль — «собрать сторону игрока».
//
// Отряд из замка БОЛЬШЕ НЕ ЗАКОН. Состав на каждый бой игрок собирает в окне
// боя, как и до появления героев; замок держит отряд как память — им можно
// подменить пустой состав, но не переклеить присланный. Поэтому squadFallback
// по умолчанию выключен: вызывающий, который про него не знает, получает
// squad: null и идёт прежней веткой resolveLineup.
import { loadHeroPower, type HeroPowerInfo } from "./hero-power";
import { resolveHeroSquadLineup, type HeroSquadLineup } from "./encounter-lineup-squad";

export type HeroSide = { hero: HeroPowerInfo | null; squad: HeroSquadLineup | null };

export async function loadHeroSide(
  wallet: string,
  opts?: {
    /**
     * Клиент прислал пустой состав — разрешаем достать отряд из замка.
     * Засев (seedHeroSquad) тоже только здесь: писать в базу на каждом ударе
     * ради состава, которым всё равно не дерутся, незачем.
     */
    squadFallback?: boolean;
  },
): Promise<HeroSide> {
  // Герой приходит уже ослабленным: пункты снимает loadHeroPower (hero-power),
  // одной точкой на бой, карту и окно героя.
  const hero = await loadHeroPower(wallet);
  if (!hero) return { hero: null, squad: null };
  if (!opts?.squadFallback) return { hero, squad: null };

  // Отряд пуст — засеваем лучшими боеспособными прямо здесь: игрок не должен
  // идти через полкарты в замок только затем, чтобы бой вообще состоялся.
  let entries = hero.squad;
  if (entries.length === 0) {
    const { seedHeroSquad } = await import("../heroes-squad-seed");
    entries = await seedHeroSquad(wallet);
  }
  return { hero, squad: await resolveHeroSquadLineup(wallet, entries) };
}
