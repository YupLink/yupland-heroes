// Шаблоны кастомных товаров маркета («Свой товар»): создать (картинка+имя) и
// перечислить для повторного выбора. Товар маркета kind='custom' ссылается на
// шаблон (ref_id) — как пак/герой/босс. Создаёт/перечисляет только админ.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import type { BoostEffect } from "@/lib/hero/boost";
import { toolWearOf } from "@/lib/raid/toolWear";
import {
  assertMapFits,
  assertOneKind,
  assertRodFits,
  assertShovelFits,
  assertWearFits,
  boostInput,
  boostOf,
  boostSql,
  explainChestClash,
  toolWearInput,
} from "./market-custom-rules";
import { requireCatalogEditor } from "@/server/api/catalog-auth";

export type CustomItem = {
  id: string;
  name: string;
  image: string | null;
  /** Что это за товар — единственное, что покупателю можно рассказать в «i». */
  description: string | null;
  /**
   * Прибавки к характеристикам героя, если товар — буст. Пусто/null у
   * обычных: о бустах, которых нет, покупателю не пишут ни слова.
   */
  boost: BoostEffect[] | null;
  /** Галочка «зелье»: товар кладётся в сумку зелий, а не в рюкзак. */
  isPotion: boolean;
  /** Галочка «магический сундук»: вид один на весь справочник. */
  magicChest: boolean;
  /**
   * «Износ за удар, %» (28.09): у инструмента столько прочности снимает одна
   * рубка (lib/raid/toolWear.ts). null — ломается с первого удара.
   */
  toolWear: number | null;
  /** Галочка «лопата» (29.09): закопать и выкопать мешочек (ПРАВИЛА §8.21). */
  isShovel: boolean;
  /** Галочка «сундук» (29.09): обычный сундук-склад на карте (ПРАВИЛА §8.22). */
  plainChest: boolean;
  /** Категория справочника (item-categories.ts); null — «без категории». */
  categoryId: string | null;
  /** Галочка «удочка» (04.10): рыбачить у воды (ПРАВИЛА §8.35). */
  isRod: boolean;
  /** Галочка «карта» (05.10): целая штука у выбранного героя открывает карту мира (§8.32). */
  isMap: boolean;
  /** Галочки «бинокль» и «лестница» (08.11): «Применить» из рюкзака. */
  isBinocular: boolean;
  isLadder: boolean;
};

