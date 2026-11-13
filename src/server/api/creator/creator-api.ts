// Ручки креатора для строки профиля «Шаблоны поселений» (владелец, 07.11.2026).
//
// Право — admin_rights «creator» (админ игры — тоже, и видит все работы).
// Креатору видны только свои работы и те, что открыл ему другой креатор;
// делиться и закрывать доступ может только владелец работы. Выйти из работ —
// всегда, если стоит в работе (право сняли, пока он там, — не застрянет).
//
// Серверные модули грузятся внутри ручек: этот файл импортирует клиент.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBetaRaid } from "../beta-raid/gate";
import {
  CREATOR_NAME_MAX,
  canEditWork,
  cleanWorkName,
  defaultWorldName,
} from "@/lib/raid/creator/ids";

type Me = { wallet: string; account: string; admin: boolean; creator: boolean };

async function who(): Promise<Me> {
  const wallet = await requireBetaRaid();
  const { raidOwner } = await import("../beta-raid/owner");
  const { isAdminWallet } = await import("@/server/auth");
  const { accountHasRight } = await import("@/server/admin-rights");
  const account = await raidOwner(wallet);
  return {
    wallet,
    account,
    admin: isAdminWallet(wallet),
    creator: await accountHasRight(account, "creator"),
  };
}

async function requireCreator(): Promise<Me> {
  const me = await who();
  if (!me.admin && !me.creator) throw new Error("Доступ запрещён");
  return me;
}

const mapIdIn = z.object({ mapId: z.string().min(8).max(64) });
const nameIn = z
  .string()
  .min(1)
  .max(CREATOR_NAME_MAX * 2);

function nameOf(raw: string): string {
  const name = cleanWorkName(raw);
  if (!name) throw new Error("creator.bad_name");
  return name;
}

/** Видна ли строка в профиле и стоит ли сейчас в работе. Без права — «нет». */
export const getCreatorAccess = createServerFn({ method: "GET" }).handler(async () => {
  const me = await who().catch(() => null);
  if (!me) return { allowed: false, onWork: false };
  const { onCreatorWork } = await import("./creator-move");
  const onWork = await onCreatorWork(me.account);
  return { allowed: onWork || me.admin || me.creator, onWork };
});

/** Мои работы и общие (админу — все), свежие сверху. */
export const listCreatorWorks = createServerFn({ method: "GET" }).handler(async () => {
  const me = await requireCreator();
  const { listWorks } = await import("./creator-store");
  return listWorks(me.account, me.admin);
});

/** Другие креаторы — кому можно открыть работу. */
export const listCreatorPeers = createServerFn({ method: "GET" }).handler(async () => {
  const me = await requireCreator();
  const { listPeers } = await import("./creator-store");
  return listPeers(me.account);
});

/**
 * Вход в мир креатора (владелец, 07.11.2026: «сначала создать мир — и уже в нём
 * загрузить шаблоны, создать новый мир, назвать»): свой мир, где был последним;
 * своих нет — новый голый «Мир 1». Дальше всё — панелью мира на карте.
 */
export const enterCreatorWorld = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ lang: z.enum(["ru", "en"]) }).parse(d))
  .handler(async ({ data }) => {
    const me = await requireCreator();
    const { createWork, lastOwnWork, loadWork, ownCount } = await import("./creator-store");
    const last = await lastOwnWork(me.account);
    const work = last
      ? await loadWork(last, me.account, me.admin)
      : await createWork(me.account, defaultWorldName(await ownCount(me.account), data.lang));
    if (!work) throw new Error("creator.not_yours");
    const { enterWork } = await import("./creator-move");
    return enterWork(me.wallet, me.account, work);
  });

/** Новая работа: голая карта — и сразу туда. */
export const createCreatorWork = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ name: nameIn }).parse(d))
  .handler(async ({ data }) => {
    const me = await requireCreator();
    const { createWork } = await import("./creator-store");
    const work = await createWork(me.account, nameOf(data.name));
    const { enterWork } = await import("./creator-move");
    return enterWork(me.wallet, me.account, work);
  });

