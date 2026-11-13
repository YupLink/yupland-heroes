// Рыбалка динамитом (владелец, 30.10.2026): «красным динамитом можно ловить рыбу —
// бросаешь в воду, и каждая клетка воды получает такой же шанс на рыбалку, как и
// удочкой. Шанс сработал — всплывает рыба. Ещё есть башмак: тогда, когда открываешь
// рыбу забрать, — „Упс, показалось“. Забирается как мешочек, только вместо мешочка
// рыба». Только красный, только вода под взрывом, шансы те же.
//
// Шанс клетки — шанс заброса удочкой этого героя сейчас: база мира × бонус героя
// (артефакты и удача, fishBonus) × погода карты (fishWeather) — теми же функциями,
// что у заброса. Бросок и вид улова — fishHit и catchItemOf от зерна броска с
// сервера (fishing-seed): номер клетки во взрыве — номер попытки, поэтому повтор
// того же броска не переигрывает ни одной клетки.
//
// Всплывшая рыба — мешочек (ПРАВИЛА §8.21) с меткой источника FISH_BAG_SOURCE: те же
// окно, вход «Открыть», «Забрать», срок порции и живой поток, только на карте —
// рыба. Башмак — порция-метка FISH_BOOT_KEY: «Открыть» её снимает, игроку — «Упс,
// показалось», и рыба исчезает.
import { blastCells } from "@/lib/dynamite";
import { chancePlanOf } from "@/lib/raid/fishChanceSteps";
import { weatherChancePlan } from "@/lib/raid/fishWeather";
import { catchItemOf, fishHit, type FishItem } from "@/lib/raid/fishing";

type Hex = { q: number; r: number };

/** Источник мешочка-рыбы (raid_loot_bag.source): по нему слой рисует рыбу. */
export const FISH_BAG_SOURCE = "floatfish";

/** Подпись источника у мешочка (source_name). */
export const FISH_BAG_SOURCE_NAME = "Рыбалка динамитом";

/** Порция-метка башмака: в рюкзак не идёт, «Открыть» её снимает. */
export const FISH_BOOT_KEY = "fish:boot";
export const FISH_BOOT_KIND = "boot";
export const FISH_BOOT_NAME = "Упс, показалось";

/**
 * Башмак в улове — свой товар админа с таким именем (в коде его нет, только в
 * списке улова fishing_config): башмак, ботинок, сапог, boot, shoe.
 */
export const isBootName = (name: string | null | undefined): boolean =>
  /(башмак|ботин|сапог|\bboots?\b|\bshoes?\b)/i.test(String(name ?? ""));

/**
 * Шанс одной клетки воды, %: ровно шанс заброса удочкой в этот миг — база мира с
 * бонусом героя (без ступеней: взрыв мгновенный) и погодой последним множителем.
 */
export const dynamiteFishChance = (
  basePct: number,
  bonusPct: number,
  weatherCoef: number,
): number => weatherChancePlan(chancePlanOf(basePct, bonusPct, []), weatherCoef).chancePct;

/** Всплыла рыба: клетка и пойманный товар. */
export type FishRoll = { q: number; r: number; itemId: string };

/**
 * Броски клеток красного взрыва с центром `at`: клетка воды номер n (порядок
 * blastCells) — попытка n заброса с зерном `seed`. Шанс сработал — вид по долям
 * улова (catchItemOf). Суша не бросает; пустой улов — рыбы нет.
 */
export function rollBlastFish(o: {
  seed: string;
  at: Hex;
  isWater: (c: Hex) => boolean;
  chancePct: number;
  items: readonly FishItem[];
}): FishRoll[] {
  const out: FishRoll[] = [];
  blastCells(o.at, "red").forEach((c, n) => {
    if (!o.isWater(c) || !fishHit(o.seed, n, o.chancePct)) return;
    const itemId = catchItemOf(o.items, o.seed, n);
    if (itemId) out.push({ q: c.q, r: c.r, itemId });
  });
  return out;
}
