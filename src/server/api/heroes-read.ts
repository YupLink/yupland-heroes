// Герои: чтение — список своих героев и карточка героя из инвентаря.
import { heroAbilityOf } from "@/lib/hero/heroAbilities";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { readOwnedById, accountOf } from "./user-shared";
import {
  convertRuleForChipLevel,
  nextLevelCost,
  skillPointsAt,
  MAX_LEVEL_BY_RARITY,
  type HeroRarity,
} from "@/lib/heroLevels";
import {
  requireHeroLevelUp,
  createHeroAtomic,
  levelUpHeroAtomic,
  type HeroRow,
} from "./heroes-shared";
import { activeRest, requireHeroAwake } from "./hero-rest";
import { heroCardStats, heroSkillCard } from "./heroes-skill-card";
import { rarityOfTemplateLevel } from "./heroes-list-dormant";

// Карточка героя из инвентаря живёт в heroes-card.ts; здесь — список и прокачка.
export { heroCardForTemplate } from "./heroes-card";

/** Мои герои со счётом характеристик на текущем уровне. */
export const listMyHeroes = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return [];
  const account = await accountOf(wallet);
  // Владелец героя — аккаунт: смена или отвязка кошелька его не двигает.
  const rows = await readOwnedById<HeroRow>(wallet, () => pg.heroInstances.raw().select("*"));
  rows.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

  const tplIds = Array.from(new Set(rows.map((r) => r.template_id)));
  const { data: tplRows } = tplIds.length
    ? await pg.mysticItemTemplates.raw().select("*").in("id", tplIds)
    : { data: [] };
  const tplById = new Map(
    (
      (tplRows ?? []) as Array<{
        id: string;
        name: string;
        image_url: string | null;
        race: string | null;
        specialization: string | null;
        description: string | null;
        meta: unknown;
      }>
    ).map((t) => [t.id, t]),
  );

  // К экземплярам добавляем «спящих» — героев, которые лежат предметом, но
  // экземпляра ещё не завели. Иначе половина коллекции невидима (жалоба
  // владельца: 38 героев в инвентаре, 12 на экране).
  const { listDormantHeroes } = await import("./heroes-list-dormant");
  const dormant = await listDormantHeroes(account);

  // Кто сейчас батрачит на грядке: такого героя нельзя ставить основным, и
  // раньше это выяснялось только отказом сервера — в списке он выглядел
  // обычным (жалоба владельца 10.09.2026).
  const { fieldBusyByHero } = await import("./beta-raid/field-busy");
  const busy = await fieldBusyByHero(account).catch(() => new Map<string, string>());

  const owned = rows.map((r) => {
    const t = tplById.get(r.template_id);
    const rarity = r.rarity as HeroRarity;
    const sk = heroSkillCard(rarity, r.level, r.skills);
    return {
      id: r.id,
      /** Копия предмета, к которой привязан экземпляр (может отсутствовать). */
      itemId: r.item_id ?? null,
      templateId: r.template_id,
      name: t?.name ?? "Герой",
      imageUrl: t?.image_url ?? null,
      race: t?.race ?? null,
      specialization: t?.specialization ?? null,
      /** Способность героя (§8.52); нет — null. */
      ability: heroAbilityOf(t?.meta),
      rarity,
      level: r.level,
      maxLevel: MAX_LEVEL_BY_RARITY[rarity] ?? 20,
      nextCost: nextLevelCost(rarity, r.level),
      likesSpent: Number(r.likes_spent),
      equipped: r.equipped ?? {},
      // Повышенные уровни: статы — на обычном потолке плюс вложенные очки.
      stats: heroCardStats(t?.race ?? null, t?.specialization ?? null, rarity, r.level, sk.skills),
      ...sk,
      copies: 1,
      /** «q,r» грядки, где герой работает. null — свободен. */
      busyField: busy.get(r.id) ?? null,
      /** До какого момента отдыхает (ISO). null — не отдыхает. */
      restUntil: activeRest(r.rest_until),
    };
  });
  // Сначала те, кого уже подняли, потом спящие: у поднятых есть уровень и
  // экипировка, их и выбирают чаще.
  // Спящий батрачить не может: постановка на грядку сама будит героя.
  return [
    ...owned,
    ...dormant.map((d) => ({
      ...d,
      busyField: null as string | null,
      restUntil: null as string | null,
    })),
  ];
});

