// Герои за NFT Heroes of Valdir: список NFT игрока и выдача героя за выбранный.
// Герой — из самого NFT: портрет и имя героя NFT, раса по соответствию, редкость выпавшая,
// специализация и способность случайные (hov-hero.ts).
// Игрок сам решает, за какой NFT забрать героя. Один NFT — один герой навсегда (номер
// токена — ключ eth_nft_claim, кто бы ни владел им потом). Владение проверяется вживую
// в момент выдачи. Пока только админам (владелец, 17.10.2026).
import { createServerFn } from "@tanstack/react-start";
import { nanoid } from "nanoid";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { pg } from "../../db/pg";
import { getCurrentWallet } from "../../auth";
import { sqlStr } from "../raid-shared";
import { HOV_CONTRACT } from "./config";
import { ethAccount, linkedAddress } from "./link";
import { ownerOf } from "./rpc";
import { hovHeroTemplate, planHovHero } from "./hov-hero";

export type HovToken = {
  tokenId: number;
  heroName: string | null;
  image: string | null;
  lirian: boolean;
  /** Уже получен герой (кем угодно). */
  claimed: boolean;
};

/** Привязанный кошелёк и его NFT коллекции (по последнему проходу индекса). */
export const ethHovStatus = createServerFn({ method: "GET" }).handler(async () => {
  const acc = await ethAccount("status");
  const { startHovIndexer } = await import("./hov-index");
  startHovIndexer();
  const address = await linkedAddress(acc);
  if (!address) return { address: null as string | null, tokens: [] as HovToken[], indexedAt: null };
  const rows = ((await mcpExec(
    `SELECT t.token_id, t.hero_name, COALESCE(h.portrait, t.image) AS image, t.lirian, t.owner_at,
            EXISTS (SELECT 1 FROM yuplink.eth_nft_claim c
                     WHERE c.contract = ${sqlStr(HOV_CONTRACT)} AND c.token_id = t.token_id) AS claimed
       FROM yuplink.eth_hov_token t LEFT JOIN yuplink.eth_hov_hero h ON h.hero_name = t.hero_name
      WHERE t.owner = ${sqlStr(address)}
      ORDER BY t.lirian DESC, t.token_id;`,
    { wrapJson: true },
  )) ?? []) as Array<{
    token_id: number;
    hero_name: string | null;
    image: string | null;
    lirian: boolean;
    owner_at: string | null;
    claimed: boolean;
  }>;
  const at = ((await mcpExec(`SELECT max(owner_at) AS at FROM yuplink.eth_hov_token;`, {
    wrapJson: true,
  })) ?? []) as Array<{ at: string | null }>;
  return {
    address,
    indexedAt: at[0]?.at ?? null,
    tokens: rows.map((r) => ({
      tokenId: Number(r.token_id),
      heroName: r.hero_name,
      image: r.image,
      lirian: r.lirian === true,
      claimed: r.claimed === true,
    })),
  };
});

/** Забрать героя за NFT. */
export const ethHovClaim = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ tokenId: z.number().int().min(1).max(1_000_000) }).parse(d))
  .handler(async ({ data }) => {
    const acc = await ethAccount("claim");
    const wallet = getCurrentWallet() ?? "";
    const address = await linkedAddress(acc);
    if (!address) throw new Error("Сначала привяжи Ethereum-кошелёк");
    // Владение — вживую: индекс мог отстать на 10 минут, NFT могли продать.
    if ((await ownerOf(data.tokenId)) !== address) throw new Error("Этот NFT не на твоём кошельке");
    const tok = ((await mcpExec(
      `SELECT t.hero_name, t.race, t.lirian, COALESCE(h.portrait, t.image) AS portrait
         FROM yuplink.eth_hov_token t LEFT JOIN yuplink.eth_hov_hero h ON h.hero_name = t.hero_name
        WHERE t.token_id = ${data.tokenId} LIMIT 1;`,
      { wrapJson: true },
    )) ?? []) as Array<{ hero_name: string | null; race: string | null; lirian: boolean; portrait: string | null }>;
    const plan = tok[0]
      ? planHovHero({
          heroName: tok[0].hero_name,
          nftRace: tok[0].race,
          portrait: tok[0].portrait,
          lirian: tok[0].lirian === true,
        })
      : null;
    if (!plan) throw new Error("Этот NFT ещё не разобран — попробуй через 10 минут");
    const rarity = plan.rarity;
    const tpl = { id: await hovHeroTemplate(plan) };

    // Ключ — номер токена: вторая выдача за тот же NFT упирается в него.
    const got = ((await mcpExec(
      `INSERT INTO yuplink.eth_nft_claim (contract, token_id, account_id, address, rarity, hero_template_id)
       VALUES (${sqlStr(HOV_CONTRACT)}, ${data.tokenId}, ${sqlStr(acc)}, ${sqlStr(address)},
               ${sqlStr(rarity)}, ${sqlStr(tpl.id)})
       ON CONFLICT (contract, token_id) DO NOTHING RETURNING token_id;`,
      { wrapJsonCte: true },
    )) ?? []) as unknown[];
    if (got.length === 0) throw new Error("За этот NFT герой уже получен");

    const itemId = `ugi_${nanoid(10)}`;
    try {
      await pg.userGameItems.insert({
        id: itemId,
        account_id: acc,
        wallet,
        template_id: tpl.id,
        kind: "hero",
        source: "eth_hov",
        obtained_at: new Date().toISOString(),
      });
    } catch (e) {
      // Героя не выдали — NFT снова доступен, иначе он сгорел бы впустую.
      await mcpExec(
        `DELETE FROM yuplink.eth_nft_claim WHERE contract = ${sqlStr(HOV_CONTRACT)} AND token_id = ${data.tokenId};`,
        { wrapJson: false },
      ).catch(() => {});
      throw e;
    }
    await mcpExec(
      `UPDATE yuplink.eth_nft_claim SET item_id = ${sqlStr(itemId)}
        WHERE contract = ${sqlStr(HOV_CONTRACT)} AND token_id = ${data.tokenId};`,
      { wrapJson: false },
    ).catch(() => {});
    return { ok: true as const, rarity, name: plan.name, imageUrl: plan.image, race: plan.race, spec: plan.spec };
  });
