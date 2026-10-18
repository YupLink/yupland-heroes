// Артефакты на герое: что надето, надеть, снять.
//
// Три правила, из которых следует всё остальное:
//   • режим за флагом hero_power — массовому игроку окна экипировки нет;
//   • переодеться можно ГДЕ УГОДНО (владелец, 27.08): замок остался местом,
//     где героя МЕНЯЮТ, а одежда и уровень теперь и в окне героя на карте;
//   • ТИП слота берётся из шаблона артефакта, а не с клиента — иначе кольцо
//     уехало бы в слот тела. С клиента приходит только НОМЕР места.
//
// Хранилище — hero_instance.equipped ({"Место": "id_предмета"}), своей таблицы
// под слоты нет: пока режим в закрытом тесте, миграция стоила бы дороже
// механики. Мест у героя от 8 до 14 по редкости — раскладку считает
// @/lib/hero/heroSlots, первое место каждого типа держит СТАРЫЙ ключ. Расовую и профессиональную прибавки считает explainGear внутри
// buildHeroPower — здесь ничего из этого не дублируется, а чтение инвентаря и
// сборка ответа живут в heroes-gear-read.ts (файл на 250 строк не резиновый).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../db/mcpClient";
import { requireWallet } from "../auth";
import { sqlStr } from "./raid-shared";
import { accountOf } from "./user-shared";
import { heroPowerEnabled, invalidateHeroPower } from "./beta-raid/hero-power";
import { loadSelectedHero, loadOwnedHero, type LoadedHero } from "./beta-raid/hero-load";
import { preferFreeCopies } from "./heroes-gear-copies";
import {
  emptyGear,
  gearView,
  loadOwnedArtifacts,
  ownedArtifact,
  writeEquipped,
  type HeroGearView,
} from "./heroes-gear-read";
import {
  firstFreeSlotKey,
  heroSlots,
  isKnownSlotType,
  parseHeroSlotKey,
} from "@/lib/hero/heroSlots";

// Форма ответа — там же, где она собирается. Реэкспорт типов, чтобы клиент
// импортировал экран экипировки из одного модуля, как и раньше.
export type { GearBlocked, GearItemView, GearSlotView, HeroGearView } from "./heroes-gear-read";
export type { GearPart, GearPartKind, GearPartReason } from "@/lib/hero/heroStatSources";

/**
 * Свежий вид снаряжения выбранного героя: слоты И статы из ОДНОГО equipped.
 *
 * Общий и для чтения (getMyHeroGear), и для мутаций одежды: после переодевания
 * они возвращают этот же ответ, чтобы клиент положил его в кэш ["my-hero-gear"]
 * и показал новые характеристики В ТОТ ЖЕ КАДР — не дожидаясь сетевого рефетча
 * (правило «изменил → видно сразу, без F5»: смена комплекта меняла слоты сразу,
 * а числа отставали на рефетч).
 */
export async function loadMyHeroGear(wallet: string): Promise<HeroGearView> {
  if (!(await heroPowerEnabled(wallet))) return emptyGear();
  const hero = await loadSelectedHero(wallet).catch(() => null);
  if (!hero) return emptyGear();
  // Инвентарь тянем ВСЕГДА вместе с героем: список «что можно надеть» с
  // разбором под этого героя считает сервер, у клиента для этого нет ни
  // расы героя, ни таблицы статов.
  const { loadWeakenFor } = await import("./beta-raid/hero-weaken");
  // Временные бусты — тем же рейсом: карточка героя обязана показывать те же
  // числа, с которыми он идёт в бой.
  const { loadBuffsFor } = await import("./beta-raid/hero-buff");
  const [artifacts, weaken, buffs] = await Promise.all([
    loadOwnedArtifacts(wallet),
    loadWeakenFor(wallet),
    loadBuffsFor(wallet),
  ]);
  return gearView(hero, artifacts, weaken, buffs);
}

export const getMyHeroGear = createServerFn({ method: "GET" }).handler(
  async (): Promise<HeroGearView> => loadMyHeroGear(requireWallet()),
);

/** Read a specific owned hero without changing the active hero. */
export const getOwnedHeroGear = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ heroId: z.string().trim().min(1) }).parse(d))
  .handler(async ({ data }): Promise<HeroGearView> => {
    const wallet = requireWallet();
    if (!(await heroPowerEnabled(wallet))) throw new Error("Hero gear unavailable");
    const hero = await loadOwnedHero(wallet, data.heroId);
    const { loadWeakenFor } = await import("./beta-raid/hero-weaken");
    const { loadBuffsFor } = await import("./beta-raid/hero-buff");
    const [all, weaken, buffs] = await Promise.all([
      loadOwnedArtifacts(wallet),
      loadWeakenFor(wallet),
      loadBuffsFor(wallet),
    ]);
    return gearView(hero, all, weaken, buffs);
  });

/**
 * Общая проверка обеих правок: флаг и выбранный герой.
 *
 * Замок больше НЕ обязателен: владелец потребовал менять одежду и уровень в
 * пути, и окно героя на карте открывает ту же вкладку. Смена САМОГО героя и
 * отряда по-прежнему живёт в замке (heroes-select/heroes-squad) — там своя
 * requireAtCastle.
 */
async function requireGearEdit(wallet: string): Promise<LoadedHero> {
  if (!(await heroPowerEnabled(wallet))) throw new Error("Снаряжение героя пока недоступно");
  const hero = await loadSelectedHero(wallet);
  if (!hero) throw new Error("Сначала выбери основного героя");
  return hero;
}

/**
 * Места без указанного предмета: один экземпляр не лежит в двух местах.
 *
 * Отбор идёт по ТИПУ слота, а не по списку мест этого героя: предмет, лежащий
 * в «лишнем» месте (редкость почему-то ниже нужной), обязан остаться лежать —
 * терять надетое нельзя.
 */