const newId = () =>
  `cst_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;

export const listCustomItems = createServerFn({ method: "GET" }).handler(
  async (): Promise<CustomItem[]> => {
    const rows = (await mcpExec(
      `SELECT id, name, image, description, boost, is_potion, magic_chest, tool_wear, is_shovel,
              plain_chest, category_id, is_rod, is_map, is_binocular, is_ladder
         FROM yuplink.raid_custom_item
        ORDER BY created_at DESC;`,
      { wrapJson: true },
    ).catch(() => [])) as Array<Record<string, unknown>>;
    return (rows ?? []).map((r) => ({
      id: String(r.id),
      name: String(r.name ?? ""),
      image: r.image != null ? String(r.image) : null,
      description: r.description != null ? String(r.description) : null,
      boost: boostOf(r.boost),
      isPotion: r.is_potion === true,
      magicChest: r.magic_chest === true,
      toolWear: toolWearOf(r.tool_wear),
      isShovel: r.is_shovel === true,
      plainChest: r.plain_chest === true,
      categoryId: r.category_id != null ? String(r.category_id) : null,
      isRod: r.is_rod === true,
      isMap: r.is_map === true,
      isBinocular: r.is_binocular === true,
      isLadder: r.is_ladder === true,
    }));
  },
);

export const createCustomItem = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(1).max(120),
        image: z.string().nullable().default(null),
        description: z.string().max(600).nullable().default(null),
        boost: boostInput,
        isPotion: z.boolean().default(false),
        magicChest: z.boolean().default(false),
        toolWear: toolWearInput.default(null),
        isShovel: z.boolean().default(false),
        plainChest: z.boolean().default(false),
        categoryId: z.string().min(1).nullable().default(null),
        isRod: z.boolean().default(false),
        isMap: z.boolean().default(false),
        isBinocular: z.boolean().default(false),
        isLadder: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<CustomItem> => {
    await requireCatalogEditor();
    assertWearFits(data.magicChest, data.toolWear, data.plainChest);
    assertShovelFits(data);
    assertRodFits(data);
    assertMapFits(data);
    assertOneKind(data);
    const id = newId();
    const cat = data.categoryId ? sqlStr(data.categoryId) : "NULL";
    const boost = boostOf(data.boost);
    const toolWear = toolWearOf(data.toolWear);
    await mcpExec(
      `INSERT INTO yuplink.raid_custom_item(id, name, image, description, is_map, category_id, boost, is_rod, is_potion, plain_chest, magic_chest, is_shovel, tool_wear, is_binocular, is_ladder)
       VALUES (${sqlStr(id)}, ${sqlStr(data.name)}, ${data.image ? sqlStr(data.image) : "NULL"},
               ${data.description ? sqlStr(data.description) : "NULL"}, ${data.isMap === true}, ${cat}, ${boostSql(boost)}, ${data.isRod === true},
               ${data.isPotion}, ${data.plainChest === true}, ${data.magicChest}, ${data.isShovel === true}, ${toolWear ?? "NULL"},
               ${data.isBinocular === true}, ${data.isLadder === true});`,
    ).catch((e) => explainChestClash(e, data.magicChest));
    // Галочки и тексты — как пришли (zod уже отрезал лишнее); буст и износ — разобранные.
    return { ...data, id, boost, toolWear };
  });

/** Переименовать/переобложить шаблон. Уже выставленные товары не трогает —
 * у них своя копия имени/картинки (снимок при выборе). */
export const updateCustomItem = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().min(1),
        name: z.string().min(1).max(120),
        image: z.string().nullable().default(null),
        description: z.string().max(600).nullable().default(null),
        boost: boostInput,
        isPotion: z.boolean().default(false),
        // Необязательна: окно админки из кэша прошлой версии её не шлёт, и
        // «нет поля» не должно снимать сундук — тогда колонку не трогаем.
        magicChest: z.boolean().optional(),
        // Так же и износ: нет поля — прежний износ остаётся, null — снят.
        toolWear: toolWearInput.optional(),
        // Так же и лопата: нет поля (окно прошлой версии) — колонку не трогаем.
        isShovel: z.boolean().optional(),
        // И «сундук» (29.09): нет поля — колонку не трогаем.
        plainChest: z.boolean().optional(),
        // И категория (04.10): нет поля — прежняя, null — «без категории».
        categoryId: z.string().min(1).nullable().optional(),
        // И «удочка» (04.10): нет поля — колонку не трогаем.
        isRod: z.boolean().optional(),
        // И «карта» (05.10): нет поля — колонку не трогаем.
        isMap: z.boolean().optional(),
        isBinocular: z.boolean().optional(),
        isLadder: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<CustomItem> => {
    // Право «справочники» товары только создаёт; менять существующий — только админ
    // (владелец 04.11.2026: «может только выставлять — менять нельзя»).
    const actor = await requireCatalogEditor();
    if (!actor.money) throw new Error("Менять свой товар — только админ");
    assertWearFits(data.magicChest, data.toolWear, data.plainChest);
    assertShovelFits(data);
    assertRodFits(data);
    assertMapFits(data);
    assertOneKind(data);
    const boost = boostOf(data.boost);
    const chestSet = data.magicChest === undefined ? "" : `, magic_chest=${data.magicChest}`;
    const wearSet =
      data.toolWear === undefined ? "" : `, tool_wear=${toolWearOf(data.toolWear) ?? "NULL"}`;
    const shovelSet = data.isShovel === undefined ? "" : `, is_shovel=${data.isShovel === true}`;
    const plainSet =
      data.plainChest === undefined ? "" : `, plain_chest=${data.plainChest === true}`;
    const catSet =
      data.categoryId === undefined
        ? ""
        : `, category_id=${data.categoryId ? sqlStr(data.categoryId) : "NULL"}`;
    const rodSet = data.isRod === undefined ? "" : `, is_rod=${data.isRod === true}`;
    const mapSet =
      (data.isMap === undefined ? "" : `, is_map=${data.isMap === true}`) +
      (data.isBinocular === undefined ? "" : `, is_binocular=${data.isBinocular === true}`) +
      (data.isLadder === undefined ? "" : `, is_ladder=${data.isLadder === true}`);
    const rows = (await mcpExec(
      `UPDATE yuplink.raid_custom_item
          SET name=${sqlStr(data.name)}, image=${data.image ? sqlStr(data.image) : "NULL"},
              description=${data.description ? sqlStr(data.description) : "NULL"},
              boost=${boostSql(boost)}, is_potion=${data.isPotion}${chestSet}${wearSet}${shovelSet}${plainSet}${catSet}${rodSet}${mapSet}
        WHERE id=${sqlStr(data.id)}
        RETURNING magic_chest, tool_wear, is_shovel, plain_chest, category_id, is_rod, is_map,
                  is_binocular, is_ladder;`,
      { wrapJsonCte: true },
    ).catch((e) => explainChestClash(e, data.magicChest))) as Array<{
      magic_chest: boolean;
      tool_wear: number | string | null;
      is_shovel: boolean;
      plain_chest: boolean;
      category_id: string | null;
      is_rod?: boolean;
      is_map?: boolean;
      is_binocular?: boolean;
      is_ladder?: boolean;
    }>;
    // Кэш канона держит имя и картинку шаблона — после правки он устарел.
    const { invalidateAliases } = await import("./item-alias");
    invalidateAliases();
    // Износ инструмента рубка берёт из кэша декора — сразу со свежим числом.
    if (data.toolWear !== undefined) {
      const { dropInteractiveDecorCache } = await import("./decor-interact");
      dropInteractiveDecorCache();
    }
    return {
      id: data.id,
      name: data.name,
      image: data.image,
      description: data.description,
      boost,
      isPotion: data.isPotion,
      magicChest: rows?.[0]?.magic_chest === true,
      toolWear: toolWearOf(rows?.[0]?.tool_wear),
      isShovel: rows?.[0]?.is_shovel === true,
      plainChest: rows?.[0]?.plain_chest === true,
      categoryId: rows?.[0]?.category_id ?? null,
      isRod: rows?.[0]?.is_rod === true,
      isMap: rows?.[0]?.is_map === true,
      isBinocular: rows?.[0]?.is_binocular === true,
      isLadder: rows?.[0]?.is_ladder === true,
    };
  });

/** Удалить шаблон из справочника. Выставленные ранее товары остаются (снимок). */
export const deleteCustomItem = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    // Удаление стирает товар у всех, у кого он лежит (рюкзаки, склады, лавки) —
    // это трогает игроков: право catalogs создаёт и правит, удаляет только админ.
    const actor = await requireCatalogEditor();
    if (!actor.money)
      throw new Error("Удалить свой товар — только админ: он может лежать у игроков");
    await mcpExec(`DELETE FROM yuplink.raid_custom_item WHERE id=${sqlStr(data.id)};`);
    return { ok: true as const };
  });
