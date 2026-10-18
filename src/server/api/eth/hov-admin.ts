// Админ: картинки героев коллекции Heroes of Valdir (§8.54). Только админам.
// Картинку героя можно заменить в любой момент — она сменится и у будущих выдач, и у
// всех уже выданных героев с этим именем (шаблоны с meta.nft.hero).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { requireAdmin } from "../../auth";
import { sqlStr } from "../raid-shared";

export type HovHeroRow = { hero: string; portrait: string; lirian: boolean };

export const adminHovHeroes = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin();
  const rows = ((await mcpExec(
    `SELECT h.hero_name AS hero, h.portrait,
            EXISTS (SELECT 1 FROM yuplink.eth_hov_token t WHERE t.hero_name = h.hero_name AND t.lirian) AS lirian
       FROM yuplink.eth_hov_hero h
      ORDER BY lirian DESC, h.hero_name;`,
    { wrapJson: true },
  )) ?? []) as HovHeroRow[];
  return rows;
});

/** Заменить картинку героя коллекции — у будущих выдач и у всех уже выданных. */
export const adminSetHovPortrait = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ hero: z.string().min(1).max(120), url: z.string().min(1).max(500) }).parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    if (!/^(\/uploads\/|https:\/\/)/.test(data.url)) throw new Error("Картинка — загруженный файл или https-ссылка");
    const rows = ((await mcpExec(
      `WITH h AS (
         UPDATE yuplink.eth_hov_hero SET portrait = ${sqlStr(data.url)}
          WHERE hero_name = ${sqlStr(data.hero)} RETURNING 1
       ), t AS (
         UPDATE yuplink.mystic_item_template SET image_url = ${sqlStr(data.url)}
          WHERE kind = 'hero' AND meta->'nft'->>'hero' = ${sqlStr(data.hero)} RETURNING 1
       )
       SELECT (SELECT count(*) FROM h)::int AS hero, (SELECT count(*) FROM t)::int AS templates;`,
      { wrapJsonCte: true },
    )) ?? []) as Array<{ hero: number; templates: number }>;
    if (!rows[0]?.hero) throw new Error("Такого героя коллекции нет");
    return { ok: true as const, templates: Number(rows[0].templates) };
  });