function without(equipped: Record<string, string>, drop: (key: string, id: string) => boolean) {
  const out: Record<string, string> = {};
  for (const [key, id] of Object.entries(equipped)) {
    if (isKnownSlotType(parseHeroSlotKey(key).slot) && !drop(key, id)) out[key] = id;
  }
  return out;
}

/**
 * Куда класть предмет. Клиент называет КОНКРЕТНОЕ место («Карманы#3») —
 * проверяем, что оно у героя есть и что тип совпал с типом предмета. Места не
 * назвали (старый клиент) — берём первое свободное подходящего типа.
 */
function pickSlotKey(
  rarity: string,
  slot: string,
  equipped: Record<string, string>,
  want: string | undefined,
): string {
  if (want) {
    const def = heroSlots(rarity).find((d) => d.key === want.trim());
    if (!def || def.slot !== slot) throw new Error("braid.gear_no_slot_equip");
    return def.key;
  }
  const key = firstFreeSlotKey(rarity, slot, equipped);
  if (!key) throw new Error("braid.gear_no_slot_equip");
  return key;
}

/**
 * Снять предмет со ВСЕХ остальных героев аккаунта.
 *
 * equipped лежит на каждом герое отдельно, поэтому надевашка на нового героя
 * оставляла запись висеть на прежнем: один экземпляр числился надетым сразу у
 * двоих. Сегодня в бой выходит только выбранный герой, и двойного бонуса это
 * не давало, — но экран экипировки уже показывал предмет там, где его нет, а
 * второй герой в строю сделал бы из этого дупликацию статов.
 *
 * Сбой чистки бой не ломает: висячая запись — это ровно то, как было раньше,
 * поэтому ошибку только пишем в лог, а надевание доводим до конца.
 */
async function unequipFromOtherHeroes(
  wallet: string,
  heroId: string,
  itemId: string,
): Promise<void> {
  const list = sqlStr(await accountOf(wallet));
  await mcpExec(
    `UPDATE yuplink.hero_instance h
        SET equipped = COALESCE((
              SELECT jsonb_object_agg(e.key, e.value)
                FROM jsonb_each_text(h.equipped::jsonb) e
               WHERE e.value <> ${sqlStr(itemId)}
            ), '{}'::jsonb),
            updated_at = now()
      WHERE h.account_id IN (${list}) AND h.id <> ${sqlStr(heroId)}
        AND jsonb_typeof(h.equipped::jsonb) = 'object'
        AND EXISTS (
          SELECT 1 FROM jsonb_each_text(h.equipped::jsonb) x WHERE x.value = ${sqlStr(itemId)}
        );`,
  );
}

export const equipArtifact = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ itemId: z.string().min(1), slotKey: z.string().min(1).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const hero = await requireGearEdit(wallet);

    const art = await ownedArtifact(wallet, data.itemId);
    if (!art) throw new Error("Это не твой артефакт");
    const slot = (art.slot ?? "").trim();
    // Ключ, а не готовая фраза: серверный текст доезжает до тоста как есть, и
    // англоязычный игрок читал русское предложение. Имя предмета через ключ не
    // передаётся — фраза в словаре обходится без него.
    if (!slot || !isKnownSlotType(slot)) throw new Error("braid.gear_no_slot_equip");

    // Перенос кольца с правой руки на левую не должен удваивать бонус,
    // поэтому предмет сначала выкидывается из всех мест — и у этого героя,
    // и у остальных героев аккаунта. Свободное место ищем уже в очищенном
    // наборе, иначе предмет «занимал» бы сам себя.
    const draft = without(hero.equipped, (_k, id) => id === data.itemId);
    const slotKey = pickSlotKey(hero.rarity, slot, draft, data.slotKey);
    const replaced = draft[slotKey] ?? null;
    draft[slotKey] = data.itemId;
    // Экземпляр на другом герое — меняем на свободную копию, если она есть
    // (владелец 29.09): снимать с другого героя — только когда копий нет.
    const next = await preferFreeCopies(await accountOf(wallet), hero.heroId, draft);
    const itemId = next[slotKey] ?? data.itemId;

    await unequipFromOtherHeroes(wallet, hero.heroId, itemId).catch((e) =>
      console.warn("[hero-gear] unequip from other heroes failed:", e),
    );
    await writeEquipped(hero.heroId, next);
    invalidateHeroPower(wallet);
    // Иммунитет надетой вещи закрывает НОВЫЕ наложения (encounter-hero-apply);
    // уже висящий дебафф не снимается — правило владельца 21.09.
    return { ok: true as const, slot, slotKey, itemId, replaced };
  });

export const unequipArtifact = createServerFn({ method: "POST" })
  // slot — legacy-имя того же поля: старый клиент из открытой вкладки шлёт
  // его, и во время выката снятие не должно падать валидатором.
  .inputValidator((d: unknown) =>
    z
      .object({ slotKey: z.string().min(1).optional(), slot: z.string().min(1).optional() })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const hero = await requireGearEdit(wallet);
    const slotKey = (data.slotKey ?? data.slot ?? "").trim();
    if (!slotKey || !isKnownSlotType(parseHeroSlotKey(slotKey).slot)) {
      throw new Error("Нет такого слота");
    }

    const removed = hero.equipped[slotKey] ?? null;
    if (!removed) return { ok: true as const, slotKey, itemId: null };
    await writeEquipped(
      hero.heroId,
      without(hero.equipped, (k) => k === slotKey),
    );
    invalidateHeroPower(wallet);
    return { ok: true as const, slotKey, itemId: removed };
  });
