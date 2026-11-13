// Ручки шаблонов городов острова: дизайнер замка и админы.
// Снять — только стоя на своём острове новичка в режиме бога (requireGodMap);
// список, вкл/выкл, удалить — дизайнеру и админу.
//
// Серверные модули грузятся внутри ручек: файл импортирует клиент.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isIslandMapId } from "@/lib/raid/island/ids";
import type { TemplateRow } from "./town-template-store";

export type { TemplateRow } from "./town-template-store";

const store = () => import("./town-template-store");

async function designer(): Promise<string> {
  const { requireDesigner } = await import("./island-editor-auth");
  return requireDesigner();
}

export const listTownTemplates = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ templates: TemplateRow[]; town: string[] }> => {
    await designer();
    const s = await store();
    return { templates: await s.listTemplates(), town: await s.townIds() };
  },
);

export const saveTownTemplate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(40),
        q: z.number().int(),
        r: z.number().int(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireGodMap } = await import("./island-editor-auth");
    const god = await requireGodMap();
    // Снимок — только со своего острова (админ — с любого).
    if (!isIslandMapId(god.mapId) || (!god.admin && !god.ownIsland))
      throw new Error("tpl.not_island");
    const { getCurrentWallet } = await import("@/server/auth");
    const by = getCurrentWallet() ?? "";
    return (await store()).saveTemplate(god.mapId, { q: data.q, r: data.r }, data.name, by);
  });

const idInput = z.object({ id: z.string().min(1).max(40) });

export const setTownTemplateActive = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => idInput.extend({ active: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    await designer();
    await (await store()).setTemplateActive(data.id, data.active);
    return { ok: true as const };
  });

export const deleteTownTemplate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data }) => {
    await designer();
    await (await store()).deleteTemplate(data.id);
    return { ok: true as const };
  });