export const levelUpHeroTemplate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        templateId: z.string().min(1),
        /** Копия предмета: у игрока их бывает несколько, и качать надо ту. */
        itemId: z.string().min(1).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = await requireHeroLevelUp();
    const account = await accountOf(wallet);

    const tpl = (await pg.mysticItemTemplates.findOne({ id: data.templateId })) as {
      race?: string | null;
      specialization?: string | null;
      level?: number | null;
    } | null;
    if (!tpl) throw new Error("Шаблон героя не найден");

    // Ищем экземпляр ЭТОЙ копии. Без itemId (старый клиент) — прежнее
    // поведение: самый прокачанный экземпляр шаблона.
    const q = pg.heroInstances.raw().select("*").eq("account_id", account);
    const { data: rows } = data.itemId
      ? await q.eq("item_id", data.itemId)
      : await q.eq("template_id", data.templateId).order("level", { ascending: false });
    let inst = ((rows ?? []) as HeroRow[])[0] ?? null;

    // Новый экземпляр — редкость по ярусу шаблона, как у спящего и у пробуждения
    // (rarityOfTemplateLevel): «обычные герои всегда обычные» (владелец, 22.10.2026).
    // Раньше здесь была своя формула без common — первая прокачка спящего 1★
    // записывала ему «rare» (потолок 30, восемь мест под артефакты).
    // У заведённого — записанная: редкость ставится один раз, при создании.
    const rarity: HeroRarity =
      (inst?.rarity as HeroRarity | undefined) ?? rarityOfTemplateLevel(Number(tpl.level));
    const level = inst?.level ?? 0;
    const cost = nextLevelCost(rarity, level);
    if (cost == null) {
      throw new Error(`Достигнут максимум для ${rarity} — ${MAX_LEVEL_BY_RARITY[rarity]} ур.`);
    }

    // Атомарно: лайки списываются, только если герой создан/повышен (и наоборот).
    // Раздельные записи теряли лайки при неудачной записи героя (жалоба SeD 27.08).
    let likesLeft: number;
    let newLevel: number;
    if (!inst) {
      // Героя ещё нет — значит его сейчас СОЗДАДУТ из шаблона. Шаблон приходит
      // с клиента, поэтому владение обязано проверяться здесь: без этого любой
      // чужой templateId давал легендарного героя за цену первого уровня —
      // четырнадцать слотов под артефакты вместо восьми и потолок сорокового
      // уровня вместо двадцатого.
      // Копию берём ту, что прислал клиент; без неё — любую свободную (у
      // которой ещё нет экземпляра), и только потом любую свою.
      // Копия — именно этого шаблона (аудит 11.11.2026): чужой шаблон со своей
      // дешёвой копией давал легендарного героя по цене первого уровня.
      const own = pg.userGameItems
        .raw()
        .select("id")
        .eq("kind", "hero")
        .eq("account_id", account)
        .eq("template_id", data.templateId);
      const { data: ownedRows } = data.itemId
        ? await own.eq("id", data.itemId).limit(1)
        : await own.limit(50);
      const owned = (ownedRows ?? []) as Array<{ id: string }>;
      if (!owned.length) throw new Error("Этого героя у тебя нет");
      let itemId = data.itemId ?? null;
      if (!itemId) {
        const { data: takenRows } = await pg.heroInstances
          .raw()
          .select("item_id")
          .eq("account_id", account);
        const taken = new Set(
          ((takenRows ?? []) as Array<{ item_id: string | null }>)
            .map((x) => x.item_id)
            .filter((x): x is string => !!x),
        );
        itemId = owned.find((o) => !taken.has(o.id))?.id ?? owned[0].id;
      }
      const id = `hero_${nanoid(10)}`;
      const r = await createHeroAtomic({
        wallet,
        heroId: id,
        templateId: data.templateId,
        itemId,
        rarity,
        cost,
      });
      likesLeft = r.likesLeft;
      newLevel = r.newLevel;
      inst = { id, level: 1 } as HeroRow;
    } else {
      // Отдыхающий после снятия с грядки не качается (hero-rest.ts).
      await requireHeroAwake(inst.id);
      const r = await levelUpHeroAtomic(wallet, inst.id, cost, {
        fromLevel: level,
        maxLevel: MAX_LEVEL_BY_RARITY[rarity],
      });
      likesLeft = r.likesLeft;
      newLevel = r.newLevel;
    }
    // Уровень вырос — сбрасываем кэш силы героя (живёт 15 с): иначе бой и цена
    // шага ещё четверть минуты считаются по старым статам, а игрок видит
    // «прокачал, но ничего не изменилось».
    const { invalidateHeroPower } = await import("./beta-raid/hero-power");
    invalidateHeroPower(wallet);
    // Повышенный уровень статов не растит — растут очки навыков.
    const sk = heroSkillCard(rarity, newLevel, inst?.skills);
    return {
      ok: true,
      level: newLevel,
      spentLikes: cost,
      likesLeft,
      stats: heroCardStats(
        tpl.race ?? null,
        tpl.specialization ?? null,
        rarity,
        newLevel,
        sk.skills,
      ),
      nextCost: nextLevelCost(rarity, newLevel),
      // Очков пришло с этой ступени — та же графа, что у levelUpHero.
      skillGain: skillPointsAt(rarity, newLevel) - skillPointsAt(rarity, newLevel - 1),
      ...sk,
    };
  });
