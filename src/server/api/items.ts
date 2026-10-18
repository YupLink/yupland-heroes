// ───────────────────────── Артефакты и герои ─────────────────────────
// Определения создаются в конструкторе (админка), хранятся в
// mystic_item_template. Экземпляры у игрока — user_game_item (инвентарь).
// Временная схема — потом переделаем под артефакты (запрос владельца).
// Как приз выдаются из мистик-бокса / рейда / локации (интеграция отдельно).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import type { PgMysticItemTemplate, PgUserGameItem } from "../db/pg";
import { getCurrentWallet, isAdminWallet } from "../auth";
import { accountOf } from "./user";
import { readOwnedById } from "./user-shared";
import { dropFleeCache } from "./beta-raid/flee-cells";
import { assertHeroAbility, assertHeroRaceSpec } from "./items-hero-guard";
import { templateOnMaps, templateOnMapsError } from "./beta-raid/template-on-map";
import { keepDecorInteract } from "./items-meta";

// Пакетная выдача живёт отдельным модулем (лимит 250 строк), но импортируется
// отсюда — чтобы админке хватало одного адреса «@/server/api/items».
export { adminGrantItemsBatch } from "./items-grant-batch";

function requireAdmin(): string {
  const wallet = getCurrentWallet();
  if (!wallet || !isAdminWallet(wallet)) throw new Error("Нет доступа");
  return wallet;
}

const imageRef = z
  .string()
  .trim()
  .refine((v) => v.startsWith("/") || /^https?:\/\//.test(v), {
    message: "Ожидается путь /uploads/... или http(s)-ссылка",
  });

const ARTIFACT_RARITY = ["common", "rare", "epic", "legendary"] as const;

// Все виды ассетов в системе (mob удалён — используются hero).
export const ASSET_KINDS = [
  "artifact",
  "hero",
  "boss",
  "chest",
  "mine",
  "terrain",
  "road",
  "decoration",
  // Постройка: объект с цепочкой тиров, которые игрок открывает за ресурс.
  "building",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

// ── Конструктор: создать определение ассета ──
export const adminCreateItem = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(ASSET_KINDS),
        name: z.string().min(1).max(150),
        description: z.string().max(2000).optional(),
        // null — «картинки нет»: редактор объекта всегда шлёт поле.
        imageUrl: imageRef.nullable().optional(),
        rarity: z.enum(ARTIFACT_RARITY).optional(),
        level: z.number().min(1).max(9).optional(),
        race: z.string().max(60).optional(),
        specialization: z.string().max(60).optional(),
        land: z.string().max(60).optional(),
        statType: z.string().max(40).optional(),
        statAmount: z.number().optional(),
        raceAmount: z.number().optional(),
        specAmount: z.number().optional(),
        landAmount: z.number().optional(),
        // Бонус к рыбалке, % к базе шанса (владелец, 14.10.2026).
        fishBonusPct: z.number().min(0).max(1000).optional(),
        immunities: z.array(z.string().max(40)).max(20).optional(),
        slot: z.string().max(40).optional(),
        // Доп. поля через meta (HP, атака, урон, yield и т.д.).
        meta: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireAdmin();
    // Герой без расы/спеца — нули на любом уровне (инцидент 15.09, items-hero-guard).
    assertHeroRaceSpec(data.kind, data, "create");
    assertHeroAbility(data.meta);
    const id = `${data.kind}_${nanoid(10)}`;
    const isArt = data.kind === "artifact";
    const isHero = data.kind === "hero" || data.kind === "mob";
    const row: PgMysticItemTemplate = {
      id,
      kind: data.kind,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      image_url: data.imageUrl ?? null,
      rarity: isArt ? (data.rarity ?? "common") : null,
      level: isHero ? (data.level ?? 3) : null,
      race: data.race ?? null,
      specialization: data.specialization ?? null,
      land: data.land ?? null,
      stat_type: isArt ? (data.statType ?? null) : null,
      stat_amount:
        isArt || data.kind === "terrain" || data.kind === "road" ? (data.statAmount ?? null) : null,
      race_amount: isArt ? (data.raceAmount ?? null) : null,
      spec_amount: isArt ? (data.specAmount ?? null) : null,
      land_amount: isArt ? (data.landAmount ?? null) : null,
      fish_bonus_pct: isArt ? (data.fishBonusPct ?? 0) : 0,
      immunities: isArt ? (data.immunities ?? null) : null,
      slot: isArt ? (data.slot ?? null) : null,
      meta: data.meta ?? null,
      active: true,
      created_at: new Date().toISOString(),
      created_by_wallet: wallet,
    };
    await pg.mysticItemTemplates.insert(row);
    // Галочка «убегает» у предмета живёт в meta.flees, а снимок убегающих
    // объектов карты собран по ней (beta-raid/flee-cells). Без сброса свежий
    // флаг ждал бы истечения TTL, и владелец видел бы «механика не работает».
    dropFleeCache();
    return { ok: true, id };
  });

