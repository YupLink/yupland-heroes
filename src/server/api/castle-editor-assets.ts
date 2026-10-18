// Каталог ассетов интерьера замка: местность / постройка / объект / декор /
// дорога. Один CRUD на все слои — kind в колонке. Свои картинки дизайнер
// заводит сам: имя + загруженная картинка, для любого слоя.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "../db/mcpClient";
import { requireCastleEditor } from "../auth";
import { sqlStr } from "./raid-shared";
import { CASTLE_KINDS } from "@/lib/castleKinds";
import { ensureCastleTables } from "./castle-editor";

import { LABEL_SIZE_MIN, LABEL_SIZE_MAX, LABEL_SIZE_DEFAULT } from "@/lib/castleLabelSize";

import { destinations } from "@/lib/castleMenus";

const labelSizeSchema = z.number().int().min(LABEL_SIZE_MIN).max(LABEL_SIZE_MAX);
const kindSchema = z.enum(CASTLE_KINDS);

/** Завести ассет любого слоя (своя картинка дизайнера). */
export const castleEditorCreateAsset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: kindSchema,
        menuAction: z.enum(destinations).nullable().default(null),
        labelFontSize: labelSizeSchema.default(LABEL_SIZE_DEFAULT),
        name: z.string().min(1).max(60),
        imageUrl: z.string().min(1).max(2048),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = await requireCastleEditor();
    await ensureCastleTables();
    const id = `ct_${nanoid(10)}`;
    const name = data.name.trim();
    await mcpExec(
      `INSERT INTO yuplink.castle_terrain_template
         (id, kind, name, image_url, active, created_by_wallet, label_font_size, menu_action)
       VALUES (${sqlStr(id)}, ${sqlStr(data.kind)}, ${sqlStr(name)}, ${sqlStr(data.imageUrl)}, true, ${sqlStr(wallet || "")}, ${data.kind === "building" ? data.labelFontSize : LABEL_SIZE_DEFAULT}, ${data.kind === "building" && data.menuAction ? sqlStr(data.menuAction) : "NULL"})
       ON CONFLICT (id) DO NOTHING;`,
    );
    return {
      id,
      kind: data.kind,
      name,
      image_url: data.imageUrl,
      menu_action: data.kind === "building" ? data.menuAction : null,
      label_font_size: data.kind === "building" ? data.labelFontSize : LABEL_SIZE_DEFAULT,
    };
  });

/** Переименовать / сменить картинку. */
export const castleEditorUpdateAsset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().min(1).max(120),
        labelFontSize: labelSizeSchema.optional(),
        menuAction: z.enum(destinations).nullable().optional(),
        name: z.string().min(1).max(60).optional(),
        imageUrl: z.string().min(1).max(2048).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireCastleEditor();
    await ensureCastleTables();
    const sets: string[] = [];
    if (data.name !== undefined) sets.push(`name = ${sqlStr(data.name.trim())}`);
    if (data.imageUrl !== undefined) sets.push(`image_url = ${sqlStr(data.imageUrl)}`);
    if (data.labelFontSize !== undefined)
      sets.push(
        `label_font_size = CASE WHEN kind = 'building' THEN ${data.labelFontSize} ELSE label_font_size END`,
      );
    if (data.menuAction !== undefined)
      sets.push(
        `menu_action = CASE WHEN kind = 'building' THEN ${data.menuAction ? sqlStr(data.menuAction) : "NULL"} ELSE NULL END`,
      );
    if (sets.length === 0) return { ok: true as const };
    await mcpExec(
      `UPDATE yuplink.castle_terrain_template SET ${sets.join(", ")}
        WHERE id = ${sqlStr(data.id)};`,
    );
    return { ok: true as const };
  });

/** Удалить ассет: клетки, что на него ссылались, чистятся через ON DELETE SET NULL. */
export const castleEditorDeleteAsset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    await requireCastleEditor();
    await ensureCastleTables();
    await mcpExec(`DELETE FROM yuplink.castle_terrain_template WHERE id = ${sqlStr(data.id)};`);
    return { ok: true as const };
  });
