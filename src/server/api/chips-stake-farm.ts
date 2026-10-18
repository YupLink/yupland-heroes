// chips-stake-farm — collection detail views (public list, detail, my chips).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import type { PgChipCollection, PgChipTemplate } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { requireWallet } from "./chips-mint-helpers";
import { isPremiumCollection } from "@/lib/tirageBonus";
import { accountOf } from "./user-shared";

export const listChipCollectionsPublic = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data: cols } = await pg.chipCollections
      .raw().select("*").eq("status", "active")
      .order("sort_order", { ascending: true }).order("created_at", { ascending: false });
    const collections = (cols ?? []) as PgChipCollection[];
    if (collections.length === 0) return [];

    const collEsc = collections.map((c) => `'${c.id.replace(/'/g, "''")}'`).join(",");
    const aggRows = (await mcpExec(
      `SELECT collection_id, count(*)::int AS total,
              count(*) FILTER (WHERE status='burned')::int AS burned
         FROM yuplink.user_chip_inventory WHERE collection_id IN (${collEsc}) GROUP BY collection_id;`,
      { wrapJson: true }
    )) as Array<{ collection_id: string; total: number; burned: number }>;
    const totalByCol = new Map<string, number>(aggRows.map((r) => [r.collection_id, Number(r.total)]));
    const burnedByCol = new Map<string, number>(aggRows.map((r) => [r.collection_id, Number(r.burned)]));
    return collections.map((c) => {
      const minted = totalByCol.get(c.id) ?? 0;
      const burned = burnedByCol.get(c.id) ?? 0;
      const supply = c.initial_supply;
      return {
        id: c.id, name: c.name, description: c.description, coverImageUrl: c.cover_image_url,
        initialSupply: supply, isPremium: isPremiumCollection(c.name, c.is_premium),
        mintedCount: minted, burnedCount: burned,
        progress: supply > 0 ? minted / supply : 0,
        burnedPercent: supply > 0 && burned > 0 ? Math.round((burned / supply) * 1000) / 10 : 0,
      };
    });
  }
);

export const getTirageBonusEnabled = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getHallwayConfig } = await import("./hallwayConfig");
    return (await getHallwayConfig()).boss.tirageBonusEnabled;
  }
);

export const getChipCollectionDetail = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ collectionId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    const { getSisterWallets } = await import("./user");
    const col = await pg.chipCollections.findOne({ id: data.collectionId });
    if (!col) throw new Error("Коллекция не найдена");

    const { data: tplRaw } = await pg.chipTemplates.raw().select("*").eq("collection_id", col.id).order("template_no", { ascending: true });
    const tpls = (tplRaw ?? []) as PgChipTemplate[];
    const invRaw = wallet ? (await pg.userChipInventory.raw().select("id,template_id,level").eq("account_id", await accountOf(wallet)).eq("collection_id", col.id).eq("status", "owned")).data : [];
    const inv = (invRaw ?? []) as Array<{ id: string; template_id: string; level: number }>;

    const byTpl = new Map<string, Array<{ id: string; level: number }>>();
    for (const i of inv) {
      const arr = byTpl.get(i.template_id) ?? [];
      arr.push({ id: i.id, level: i.level });
      byTpl.set(i.template_id, arr);
    }

    const templates = tpls.map((t) => {
      const own = byTpl.get(t.id) ?? [];
      return { id: t.id, templateNo: t.template_no, name: t.name, imageUrl: t.image_url, ownedCount: own.length, maxLevel: own.reduce((s, x) => Math.max(s, x.level), 0) };
    });
    templates.sort((a, b) => b.maxLevel - a.maxLevel || a.templateNo - b.templateNo);

    const { data: allRows } = await pg.userChipInventory.raw().select("status").eq("collection_id", col.id);
    const liveMinted = (allRows ?? []).length;
    const liveBurned = ((allRows ?? []) as Array<{ status: string | null }>).filter((r) => r.status === "burned").length;
    const supply = col.initial_supply;
    return {
      id: col.id, name: col.name, description: col.description, coverImageUrl: col.cover_image_url,
      initialSupply: supply, mintedCount: liveMinted, burnedCount: liveBurned,
      progress: supply > 0 ? liveMinted / supply : 0,
      burnedPercent: supply > 0 && liveBurned > 0 ? Math.round((liveBurned / supply) * 1000) / 10 : 0,
      templates,
    };
  });

export const getMyChipsForTemplate = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ templateId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const { getSisterWallets } = await import("./user");
    const account = await accountOf(wallet);
    const tpl = await pg.chipTemplates.findOne({ id: data.templateId });
    if (!tpl) throw new Error("Шаблон не найден");
    const col = await pg.chipCollections.findOne({ id: tpl.collection_id });
    const { data: invRaw } = await pg.userChipInventory.raw()
      .select("id,level,obtained_at,source,serial_no,rest_until,status")
      // 'staked' — фишка учится в университете: показать её надо (иначе игрок
      // ищет пропажу), но серой и без действий. Серым её делает chipBusy по
      // флагу из инвентаря, а сюда она попадает этим фильтром.
      .eq("account_id", account).eq("template_id", tpl.id).in("status", ["owned", "staked"])
      .order("level", { ascending: false }).order("obtained_at", { ascending: false });
    return {
      template: { id: tpl.id, templateNo: tpl.template_no, name: tpl.name, imageUrl: tpl.image_url, collectionId: tpl.collection_id, collectionName: col?.name ?? "Коллекция" },
      chips: ((invRaw ?? []) as Array<{ id: string; level: number; obtained_at: string; source: string; serial_no: number | null; rest_until: string | null; status: string }>)
        .map((c) => ({ id: c.id, level: c.level, obtainedAt: c.obtained_at, source: c.source, serialNo: c.serial_no, restUntil: c.rest_until, studying: c.status === "staked" })),
    };
  });
