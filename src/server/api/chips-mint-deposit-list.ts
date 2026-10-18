// NFT deposit: input info, list depositable, orphan reconcile.
//
// Список «Ввести NFT в игру» опирается на круги NFT (nft-cycle.ts): выведенная
// фишка узнаётся по привязке открытого круга, а прячется NFT только тогда, когда
// мы уже зачли её ввод ПОСЛЕ того, как игрок её получил (индекс Sendler просто
// не догнал). Вечных «этот номер уже отработан» больше нет.
import { createServerFn } from "@tanstack/react-start";
import { pg } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { isChipNftTitle, resolvePackForNftTitle } from "./chips-mint-deposit-helpers";
import { hiddenTokens, openBindings } from "./nft-cycle-read";
import { rowTimeMs } from "@/lib/sendlerTime";
import { STORE_NFT_CONTRACT, CHIP_MINT_RECIPIENT } from "./chips-mint-helpers";
import {
  getMintReverseMap,
  getPackInputReverseMap,
  packInputKey,
  stripLeadCount,
} from "./chips-mint-deposit-helpers";
export const getNftInputInfo = createServerFn({ method: "GET" }).handler(async () => {
  const w = getCurrentWallet();
  if (!w) throw new Error("Нужно подключить кошелёк");
  return { receiverId: CHIP_MINT_RECIPIENT, storeContract: STORE_NFT_CONTRACT };
});
export type DepositableNftItem =
  | {
      rewardType: "chip";
      contract: string;
      tokenId: string;
      title: string;
      templateId: string;
      level: number;
      templateName: string;
      imageUrl: string | null;
    }
  | {
      rewardType: "pack";
      contract: string;
      tokenId: string;
      title: string;
      packId: string;
      packName: string;
      imageUrl: string | null;
    };
