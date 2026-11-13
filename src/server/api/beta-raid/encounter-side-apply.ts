// Побочки боя, которые ложатся ПОСЛЕ урона: выжигание энергии, замедление,
// ослабление героя, яд и оглушение на фишках.
//
// Один модуль на два боя (энкаунтер и страж шахты): раньше этот блок стоял в
// обоих файлах порознь, и новая способность требовала правки в двух местах.
//
// Каждая побочка сама по себе: её сбой НЕ отменяет засчитанный удар — за это
// правило уже платили однажды, когда упавшее выжигание съедало весь бой.
//
// Сюда же — износ надетых артефактов (владелец, 22.10.2026; art-wear-hit):
// за бой, а не за удар (23.10.2026: бой = цель, одна её жизнь — сколько ни бей,
// артефакт изнашивается один раз), и только за засчитанный удар. Что при
// этом сломалось и слетело с героя (§8.63 п.3) — artBroken: плашка над героем.
import { applyChipEffects } from "./chip-effects";
import { applySlow, applyWeaken, burnEnergy } from "./encounter-effects";
import { applyStrip } from "./hero-strip";
import { wearHeroArtifacts } from "./art-wear-hit";
import type { WeakenKind } from "./abilities";
import type { SimSideEffects } from "./encounter-sim-types";
import type { ArtBreakNote } from "@/lib/hero/artBroken";

export async function applySideEffects(
  wallet: string,
  side: SimSideEffects,
  /** Куда жаловаться на сбой: у энкаунтера свой префикс, у шахты свой. */
  tag = "[beta-attack]",
  /**
   * Имя цели — пишется в строку эффекта как источник. Без него игрок видел
   * «−40 удачи» и не понимал, от кого: жалоба «дебафф не от того моба».
   */
  source?: string | null,
  /**
   * Герой, который дрался в этом ударе, и ключ боя — жизни цели: его надетые
   * артефакты изнашиваются один раз за бой (art-wear-hit).
   */
  hero?: { heroId: string; fight: string } | null,
): Promise<{ burned: number; artBroken: ArtBreakNote[] }> {
  let burned = 0;
  if (side.burnedEnergy > 0) {
    burned = await burnEnergy(wallet, side.burnedEnergy).catch((e) => {
      console.warn(`${tag} выжигание не прошло:`, e);
      return 0;
    });
  }
  if (side.slow) {
    await applySlow(wallet, side.slow.extraCost, side.slow.minutes, source).catch((e) =>
      console.warn(`${tag} замедление не легло:`, e),
    );
  }
  // Ослабление героя: каждая характеристика — своя строка со своим сроком.
  for (const [kind, w] of Object.entries(side.weaken)) {
    if (!w || w.value <= 0) continue;
    await applyWeaken(wallet, kind as WeakenKind, w.value, w.minutes, source).catch((e) =>
      console.warn(`${tag} ослабление не легло:`, e),
    );
  }
  // Снятие иммунитетов — на аккаунт, минуты как задал админ (hero-strip).
  if (side.strip && side.strip.minutes > 0) {
    await applyStrip(wallet, side.strip.minutes, source).catch((e) =>
      console.warn(`${tag} снятие иммунитетов не легло:`, e),
    );
  }
  // Яд и оглушение — на конкретные фишки, срок в минутах реального времени.
  if (side.chipEffects.length > 0) {
    await applyChipEffects(side.chipEffects, source).catch((e) =>
      console.warn(`${tag} эффекты на фишки не легли:`, e),
    );
  }
  // Сбой износа ловит сам wearHeroArtifacts — удар остаётся засчитанным.
  const artBroken = hero ? await wearHeroArtifacts(wallet, hero.heroId, hero.fight) : [];
  return { burned, artBroken };
}
