// Награды объекта для показа игроку: подставляем НАЗВАНИЕ и картинку пака
// вместо технического id.
//
// parseRewardConfig отдаёт только packId/itemTemplateId, а окно объекта рисует
// `name ?? packId` — без этого шага игрок видел «cp_COzL-ufXJM · до места 10».
import { pg } from "../../db/pg";
import type { RewardConfig } from "../raid-shared";

export type RewardView = RewardConfig & {
  packs: Array<{ packId: string; toPlace: number; name?: string; imageUrl?: string | null }>;
  items: Array<{
    itemTemplateId: string;
    toPlace: number;
    name?: string;
    imageUrl?: string | null;
  }>;
  /** Наполнители: у своего товара (kind='custom') подставлены имя и картинка. */
  fillers: Array<RewardConfig["fillers"][number] & { name?: string; imageUrl?: string | null }>;
};

export async function decorateRewardConfig(cfg: RewardConfig): Promise<RewardView> {
  const packIds = cfg.packs.map((p) => p.packId).filter(Boolean);
  const itemIds = (cfg.items ?? []).map((i) => i.itemTemplateId).filter(Boolean);
  // Свой товар лежит в фонде наполнителем и в ДРУГОМ справочнике: без этого
  // шага окно «что дадут» рисовало бы «cst_7ce4…» вместо «Пшеница».
  const customIds = [
    ...new Set(
      cfg.fillers
        .filter((f) => f.kind === "custom")
        .map((f) => f.itemId ?? "")
        .filter(Boolean),
    ),
  ];

  const packInfo = new Map<string, { name: string; cover: string | null }>();
  if (packIds.length > 0) {
    const { data } = await pg.chipPacks
      .raw()
      .select("id,name,cover_image_url")
      .in("id", Array.from(new Set(packIds)));
    for (const p of (data ?? []) as Array<{
      id: string;
      name: string;
      cover_image_url: string | null;
    }>) {
      packInfo.set(p.id, { name: p.name, cover: p.cover_image_url });
    }
  }

  const itemInfo = new Map<string, { name: string; image: string | null }>();
  if (itemIds.length > 0) {
    const { data } = await pg.mysticItemTemplates
      .raw()
      .select("id,name,image_url")
      .in("id", Array.from(new Set(itemIds)));
    for (const i of (data ?? []) as Array<{
      id: string;
      name: string;
      image_url: string | null;
    }>) {
      itemInfo.set(i.id, { name: i.name, image: i.image_url });
    }
  }

  const customInfo = new Map<string, { name: string; image: string | null }>();
  if (customIds.length > 0) {
    const { mcpExec } = await import("../../db/mcpClient");
    const { sqlStr } = await import("../raid-shared");
    const rows = (await mcpExec(
      `SELECT id, name, image FROM yuplink.raid_custom_item
        WHERE id IN (${customIds.map((id) => sqlStr(id)).join(",")});`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ id: string; name: string; image: string | null }>;
    for (const r of rows ?? []) {
      customInfo.set(String(r.id), { name: String(r.name ?? ""), image: r.image ?? null });
    }
  }

  return {
    ...cfg,
    fillers: cfg.fillers.map((f) => {
      const info = f.kind === "custom" ? customInfo.get(f.itemId ?? "") : undefined;
      return info ? { ...f, name: info.name, imageUrl: info.image } : { ...f };
    }),
    packs: cfg.packs.map((p) => ({
      ...p,
      name: packInfo.get(p.packId)?.name,
      imageUrl: packInfo.get(p.packId)?.cover ?? null,
    })),
    items: (cfg.items ?? []).map((i) => ({
      ...i,
      name: itemInfo.get(i.itemTemplateId)?.name,
      imageUrl: itemInfo.get(i.itemTemplateId)?.image ?? null,
    })),
  };
}
