// Шаблоны точек спавна (владелец, 06.11.2026): настроить точку один раз —
// «Сохранить шаблоном» в окне точки — и дальше ставить её тапами по карте в
// режиме бога. Тап шаблоном = та же точка, что из окна (spawn-point-save).
// Клетку с уже стоящей точкой тап не трогает: её правят окном клетки.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireGodAdmin } from "@/server/api/beta-raid/island/island-editor-auth";
import type { SpawnPointMob } from "@/lib/raid/spawnPoint";
import type { SpawnTemplate } from "@/lib/raid/spawnTemplate";
import { cell, pointBody } from "./spawn-point-api";

type TemplateRow = { id: string; name: string; radius: number; mobs: unknown };

const toTemplate = (t: TemplateRow): SpawnTemplate => {
  const raw = typeof t.mobs === "string" ? (JSON.parse(t.mobs) as unknown) : t.mobs;
  return {
    id: t.id,
    name: t.name,
    radius: Number(t.radius),
    mobs: Array.isArray(raw) ? (raw as SpawnPointMob[]) : [],
  };
};

export const adminListSpawnTemplates = createServerFn({ method: "GET" }).handler(async () => {
  await requireGodAdmin();
  const { mcpExec } = await import("@/server/db/mcpClient");
  const { listTemplatesSql } = await import("./spawn-template-sql");
  const rows = (await mcpExec(listTemplatesSql(), { wrapJson: true })) as TemplateRow[];
  return { templates: (rows ?? []).map(toTemplate) };
});

/** Сохранить шаблон из окна точки (новый или под тем же id). */
export const adminSaveSpawnTemplate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    pointBody
      .extend({ id: z.string().max(40).optional(), name: z.string().trim().min(1).max(60) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireGodAdmin();
    const { mcpExec } = await import("@/server/db/mcpClient");
    const { nanoid } = await import("nanoid");
    const { normalizeMobs } = await import("./spawn-point-save");
    const { saveTemplateSql } = await import("./spawn-template-sql");
    // Те же проверки, что у точки: мобы есть, до 30 штук. Карта не задана —
    // шаблон общий; погоду на острове проверит постановка (savePointAt).
    const mobs = await normalizeMobs("", data.mobs);
    const id = data.id || `stp_${nanoid(10)}`;
    await mcpExec(saveTemplateSql({ id, name: data.name, radius: data.radius, mobs }));
    return { id };
  });

export const adminDeleteSpawnTemplate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data }) => {
    await requireGodAdmin();
    const { mcpExec } = await import("@/server/db/mcpClient");
    const { deleteTemplateSql } = await import("./spawn-template-sql");
    await mcpExec(deleteTemplateSql(data.id));
    return { ok: true as const };
  });

/** Тап шаблоном: на свободной клетке — новая точка; где точка уже есть — отказ. */
export const adminStampSpawnPoint = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => cell.extend({ template: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const { mapId } = await requireGodAdmin();
    const { mcpExec } = await import("@/server/db/mcpClient");
    const { templateSql } = await import("./spawn-template-sql");
    const { pointAt, savePointAt } = await import("./spawn-point-save");
    const rows = (await mcpExec(templateSql(data.template), { wrapJson: true })) as TemplateRow[];
    if (!rows?.[0]) throw new Error("Шаблона нет — выбери другой");
    if (await pointAt(mapId, data.q, data.r)) throw new Error("Здесь уже есть точка");
    const t = toTemplate(rows[0]);
    return savePointAt(mapId, data.q, data.r, t.radius, t.mobs);
  });

/** Точки карты режима бога — значки на клетках. */
export const adminListSpawnPoints = createServerFn({ method: "GET" }).handler(async () => {
  const { mapId } = await requireGodAdmin();
  const { mcpExec } = await import("@/server/db/mcpClient");
  const { mapPointsSql } = await import("./spawn-template-sql");
  const rows = (await mcpExec(mapPointsSql(mapId), { wrapJson: true })) as Array<{
    q: number;
    r: number;
    radius: number;
  }>;
  return {
    mapId,
    points: (rows ?? []).map((p) => ({ q: Number(p.q), r: Number(p.r), radius: Number(p.radius) })),
  };
});