export const adminUpdateItem = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().min(1),
        name: z.string().min(1).max(150).optional(),
        description: z.string().max(2000).nullable().optional(),
        imageUrl: imageRef.nullable().optional(),
        rarity: z.enum(ARTIFACT_RARITY).optional(),
        level: z.number().min(1).max(9).optional(),
        race: z.string().max(60).nullable().optional(),
        specialization: z.string().max(60).nullable().optional(),
        land: z.string().max(60).nullable().optional(),
        statType: z.string().max(40).nullable().optional(),
        statAmount: z.number().nullable().optional(),
        raceAmount: z.number().nullable().optional(),
        specAmount: z.number().nullable().optional(),
        landAmount: z.number().nullable().optional(),
        fishBonusPct: z.number().min(0).max(1000).nullable().optional(),
        immunities: z.array(z.string().max(40)).max(20).nullable().optional(),
        slot: z.string().max(40).nullable().optional(),
        active: z.boolean().optional(),
        // Доп. поля (HP, урон, способности и т.д.) — как в adminCreateItem.
        meta: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    // Kind читаем только когда патч трогает расу/спец: у героя их нельзя ни
    // обнулить, ни подменить строкой вне таблицы (items-hero-guard).
    if (data.race !== undefined || data.specialization !== undefined) {
      const cur = await pg.mysticItemTemplates.findOne({ id: data.id });
      assertHeroRaceSpec(cur?.kind ?? "", data, "update");
    }
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.description !== undefined) patch.description = data.description?.trim() || null;
    if (data.imageUrl !== undefined) patch.image_url = data.imageUrl ?? null;
    if (data.rarity !== undefined) patch.rarity = data.rarity;
    if (data.level !== undefined) patch.level = data.level;
    if (data.race !== undefined) patch.race = data.race ?? null;
    if (data.specialization !== undefined) patch.specialization = data.specialization ?? null;
    if (data.land !== undefined) patch.land = data.land ?? null;
    if (data.statType !== undefined) patch.stat_type = data.statType ?? null;
    if (data.statAmount !== undefined) patch.stat_amount = data.statAmount ?? null;
    if (data.raceAmount !== undefined) patch.race_amount = data.raceAmount ?? null;
    if (data.specAmount !== undefined) patch.spec_amount = data.specAmount ?? null;
    if (data.landAmount !== undefined) patch.land_amount = data.landAmount ?? null;
    if (data.fishBonusPct !== undefined) patch.fish_bonus_pct = data.fishBonusPct ?? 0;
    if (data.immunities !== undefined) patch.immunities = data.immunities ?? null;
    if (data.slot !== undefined) patch.slot = data.slot ?? null;
    if (data.active !== undefined) patch.active = data.active;
    // Клиент шлёт meta целиком; взаимодействие декора — из базы (items-meta.ts).
    if (data.meta !== undefined) {
      assertHeroAbility(data.meta);
      // USDT в награде шаблона — обещание каждого живого его объекта (§8.49а).
      await (await import("./usdt-templates")).assertItemMetaUsdt(data.id, data.meta);
      patch.meta = await keepDecorInteract(data.id, data.meta);
    }
    await pg.mysticItemTemplates.raw().update(patch).eq("id", data.id);
    // meta.flees могли включить или снять — снимок убегающих больше не годится.
    dropFleeCache();
    // Имя постройки/декора/дороги хранится в mapBase.buildings/... — без сброса
    // клиент, только что вызвавший adminUpdateItem, увидит НОВОЕ имя в палитре,
    // но карта продолжит подписывать клетки старым (жалоба «переименовал —
    // тост есть, а на карте старое имя, помогает только F5»). purge, а не
    // stale: тот же администратор сразу перечитает карту, и на протухшем
    // снапшоте имя откатилось бы.
    if (patch.name !== undefined || patch.image_url !== undefined) {
      // Через журнал активной карты: у игроков словари живут в снимке с
      // версией, и без сдвига версии новое имя/картинка не доехали бы до
      // перекачки. Сброс основы делает сам recordMapChange.
      const { noteLiveMapsRebuilt } = await import("./beta-raid/map-change-hooks");
      await noteLiveMapsRebuilt();
      const { publishRaid } = await import("../raidLive");
      publishRaid({ mapId: null, type: "restored" });
    }
    return { ok: true };
  });

