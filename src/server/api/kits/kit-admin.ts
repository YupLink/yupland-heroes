// Админка наборов: список, создать/править, включить/выключить, удалить.
//
// Набор — бокс из конструктора боксов × N за цену в $ (DARAI и Stars — от неё,
// как у подписки; в списке — цены по курсу сейчас, для сверки). Наборов при
// выкате нет — их заводит админ. Новый набор выключен, пока его не включат.
// Купленные наборы хранят СНИМОК (бокс, количество, цена): правка набора их не
// меняет. Набор, который уже покупали, удалить нельзя — только выключить.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireAdmin } from "../../auth";
import { assertPackMoneyRight } from "../mystic-money";
import { daraiPerUsd } from "../energy-sub/rate";
import { kitError, type KitAdminRow, type KitFields } from "@/lib/kits";
import { kitSelect, toAdminRow, type KitRow } from "./kit-rows";

const fieldsInput = z.object({
  boxId: z.string().max(60),
  boxCount: z.number(),
  priceUsd: z.number(),
  stock: z.number().nullable(),
  perAccount: z.number().nullable(),
  active: z.boolean(),
});

const idInput = z.object({ id: z.string().min(1).max(40) });

const intOrNull = (v: number | null): string => (v == null ? "NULL" : String(Math.trunc(v)));

/** Поля из формы → поля набора; проверка — тем же kitError, что у формы. */
function fieldsOf(d: z.infer<typeof fieldsInput>): KitFields {
  const f: KitFields = { ...d, boxId: d.boxId.trim() };
  const err = kitError(f);
  if (err) throw new Error(err);
  return f;
}

/** Бокс набора — только из конструктора боксов (мистический). */
async function assertBox(boxId: string): Promise<void> {
  const rows = (await mcpExec(
    `SELECT 1 AS x FROM yuplink.chip_packs WHERE id = ${sqlStr(boxId)} AND kind = 'mystic';`,
    { wrapJson: true },
  )) as Array<{ x: number }> | null;
  if (!rows?.[0]) throw new Error("kits.err_box");
}

export const adminKitList = createServerFn({ method: "GET" }).handler(
  async (): Promise<KitAdminRow[]> => {
    requireAdmin();
    const rows = ((await mcpExec(`${kitSelect()} ORDER BY k.sort, k.created_at;`, {
      wrapJson: true,
    })) ?? []) as KitRow[];
    const rate = rows.length ? ((await daraiPerUsd())?.rate ?? null) : null;
    return rows.map((r) => toAdminRow(r, rate));
  },
);

/** Создать (без id — в конец списка) или поправить набор. */
export const adminKitSave = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    fieldsInput.extend({ id: z.string().min(1).max(40).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const f = fieldsOf(data);
    await assertBox(f.boxId);
    await assertPackMoneyRight(f.boxId);
    const vals = {
      box: sqlStr(f.boxId),
      count: String(f.boxCount),
      price: f.priceUsd.toFixed(2),
      stock: intOrNull(f.stock),
      perAccount: intOrNull(f.perAccount),
    };
    if (data.id) {
      const rows = (await mcpExec(
        `UPDATE yuplink.kit
            SET box_id = ${vals.box}, box_count = ${vals.count}, price_usd = ${vals.price},
                stock = ${vals.stock}, per_account = ${vals.perAccount}, active = ${f.active},
                updated_at = now()
          WHERE id = ${sqlStr(data.id)}
          RETURNING id;`,
        { wrapJsonCte: true },
      )) as Array<{ id: string }>;
      if (!rows?.[0]) throw new Error("kits.err_not_found");
      return { ok: true as const, id: data.id };
    }
    const id = `kit_${nanoid(10)}`;
    await mcpExec(
      `INSERT INTO yuplink.kit
         (id, box_id, box_count, price_usd, stock, per_account, active, sort)
       SELECT ${sqlStr(id)}, ${vals.box}, ${vals.count}, ${vals.price}, ${vals.stock},
              ${vals.perAccount}, ${f.active}, COALESCE((SELECT max(sort) FROM yuplink.kit), 0) + 1;`,
    );
    return { ok: true as const, id };
  });

/** Включить или выключить продажу. */
export const adminKitSetActive = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => idInput.extend({ active: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    await mcpExec(
      `UPDATE yuplink.kit SET active = ${data.active}, updated_at = now()
        WHERE id = ${sqlStr(data.id)};`,
    );
    return { ok: true as const };
  });

/** Удалить набор, который ещё не покупали; покупали — только выключить. */
export const adminKitDelete = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    const rows = (await mcpExec(
      `DELETE FROM yuplink.kit k
        WHERE k.id = ${sqlStr(data.id)}
          AND NOT EXISTS (SELECT 1 FROM yuplink.kit_order o WHERE o.kit_id = k.id)
        RETURNING k.id;`,
      { wrapJsonCte: true },
    )) as Array<{ id: string }>;
    if (rows?.[0]) return { ok: true as const };
    // Ноль строк: либо уже удалён (повтор запроса) — это успех, либо покупали.
    const left = (await mcpExec(`SELECT 1 AS x FROM yuplink.kit WHERE id = ${sqlStr(data.id)};`, {
      wrapJson: true,
    })) as Array<{ x: number }>;
    if (left?.[0]) throw new Error("kits.err_sold");
    return { ok: true as const };
  });
