// Ручки облика построек для админки: категории, картинки, вид клетки.
//
// Всё под гардом админа: облик меняет карту, а карта одна на всех.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCurrentWallet, isAdminWallet } from "../../auth";
import { requireDesigner } from "./island/island-editor-auth";
import { godMapId } from "./god-map";
import {
  addGroup,
  addSkins,
  listGroups,
  removeGroup,
  removeSkin,
  setCellSkin,
  updateGroup,
} from "./building-skins";
import { publishRaid } from "../../raidLive";
import { purgeMapBase } from "./map-base";
import { requireCatalogEditor } from "@/server/api/catalog-auth";

/** Облики меняют вид построек на всех этажах — игрокам «карта перестроена». */
async function noteActiveMapRebuilt(): Promise<void> {
  const { noteLiveMapsRebuilt } = await import("./map-change-hooks");
  await noteLiveMapsRebuilt();
}

function requireAdmin(): void {
  const w = getCurrentWallet();
  if (!w || !isAdminWallet(w)) throw new Error("Только админ меняет облики");
}

/** Категории с картинками — окно выбора вида в режиме бога. */
export const getBuildingSkins = createServerFn({ method: "GET" }).handler(async () => {
  // Читать облики — и дизайнеру замка: кисть на его острове новичка.
  await requireDesigner();
  return { groups: await listGroups() };
});

export const createSkinGroup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(1).max(80),
        templateId: z.string().min(1).nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireCatalogEditor();
    return await addGroup(data.name, data.templateId);
  });

export const patchSkinGroup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().min(1),
        name: z.string().min(1).max(80).optional(),
        templateId: z.string().min(1).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireCatalogEditor();
    await updateGroup(data.id, { name: data.name, templateId: data.templateId });
    return { ok: true as const };
  });

export const deleteSkinGroup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    await requireCatalogEditor();
    await removeGroup(data.id);
    // Жёсткий сброс: сам админ сразу прочитает карту, а stale-снапшот
    // вернул бы клеткам удалённый облик (жалоба «удалил один облик —
    // унесло все постройки»).
    purgeMapBase();
    await noteActiveMapRebuilt();
    // «restored» — общий сброс карты у клиентов: облик виден сразу, без F5.
    publishRaid({ mapId: null, type: "restored" });
    return { ok: true as const };
  });

/** Добавить картинки в категорию — пачкой, как их и загружают. */
export const addSkinImages = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        groupId: z.string().min(1),
        items: z
          .array(z.object({ name: z.string().min(1).max(120), image: z.string().min(1) }))
          .min(1)
          .max(60),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireCatalogEditor();
    return { skins: await addSkins(data.groupId, data.items) };
  });

/** Переименовать конкретную картинку облика. Клетки НЕ трогает — сам облик
 *  остаётся на месте, меняется только его подпись в палитре. */
export const renameSkinImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().min(1),
        name: z.string().min(1).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireCatalogEditor();
    const { renameSkin } = await import("./building-skins");
    await renameSkin(data.id, data.name);
    // Карта тянет skin.name через тот же mapBase (map.buildings[skin:id].name),
    // покерай его как обычную правку постройки — жёсткий drop + restored.
    purgeMapBase();
    await noteActiveMapRebuilt();
    publishRaid({ mapId: null, type: "restored" });
    return { ok: true as const };
  });

export const deleteSkinImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    await requireCatalogEditor();
    await removeSkin(data.id);
    // Жёсткий сброс — иначе клетки со снятым обликом ещё несколько секунд
    // показывают его через stale-снапшот и «удалилось всё» на глаз.
    purgeMapBase();
    await noteActiveMapRebuilt();
    // «restored» — общий сброс карты у клиентов: облик виден сразу, без F5.
    publishRaid({ mapId: null, type: "restored" });
    return { ok: true as const };
  });

/** Поставить вид на клетку. skinId = null — вернуть базовый облик шаблона. */
export const setBuildingSkin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.number().int(),
        r: z.number().int(),
        skinId: z.string().min(1).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const mapId = await godMapId();
    const state = await setCellSkin(mapId, data.q, data.r, data.skinId);
    // Клетки в кэше карты — свежий облик берёт сразу, без stale-задержки.
    purgeMapBase(mapId);
    // Журнал карты: облик клетки — дельтой всем (словарь облика — из снимка).
    {
      const { noteAdminPatches } = await import("./map-change-hooks");
      await noteAdminPatches(mapId, [
        { q: data.q, r: data.r, buildingSkinId: data.skinId ?? null },
      ]);
    }
    // «restored» — общий сброс карты у ДРУГИХ клиентов. Своему клиенту итог
    // возвращаем прямо тут: он патчит кэш клетки мгновенно, не дожидаясь
    // тяжёлого рефетча карты (жалоба «облик виден только после Выгрузить»).
    publishRaid({ mapId, type: "restored" });
    return { ok: true as const, ...state };
  });