// Удалить определение вместе с выданными экземплярами (FK RESTRICT → сначала
// чистим user_game_item). Полное удаление (не soft) — по запросу владельца.
export const adminDeleteItem = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    // Шаблон на карте не удаляем: клетки ссылаются на него без внешнего
    // ключа, и после удаления оставалась мёртвая ссылка — зелёная точка-стена
    // без имени («две мёртвые клетки», 20.09). См. beta-raid/template-on-map.
    const usage = await templateOnMaps(data.id);
    if (usage.total > 0) throw new Error(templateOnMapsError(usage));
    // Ответы raw()-запросов раньше не смотрели вовсе: любая неудача (запрет
    // на уровне базы, внешний ключ, чужой id) проглатывалась, и клиент всё
    // равно показывал «Удалено», хотя шаблон оставался на месте.
    const items = await pg.userGameItems.raw().delete().eq("template_id", data.id);
    if (items.error) throw new Error(`Выданные экземпляры не удалились: ${items.error.message}`);
    const tpl = await pg.mysticItemTemplates.raw().delete().eq("id", data.id).select("id");
    if (tpl.error) throw new Error(`Шаблон не удалён: ${tpl.error.message}`);
    const removed = Array.isArray(tpl.data) ? tpl.data.length : 0;
    if (removed === 0) throw new Error("Шаблон не найден — возможно, его уже удалили");
    return { ok: true, removed };
  });

// Список определений (конструктор, выбор приза). Потолок 5000, не 200: 05.10 артефактов 208.
export const adminListItems = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(ASSET_KINDS).optional(),
        limit: z.number().int().min(1).max(5000).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    let q = pg.mysticItemTemplates.raw().select("*");
    if (data.kind) q = q.eq("kind", data.kind);
    q = q.limit(data.limit ?? 5000);
    const { data: rows } = await q.order("created_at", { ascending: true });
    return ((rows ?? []) as PgMysticItemTemplate[]).map((r) => ({
      id: r.id,
      kind: r.kind,
      name: r.name,
      description: r.description,
      imageUrl: r.image_url,
      rarity: r.rarity,
      level: r.level,
      race: r.race,
      specialization: r.specialization,
      land: r.land,
      statType: r.stat_type,
      statAmount: r.stat_amount,
      raceAmount: r.race_amount,
      specAmount: r.spec_amount,
      landAmount: (r as unknown as { land_amount?: number | null }).land_amount ?? null,
      fishBonusPct: Number(r.fish_bonus_pct) || 0,
      immunities: (r.immunities as string[] | null) ?? [],
      slot: r.slot,
      active: r.active,
      meta: r.meta,
    }));
  });

