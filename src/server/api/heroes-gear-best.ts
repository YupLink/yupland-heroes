// «Надеть лучшее»: одна кнопка вместо четырнадцати перетаскиваний.
//
// Что считать лучшим, решает чистый @/lib/hero/bestGear — здесь только вокруг
// него: гейт, чтение инвентаря, одна запись equipped и сброс кэшей. Гейт тот
// же, что у ручного надевания (heroes-gear.ts): флаг режима и выбранный герой,
// место значения не имеет — переодеваться владелец разрешил где угодно.
//
// Ответ отдаёт ПОЛНЫЕ характеристики до и после, а не только вклад артефактов:
// игроку показывают «было / стало», и считать разницу на клиенте — значит
// заводить вторую формулу рядом с effectiveHeroStats.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "../db/mcpClient";
import { requireWallet } from "../auth";
import { sqlStr } from "./raid-shared";
import { accountOf } from "./user-shared";
import { heroPowerEnabled, invalidateHeroPower } from "./beta-raid/hero-power";
import { loadSelectedHero, type LoadedGearPiece } from "./beta-raid/hero-load";
import { loadOwnedArtifacts, writeEquipped } from "./heroes-gear-read";
import { preferFreeCopies } from "./heroes-gear-copies";
import { bestGearFor, type BestGearItem } from "@/lib/hero/bestGear";
import { artDisabled } from "@/lib/hero/artWear";
import { artLocked } from "@/lib/hero/artBroken";
import { artBrokenOn } from "./art-repair/art-repair-gate";
import { heroSlots, normalizeHeroRarity } from "@/lib/hero/heroSlots";
import { MOUNT_SLOT } from "@/lib/hero/mount";
import { effectiveHeroStats } from "@/lib/hero/effectiveHeroStats";
import type { GearPiece } from "@/lib/hero/heroStatSources";
import type { HeroStats } from "@/lib/heroStats";

export type BestGearApplied = {
  ok: true;
  /** Сколько мест поменялось. 0 — лучшее уже было надето. */
  changed: number;
  before: HeroStats;
  after: HeroStats;
  /** Прирост суммы шести характеристик. */
  gain: number;
};

/**
 * Снять выбранные предметы со ВСЕХ остальных героев аккаунта — одним UPDATE.
 *
 * equipped лежит на каждом герое отдельно, и без чистки один экземпляр числился
 * бы надетым сразу у двоих: экран показывал бы предмет там, где его нет, а
 * второй герой в строю дал бы двойной бонус. Ручная надевашка чистит по одному
 * предмету, здесь их сразу до четырнадцати — потому и отдельный запрос.
 *
 * Сбой чистки бой не ломает (висячая запись — это ровно прежнее поведение),
 * поэтому вызывающий только пишет в лог и доводит надевание до конца.
 */
async function unequipFromOtherHeroes(
  wallet: string,
  heroId: string,
  itemIds: string[],
): Promise<void> {
  if (itemIds.length === 0) return;
  const list = sqlStr(await accountOf(wallet));
  const ids = itemIds.map(sqlStr).join(",");
  await mcpExec(
    `UPDATE yuplink.hero_instance h
        SET equipped = COALESCE((
              SELECT jsonb_object_agg(e.key, e.value)
                FROM jsonb_each_text(h.equipped::jsonb) e
               WHERE e.value NOT IN (${ids})
            ), '{}'::jsonb),
            updated_at = now()
      WHERE h.account_id IN (${list}) AND h.id <> ${sqlStr(heroId)}
        AND jsonb_typeof(h.equipped::jsonb) = 'object'
        AND EXISTS (
          SELECT 1 FROM jsonb_each_text(h.equipped::jsonb) x WHERE x.value IN (${ids})
        );`,
  );
}

export const equipBestGear = createServerFn({ method: "POST" }).handler(
  async (): Promise<BestGearApplied> => {
    const wallet = requireWallet();
    if (!(await heroPowerEnabled(wallet))) throw new Error("Снаряжение героя пока недоступно");
    const hero = await loadSelectedHero(wallet);
    if (!hero) throw new Error("Сначала выбери основного героя");

    // Конь (§8.84) статов не даёт: «лучшее» его не выбирает и не снимает.
    const slots = heroSlots(normalizeHeroRarity(hero.rarity)).filter((d) => d.slot !== MOUNT_SLOT);
    // Надетое добавляем к инвентарю руками: у коллекционера список артефактов
    // упирается в лимит, и надетый предмет мог бы в него не попасть — тогда
    // «лучший набор» снял бы его как несуществующий.
    // Выключенные поломкой (artDisabled) ничего не дают — в лучший набор не
    // кандидаты. Сломанный при запущенной механике (§8.63 п.3) надеть нельзя —
    // просто пропускаем; надетый сломанный «лучшее» снимет. Механика не
    // запущена — сломанный кандидат, как целый.
    const brokenOn = await artBrokenOn(wallet);
    const ok = (p: LoadedGearPiece) => !artDisabled(p.wear) && !artLocked(p.wear, brokenOn);
    const owned = (await loadOwnedArtifacts(wallet)).filter(ok);
    const items: BestGearItem[] = [...owned, ...hero.gear.filter(ok)];
    const byId = new Map(items.map((p) => [p.itemId, p]));
    const best = bestGearFor({
      slots,
      items,
      equipped: hero.equipped,
      ctx: { race: hero.race, spec: hero.spec },
    });

    // Характеристики считаем канонической формулой — той же, что кормит бой.
    const wear = (m: Record<string, string>): GearPiece[] =>
      slots.map((d) => byId.get(m[d.key] ?? "")).filter((p): p is BestGearItem => !!p);
    const { race, spec, level, rarity, skills, achBonus } = hero;
    const statsOf = (gear: GearPiece[]): HeroStats =>
      effectiveHeroStats({ race, spec, level, rarity, skills, gear, achBonus }).stats;
    const before = statsOf(wear(hero.equipped));

    if (best.changed === 0) {
      return { ok: true as const, changed: 0, before, after: before, gain: 0 };
    }

    // Экземпляры на других героях — на свободные копии, если они есть
    // (владелец 29.09); статы те же: копия того же шаблона.
    const equip = await preferFreeCopies(await accountOf(wallet), hero.heroId, best.equip);
    if (hero.equipped[MOUNT_SLOT]) equip[MOUNT_SLOT] = hero.equipped[MOUNT_SLOT];
    await unequipFromOtherHeroes(wallet, hero.heroId, Object.values(equip)).catch((e) =>
      console.warn("[hero-gear-best] unequip from other heroes failed:", e),
    );
    await writeEquipped(hero.heroId, equip);
    invalidateHeroPower(wallet);
    return {
      ok: true as const,
      changed: best.changed,
      before,
      after: statsOf(wear(equip)),
      gain: best.gain,
    };
  },
);
