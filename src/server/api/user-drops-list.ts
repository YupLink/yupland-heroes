import { createServerFn } from "@tanstack/react-start";
import { pg, type PgCollectionTitle } from "../db/pg";
import { getCurrentWallet, isAdminWallet } from "../auth";
import { parseRewardTiers } from "../random";
import { fetchPackNames, hydratePackNames, collectPackIds } from "./pack-names";

// ─── listAllActiveDrops ───────────────────────────────────────────────

/**
 * Дроп считается NFT-наградным если:
 *  - reward_kind = 'nft' (старая модель с pool), ИЛИ
 *  - в reward_tiers есть tier с kind='nft' или kind='pack' (приз-пак, чаще
 *    всего внутри только NFT).
 * Такие дропы скрываем от не-админов (пока тестируем).
 */
export function isNftRewardDrop(d: {
  reward_kind: string | null;
  reward_tiers: string | null;
}): boolean {
  if (d.reward_kind === "nft") return true;
  if (!d.reward_tiers) return false;
  try {
    const tiers = JSON.parse(d.reward_tiers) as Array<{ kind?: string }>;
    return tiers.some((t) => t.kind === "nft" || t.kind === "pack");
  } catch {
    return false;
  }
}

export const listAllActiveDrops = createServerFn({ method: "GET" }).handler(
  async () => {
    const wallet = getCurrentWallet();
    let drops = await pg.campaigns.findMany(
      { status: "active" },
      { orderBy: { column: "created_at", ascending: false } }
    );
    // Chip-target дропы — admin-only (early access).
    if (!isAdminWallet(wallet)) {
      drops = drops.filter((d) => !d.chip_collection_id);
    }
    if (drops.length === 0) return [];

    type Req = { title: string; count: number };
    const allTitles = new Set<string>();
    const dropsParsed = drops.map((d) => {
      let reqs: Req[] | null = null;
      if (d.mode === "combo" && d.requirements) {
        try {
          reqs = JSON.parse(d.requirements) as Req[];
        } catch {
          reqs = null;
        }
      }
      if (reqs) {
        for (const r of reqs) allTitles.add(`${d.contract_id}::${r.title}`);
      } else {
        allTitles.add(`${d.contract_id}::${d.name}`);
      }
      return { d, reqs };
    });

    // Подтягиваем preview-image+count из collection_titles одной выборкой.
    const titleArr = Array.from(allTitles).map((k) => {
      const [contractId, title] = k.split("::");
      return { contractId, title };
    });
    const ctRowsRaw =
      ((
        await pg.collectionTitles
          .raw()
          .select("*")
          .in(
            "title",
            titleArr.map((t) => t.title)
          )
      ).data as PgCollectionTitle[]) ?? [];
    const ctMap = new Map(
      ctRowsRaw.map((r) => [`${r.contract_id}::${r.title}`, r])
    );

    // Hydrate pack names for pack-tiers (чтобы карточка не показывала "0 HOPE").
    const parsedTiersByDrop = new Map<string, ReturnType<typeof parseRewardTiers>>();
    for (const { d } of dropsParsed) {
      parsedTiersByDrop.set(d.id, parseRewardTiers(d.reward_tiers));
    }
    const packNameById = await fetchPackNames(
      collectPackIds(parsedTiersByDrop.values())
    );

    return dropsParsed.map(({ d, reqs }) => {
      const primaryTitle = reqs && reqs.length > 0 ? reqs[0].title : d.name;
      const ct = ctMap.get(`${d.contract_id}::${primaryTitle}`);
      const requirementsWithMeta =
        reqs?.map((r) => {
          const rct = ctMap.get(`${d.contract_id}::${r.title}`);
          return {
            title: r.title,
            count: r.count,
            image: rct?.image ?? null,
            collectionCount: rct?.count ?? 0,
          };
        }) ?? null;
      const tiers = parsedTiersByDrop.get(d.id) ?? null;
      const tiersHydrated = hydratePackNames(tiers, packNameById);
      return {
        id: d.id,
        // Дедлайн = created_at + 30 дней (жизнь дропа) — для таймера в карточке.
        expiresAt: d.created_at
          ? new Date(
              new Date(d.created_at).getTime() + 30 * 24 * 60 * 60 * 1000
            ).toISOString()
          : null,
        title: d.name,
        contractId: d.contract_id,
        mode: d.mode as "simple" | "combo",
        rewardMin: d.reward_min,
        rewardMax: d.reward_max,
        rewardToken: d.reward_token,
        rewardTiers: tiersHydrated,
        freeClaim: d.free_claim,
        previewImage: ct?.image ?? null,
        collectionCount: ct?.count ?? 0,
        requirements: requirementsWithMeta,
      };
    });
  }
);