// Выдать предмет игроку — ПОДАРКОМ (тест/ручная выдача).
//
// Прямая запись в инвентарь ушла: админское добро приходит подарком, игрок
// видит его в кружке на карте и забирает сам. Так у выдачи есть адресат,
// объяснение и подтверждение получения (см. gifts.ts).
export const adminGrantItem = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ templateId: z.string().min(1), wallet: z.string().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const admin = requireAdmin();
    const tpl = await pg.mysticItemTemplates
      .raw()
      .select("*")
      .eq("id", data.templateId)
      .maybeSingle();
    const t = tpl.data as PgMysticItemTemplate | null;
    if (!t) throw new Error("Предмет не найден");
    const target = data.wallet?.trim() || admin;
    const account = await accountOf(target);
    const { createGift } = await import("./gifts-create");
    const giftId = `admin-item:${t.id}:${account}:${nanoid(8)}`;
    await createGift({
      accountId: account,
      kind: t.kind === "hero" ? "hero" : t.kind === "artifact" ? "art" : "item",
      amount: 1,
      refId: t.id,
      title: t.name,
      image: t.image_url ?? null,
      sourceRef: giftId,
      createdBy: admin,
    });
    return { ok: true, id: giftId };
  });

// Инвентарь предметов аккаунта — владелец один, перебирать адреса больше не
// нужно. Отдаёт данные для
// «квадратных» карточек (как фишки): имя, картинка, редкость/уровень.
export const listMyItems = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return [];
  const account = await accountOf(wallet);
  // Объединение (account_id ИЛИ коши-сёстры, дедуп) — вещи остаются при аккаунте
  // после детача коша; твинки без учётки ловятся по кошельку.
  const items = (
    await readOwnedById<PgUserGameItem>(wallet, () => pg.userGameItems.raw().select("*"))
  ).sort((a, b) => (b.obtained_at ?? "").localeCompare(a.obtained_at ?? ""));
  if (items.length === 0) return [];
  const tplIds = Array.from(new Set(items.map((i) => i.template_id)));
  const { data: tplRows } = await pg.mysticItemTemplates.raw().select("*").in("id", tplIds);
  const tplById = new Map(((tplRows ?? []) as PgMysticItemTemplate[]).map((t) => [t.id, t]));

  // Уровни прокачки героев: у одного шаблона может быть несколько экземпляров
  // с разными уровнями (один прокачали, остальные нет) — раздаём их по порядку.
  const heroLevels = new Map<string, number[]>();
  {
    const { data: hi } = await pg.heroInstances
      .raw()
      .select("template_id,level")
      .eq("account_id", account);
    for (const h of (hi ?? []) as Array<{ template_id: string; level: number }>) {
      const arr = heroLevels.get(h.template_id) ?? [];
      arr.push(Number(h.level) || 0);
      heroLevels.set(h.template_id, arr);
    }
    for (const arr of heroLevels.values()) arr.sort((a, b) => b - a);
  }
  const taken = new Map<string, number>();

  return items.map((i) => {
    const t = tplById.get(i.template_id);
    return {
      id: i.id,
      kind: i.kind as "artifact" | "hero",
      name: t?.name ?? "Предмет",
      description: t?.description ?? null,
      imageUrl: t?.image_url ?? null,
      rarity: t?.rarity ?? null,
      level: t?.level ?? null,
      // Уровень прокачки: по нему инвентарь стакает героев отдельными пачками.
      heroLevel:
        i.kind === "hero"
          ? (() => {
              const arr = heroLevels.get(i.template_id);
              if (!arr || arr.length === 0) return 0;
              const idx = taken.get(i.template_id) ?? 0;
              taken.set(i.template_id, idx + 1);
              // Прокачанных экземпляров меньше, чем героев на руках, — значит
              // остальные не прокачаны. Раньше тут повторялся последний
              // уровень, и два героя 9 и 0 слипались в одну пачку «9 lvl ×2».
              return idx < arr.length ? arr[idx] : 0;
            })()
          : null,
      race: t?.race ?? null,
      specialization: t?.specialization ?? null,
      land: t?.land ?? null,
      statType: t?.stat_type ?? null,
      statAmount: t?.stat_amount ?? null,
      raceAmount: t?.race_amount ?? null,
      specAmount: t?.spec_amount ?? null,
      landAmount: (t as unknown as { land_amount?: number | null } | null)?.land_amount ?? null,
      fishBonusPct: Number(t?.fish_bonus_pct) || 0,
      immunities: (t?.immunities as string[] | null) ?? [],
      slot: t?.slot ?? null,
      templateId: i.template_id,
      obtainedAt: i.obtained_at,
    };
  });
});
