// Шаблоны городов — три ручки для панели генератора: список, запись, удаление.
//
// Список всегда начинается с предустановленных (`preset:…`): они считаются из
// живого справочника и в базе не лежат, поэтому панель не открывается пустой
// даже на чистой базе. Дальше — свои, свежие сверху.
//
// В базу карты здесь по-прежнему ничего не пишется: шаблон — это рецепт, а
// клетки уезжают прежним путём, через очередь кисти и «Выгрузить».
import { createServerFn } from "@tanstack/react-start";
import { presetBlueprints } from "@/lib/raid/zonegen/blueprint-presets";
import type { TownBlueprint } from "@/lib/raid/zonegen/blueprint-types";
import { loadBuildingOptions } from "./catalog-buildings";
import {
  deleteBlueprint,
  deleteBlueprintInputSchema,
  listBlueprints,
  saveBlueprint,
  saveBlueprintInputSchema,
} from "./blueprints";
import { requireDesigner } from "@/server/api/beta-raid/island/island-editor-auth";
import { requireCatalogEditor } from "@/server/api/catalog-auth";

export type TownBlueprintsOutput = { list: TownBlueprint[] };

/** Все шаблоны: предустановленные из справочника + сохранённые из базы. */
export const adminTownBlueprints = createServerFn({ method: "GET" }).handler(
  async (): Promise<TownBlueprintsOutput> => {
    await requireDesigner();
    const [options, saved] = await Promise.all([loadBuildingOptions(), listBlueprints()]);
    return { list: [...presetBlueprints(options), ...saved] };
  },
);

/**
 * Сохранить шаблон. Без id — новый; с id — перезапись именно этой строки.
 * Имя уникальным не делаем: два «Адских города» с разной планировкой — это
 * нормальная работа, а не ошибка ввода.
 */
export const adminSaveTownBlueprint = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => saveBlueprintInputSchema.parse(d))
  .handler(async ({ data }): Promise<{ blueprint: TownBlueprint }> => {
    const { wallet } = await requireCatalogEditor();
    return { blueprint: await saveBlueprint(data, wallet) };
  });

/** Удалить свой шаблон; предустановленный удалить нельзя — он не в базе. */
export const adminDeleteTownBlueprint = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => deleteBlueprintInputSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await requireCatalogEditor();
    await deleteBlueprint(data.id);
    return { ok: true };
  });
