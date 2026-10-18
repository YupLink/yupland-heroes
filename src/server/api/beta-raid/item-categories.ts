// Справочник категорий своих товаров (владелец, 04.10.2026): создать,
// переименовать, удалить, разложить товары пачкой. Удалили категорию — её товары
// становятся «без категории» (ON DELETE SET NULL), сами товары не трогаются.
// Категории товаров других видов — по виду, их тут нет (lib/itemCategories.ts).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireAdmin } from "../../auth";
import type { ItemCategory } from "@/lib/itemCategories";

const nameInput = z.string().trim().min(1).max(60);

/** Повтор имени (без учёта регистра) — понятным текстом, а не кодом базы. */
function explainDuplicate(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  if (/raid_item_category_name_uq|duplicate key/i.test(msg)) {
    throw new Error("Такая категория уже есть");
  }
  throw e instanceof Error ? e : new Error(msg);
}

export const listItemCategories = createServerFn({ method: "GET" }).handler(
  async (): Promise<ItemCategory[]> => {
    requireAdmin();
    const rows = (await mcpExec(
      `SELECT k.id, k.name, k.pos,
              (SELECT count(*) FROM yuplink.raid_custom_item c WHERE c.category_id = k.id) AS n
         FROM yuplink.raid_item_category k
        ORDER BY k.pos, k.name;`,
      { wrapJson: true },
    )) as Array<{ id: string; name: string; pos: number; n: number | string }>;
    return (rows ?? []).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      pos: Number(r.pos) || 0,
      count: Number(r.n) || 0,
    }));
  },
);

export const createItemCategory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ name: nameInput }).parse(d))
  .handler(async ({ data }): Promise<ItemCategory> => {
    requireAdmin();
    const id = `icat_${Math.random().toString(36).slice(2, 10)}`;
    // Новая — в конец списка: порядок старых не сдвигается.
    const rows = (await mcpExec(
      `INSERT INTO yuplink.raid_item_category (id, name, pos)
       SELECT ${sqlStr(id)}, ${sqlStr(data.name)},
              COALESCE((SELECT max(pos) FROM yuplink.raid_item_category), 0) + 10
       RETURNING id, name, pos;`,
      { wrapJsonCte: true },
    ).catch(explainDuplicate)) as Array<{ id: string; name: string; pos: number }>;
    const row = rows?.[0];
    return { id, name: row?.name ?? data.name, pos: Number(row?.pos) || 0, count: 0 };
  });

export const renameItemCategory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1), name: nameInput }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    await mcpExec(
      `UPDATE yuplink.raid_item_category SET name = ${sqlStr(data.name)}
        WHERE id = ${sqlStr(data.id)};`,
      { wrapJson: false },
    ).catch(explainDuplicate);
    return { ok: true as const };
  });

export const deleteItemCategory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    await mcpExec(`DELETE FROM yuplink.raid_item_category WHERE id = ${sqlStr(data.id)};`, {
      wrapJson: false,
    });
    return { ok: true as const };
  });

/** Разложить свои товары пачкой: categoryId = null — «без категории». */
export const setItemsCategory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        ids: z.array(z.string().min(1)).min(1).max(500),
        categoryId: z.string().min(1).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const ids = data.ids.map(sqlStr).join(", ");
    // Категория должна существовать: иначе внешний ключ уронит запрос
    // невнятной ошибкой, а здесь — понятный отказ.
    if (data.categoryId) {
      const hit = (await mcpExec(
        `SELECT 1 AS ok FROM yuplink.raid_item_category WHERE id = ${sqlStr(data.categoryId)};`,
        { wrapJson: true },
      )) as Array<{ ok: number }>;
      if (!hit?.length) throw new Error("Такой категории нет");
    }
    const cat = data.categoryId ? sqlStr(data.categoryId) : "NULL";
    await mcpExec(
      `UPDATE yuplink.raid_custom_item SET category_id = ${cat} WHERE id IN (${ids});`,
      { wrapJson: false },
    );
    return { ok: true as const };
  });
