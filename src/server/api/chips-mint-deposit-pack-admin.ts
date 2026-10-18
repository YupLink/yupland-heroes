// Админка связок «NFT → пак»: какой пак выдаётся за какой NFT по названию.
// Сам ввод живёт в chips-mint-deposit-pack.ts (§13.1).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import { STORE_NFT_CONTRACT } from "./chips-mint-helpers";
import { getPackInputMap, savePackInputMap, packInputKey } from "./chips-mint-deposit-helpers";

export const adminGetPackInputConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("./chips-mint-helpers");
  requireAdmin();
  const map = await getPackInputMap();
  const { data: packs } = await pg.chipPacks
    .raw()
    .select("id,name,cover_image_url,active")
    .order("sort_order", { ascending: true });
  return {
    map,
    packs: (packs ?? []) as Array<{
      id: string;
      name: string;
      cover_image_url: string | null;
      active: boolean;
    }>,
    storeContract: STORE_NFT_CONTRACT,
  };
});

export const adminSetPackInputMapEntry = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        contract: z.string().min(3),
        title: z.string().min(1).max(300),
        packId: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./chips-mint-helpers");
    requireAdmin();
    const map = await getPackInputMap();
    const key = packInputKey(data.contract, data.title);
    const packId = (data.packId ?? "").trim();
    if (!packId) {
      delete map[key];
    } else {
      const p = await pg.chipPacks.findOne({ id: packId });
      if (!p) throw new Error("Пак не найден");
      map[key] = packId;
    }
    await savePackInputMap(map);
    return { ok: true };
  });