/** Открыть работу: перейти в неё. */
export const openCreatorWork = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => mapIdIn.parse(d))
  .handler(async ({ data }) => {
    const me = await requireCreator();
    const { loadWork } = await import("./creator-store");
    const work = await loadWork(data.mapId, me.account, me.admin);
    if (!work) throw new Error("creator.not_yours");
    const { enterWork } = await import("./creator-move");
    return enterWork(me.wallet, me.account, work);
  });

/** Переименовать: автор и те, кому мир открыт на редакцию (и админ). */
export const renameCreatorWork = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => mapIdIn.extend({ name: nameIn }).parse(d))
  .handler(async ({ data }) => {
    const me = await requireCreator();
    const { loadWork, renameWork } = await import("./creator-store");
    const work = await loadWork(data.mapId, me.account, me.admin);
    if (!work) throw new Error("creator.not_yours");
    if (!canEditWork(work, me.admin)) throw new Error("creator.view_only_err");
    await renameWork(data.mapId, nameOf(data.name));
    return { ok: true };
  });

/**
 * Открыть мир другому креатору с ролью (view — только смотреть, edit — править
 * вместе), сменить роль или закрыть доступ (role: null) — только автор и админ.
 */
export const shareCreatorWork = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    mapIdIn
      .extend({ account: z.string().min(4).max(64), role: z.enum(["view", "edit"]).nullable() })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const me = await requireCreator();
    const { listPeers, loadWork, setShare } = await import("./creator-store");
    const work = await loadWork(data.mapId, me.account, me.admin);
    if (!work || (work.owner !== me.account && !me.admin)) throw new Error("creator.not_owner");
    // Открыть — только креатору; закрыть — кому угодно из открытых (право могли снять).
    if (data.role && !(await listPeers(work.owner)).some((p) => p.account === data.account)) {
      throw new Error("creator.not_creator");
    }
    await setShare(data.mapId, data.account, data.role);
    return { ok: true };
  });

/** «Очистить всё»: все клетки мира пустые — владелец мира и админ. */
export const clearCreatorWork = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => mapIdIn.parse(d))
  .handler(async ({ data }) => {
    const me = await requireCreator();
    const { loadWork } = await import("./creator-store");
    const work = await loadWork(data.mapId, me.account, me.admin);
    if (!work || (work.owner !== me.account && !me.admin))
      throw new Error("creator.not_owner_clear");
    const { clearWork } = await import("./creator-clear");
    await clearWork(work.mapId);
    return { ok: true };
  });

/**
 * Расширить рамку мира (64 → 128 → 256 → 512): только больше, созданное не
 * трогается; автор и админ (владелец: «доступ к миру только у креатора»).
 */
export const expandCreatorWork = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    mapIdIn.extend({ size: z.union([z.literal(128), z.literal(256), z.literal(512)]) }).parse(d),
  )
  .handler(async ({ data }) => {
    const me = await requireCreator();
    const { loadWork } = await import("./creator-store");
    const work = await loadWork(data.mapId, me.account, me.admin);
    if (!work || (work.owner !== me.account && !me.admin))
      throw new Error("creator.not_owner_grow");
    const { expandWork } = await import("./creator-world");
    const added = await expandWork(work.mapId, work.size, data.size);
    return { ok: true, size: data.size, added };
  });

/** Копия любого видного мне мира (и открытого только на просмотр) — в мой новый, сразу туда. */
export const copyCreatorWork = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => mapIdIn.extend({ lang: z.enum(["ru", "en"]) }).parse(d))
  .handler(async ({ data }) => {
    const me = await requireCreator();
    const { loadWork } = await import("./creator-store");
    const from = await loadWork(data.mapId, me.account, me.admin);
    if (!from) throw new Error("creator.not_yours");
    const { copyWork } = await import("./creator-world");
    const work = await copyWork(me.account, from, data.lang);
    const { enterWork } = await import("./creator-move");
    return enterWork(me.wallet, me.account, work);
  });

/** Выйти из работ — туда, откуда пришёл. */
export const leaveCreatorWork = createServerFn({ method: "POST" }).handler(async () => {
  const me = await who();
  const { leaveWorks } = await import("./creator-move");
  return { moved: await leaveWorks(me.wallet, me.account) };
});
