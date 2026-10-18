// Сжигание NFT коллекции (страница /burn): список того, что кошелёк может сжечь.
//
// Читаем прямо с контракта (nft_tokens_for_owner), а не из индексера Sendler:
// индексер отстаёт — только что сожжённый токен он ещё показывает, а
// nft_batch_burn с таким токеном падает целиком. К тому же у кошелька
// коллекции ~8 тыс. NFT, и Sendler отдавал их 80 с страницами по 200;
// контракт отдаёт по 1000 за вызов, страницы идут параллельно.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCurrentAccountId, getCurrentWallet } from "../auth";
import { nearRpc } from "../rpc";
import { rateGate } from "../rateGate";

export const BURN_NFT_CONTRACT = "yuplandshop.mintbase1.near";

const NEAR_ACCOUNT_RE = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const PAGE = 1000;
const PARALLEL = 8;
const MAX_TOKENS = 50_000;

export type BurnGroup = {
  title: string;
  media: string;
  /** По возрастанию номера: первыми уходят самые старые копии. */
  tokenIds: string[];
};

type ChainToken = { token_id: string; metadata?: { title?: string | null; media?: string | null } };

async function view<T>(method: string, args: object): Promise<T> {
  const r = await nearRpc<{ result?: number[] }>("query", {
    request_type: "call_function",
    finality: "optimistic",
    account_id: BURN_NFT_CONTRACT,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  const bytes = r.result?.result;
  if (!bytes) throw new Error("burn.err_load");
  return JSON.parse(Buffer.from(bytes).toString("utf8")) as T;
}

/** Все NFT кошелька на контракте — с блокчейна, страницами по PAGE. */
async function fetchOwnedTokens(owner: string): Promise<ChainToken[]> {
  const supply = Math.min(
    Number(await view<string>("nft_supply_for_owner", { account_id: owner })) || 0,
    MAX_TOKENS,
  );
  const starts: number[] = [];
  for (let i = 0; i < supply; i += PAGE) starts.push(i);
  const pages: ChainToken[][] = [];
  for (let i = 0; i < starts.length; i += PARALLEL) {
    const wave = starts.slice(i, i + PARALLEL).map((from) =>
      view<ChainToken[]>("nft_tokens_for_owner", {
        account_id: owner,
        from_index: String(from),
        limit: PAGE,
      }),
    );
    pages.push(...(await Promise.all(wave)));
  }
  return pages.flat();
}

export function groupBurnable(tokens: ChainToken[]): BurnGroup[] {
  const byTitle = new Map<string, BurnGroup>();
  const seen = new Set<string>();
  for (const tok of tokens) {
    // Пока листали страницы, набор мог сдвинуться — дубли отбрасываем.
    if (seen.has(tok.token_id)) continue;
    seen.add(tok.token_id);
    const title = (tok.metadata?.title ?? "").trim() || `#${tok.token_id}`;
    let g = byTitle.get(title);
    if (!g) {
      g = { title, media: tok.metadata?.media ?? "", tokenIds: [] };
      byTitle.set(title, g);
    }
    g.tokenIds.push(tok.token_id);
  }
  const groups = [...byTitle.values()];
  for (const g of groups) g.tokenIds.sort((a, b) => Number(a) - Number(b));
  // Сверху — чего больше всего (так жгут чаще всего), при равенстве — по названию.
  return groups.sort(
    (a, b) => b.tokenIds.length - a.tokenIds.length || a.title.localeCompare(b.title),
  );
}

export const listBurnableNfts = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ owner: z.string().regex(NEAR_ACCOUNT_RE, "burn.err_owner") }).parse(d),
  )
  .handler(async ({ data }) => {
    const who = getCurrentAccountId() ?? getCurrentWallet();
    if (!who) throw new Error("burn.err_auth");
    // Кошелёк коллекции — ~10 RPC-вызовов за раз; пул RPC общий с выплатами.
    await rateGate(`burn-list:${who}`, { limit: 8, windowMs: 60_000 });
    const tokens = await fetchOwnedTokens(data.owner);
    return { contract: BURN_NFT_CONTRACT, groups: groupBurnable(tokens) };
  });