export const listMyDepositableNfts = createServerFn({ method: "GET" }).handler(
  async (): Promise<DepositableNftItem[]> => {
    const wallet = getCurrentWallet();
    if (!wallet) return [];
    const chipRev = await getMintReverseMap();
    const packMap = await getPackInputReverseMap();
    if (chipRev.size === 0 && packMap.size === 0) return [];
    const tplIds = Array.from(new Set([...chipRev.values()].map((v) => v.templateId)));
    const tplMap = new Map<string, { id: string; name: string; image_url: string }>();
    if (tplIds.length > 0) {
      const { data: tplRows } = await pg.chipTemplates
        .raw()
        .select("id,name,image_url")
        .in("id", tplIds);
      for (const t of (tplRows ?? []) as Array<{
        id: string;
        name: string;
        image_url: string;
      }>) {
        tplMap.set(t.id, t);
      }
    }

    const packIds = Array.from(new Set([...packMap.values()]));
    const packLookup = new Map<
      string,
      { id: string; name: string; cover_image_url: string | null; kind?: string | null }
    >();
    if (packIds.length > 0) {
      const { data: packRows } = await pg.chipPacks
        .raw()
        .select("id,name,cover_image_url,kind")
        .in("id", packIds);
      for (const p of (packRows ?? []) as Array<{
        id: string;
        name: string;
        cover_image_url: string | null;
        kind?: string | null;
      }>) {
        packLookup.set(p.id, p);
      }
    }

    const chipContracts = [...chipRev.values()].map((v) => v.contract);
    const packContracts = [...packMap.keys()].map((k) => k.split("::")[0]);
    const contracts = Array.from(new Set([...chipContracts, ...packContracts]));

    const out: DepositableNftItem[] = [];
    for (const contract of contracts) {
      let nfts: Awaited<ReturnType<typeof import("../sendler").fetchSendlerNftsByOwner>> = [];
      try {
        const { fetchSendlerNftsByOwner } = await import("../sendler");
        nfts = await fetchSendlerNftsByOwner(contract, wallet);
      } catch {
        continue;
      }
      // Разом узнаём, какие из этих NFT — выведенные фишки (открытый круг с
      // привязкой: вид и номер фишки, которая вернётся).
      const mintedByToken = await openBindings(
        contract,
        nfts.map((x) => String(x.token_id ?? "")).filter(Boolean),
      );

      // Сначала собираем кандидатов, и только потом одним запросом вычитаем
      // уже отработанные токены: индекс владения Sendler отстаёт от перевода,
      // и без этой отсечки только что введённая NFT снова висела в списке.
      const candidates: DepositableNftItem[] = [];
      for (const n of nfts) {
        const title = (n.title ?? "").trim();
        if (!title || !n.token_id) continue;
        const key = `${contract}::${title}`;

        // Сначала — индекс минтов: это ФАКТ, что токен когда-то был фишкой
        // игрока. Иначе фишка «#1 Market Pack (5 Stars)» попадала в паки,
        // потому что коллекция фишек и пак называются одинаково.
        // Явная связка админа под это имя = сознательный обмен фишки на пак.
        // packMap уже в памяти — лишних запросов не делаем.
        const adminPackId = packMap.get(key) ?? null;
        const minted = adminPackId ? undefined : mintedByToken.get(String(n.token_id));
        if (minted) {
          // Шаблон мог не попасть в предзагрузку (она идёт по карте названий) —
          // дочитываем точечно, иначе фишка показалась бы без имени и картинки.
          if (!tplMap.has(minted.templateId)) {
            const t = await pg.chipTemplates.findOne({ id: minted.templateId });
            if (t) {
              tplMap.set(minted.templateId, {
                id: t.id,
                name: t.name,
                image_url: t.image_url,
              });
            }
          }
          const tpl = tplMap.get(minted.templateId);
          candidates.push({
            rewardType: "chip",
            contract,
            tokenId: n.token_id,
            title,
            templateId: minted.templateId,
            level: Number(minted.level ?? 1),
            templateName: tpl?.name ?? title,
            imageUrl: tpl?.image_url || n.media || null,
          });
          continue;
        }

        // Страховка для старых минтов, которых нет в индексе: имя в формате
        // «… (N Stars)» — это фишка, паком её не показываем ни при какой
        // связке в карте.
        const packId =
          adminPackId ??
          (isChipNftTitle(title)
            ? null
            : (packMap.get(key) ??
              packMap.get(packInputKey(contract, stripLeadCount(title).base)) ??
              (await resolvePackForNftTitle(contract, title))));
        if (packId) {
          // Связка могла родиться только что (авто-сопоставление по названию),
          // и в предзагрузку пак не попал — дочитываем точечно, иначе игрок
          // видел безымянный «Пак» вместо настоящего названия.
          if (!packLookup.has(packId)) {
            const fresh = await pg.chipPacks.findOne({ id: packId });
            if (fresh) {
              packLookup.set(packId, {
                id: fresh.id,
                name: fresh.name,
                cover_image_url: fresh.cover_image_url ?? null,
                kind: (fresh as { kind?: string | null }).kind ?? null,
              });
            }
          }
          const p = packLookup.get(packId);
          candidates.push({
            rewardType: "pack",
            contract,
            tokenId: n.token_id,
            title,
            packId,
            packName: p?.name ?? "Пак",
            imageUrl: p?.cover_image_url ?? n.media ?? null,
          });
          continue;
        }

        const m = chipRev.get(key);
        if (m) {
          const tpl = tplMap.get(m.templateId);
          candidates.push({
            rewardType: "chip",
            contract,
            tokenId: n.token_id,
            title,
            templateId: m.templateId,
            level: m.level,
            templateName: tpl?.name ?? title,
            imageUrl: tpl?.image_url ?? n.media ?? null,
          });
        }
      }

      // Прячем только только что введённое: круг закрыт нашим вводом позже, чем
      // игрок получил NFT, — индекс владения просто не догнал.
      const since = new Map(nfts.map((n) => [String(n.token_id), rowTimeMs({ block_timestamp: n.last_updated_at })]));
      const hidden = await hiddenTokens(
        contract,
        candidates.map((c) => ({ tokenId: c.tokenId, holderSinceMs: since.get(c.tokenId) ?? null })),
      );
      for (const c of candidates) if (!hidden.has(c.tokenId)) out.push(c);
    }
    return out;
  },
);

// Крон-догон пак-NFT переехал в свой модуль (§13.1) — ре-экспорт для импортов.
export { runNftInputOrphanReconcile } from "./chips-mint-reconcile-pack";
