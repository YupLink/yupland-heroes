// Публичные узлы Ethereum: владелец токена (ownerOf) по одному и пачкой, tokenURI.
// Пачка — JSON-RPC batch; не ответил узел — следующий из ETH_RPC.
import { ETH_RPC, HOV_CONTRACT } from "./config";

type RpcReq = { jsonrpc: "2.0"; id: number; method: string; params: unknown[] };
type RpcRes = { id: number; result?: string; error?: { message?: string } };

const pad = (n: number) => n.toString(16).padStart(64, "0");
const callReq = (id: number, data: string): RpcReq => ({
  jsonrpc: "2.0",
  id,
  method: "eth_call",
  params: [{ to: HOV_CONTRACT, data }, "latest"],
});

async function post(body: RpcReq | RpcReq[]): Promise<RpcRes | RpcRes[]> {
  let last: unknown = null;
  for (const url of ETH_RPC) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as RpcRes | RpcRes[];
      if (Array.isArray(body) && !(Array.isArray(json) && json.some((x) => x.result))) {
        throw new Error("пачка без ответов");
      }
      return json;
    } catch (e) {
      last = e;
    }
  }
  throw new Error(`Сеть Ethereum не отвечает: ${last instanceof Error ? last.message : last}`);
}

/** Адрес из 32-байтового слова ответа; null — токена нет (revert). */
export const wordToAddress = (hex: string | undefined): string | null =>
  hex && hex.length >= 66 ? `0x${hex.slice(-40).toLowerCase()}` : null;

/** Владелец одного токена прямо сейчас; null — токена нет. */
export async function ownerOf(tokenId: number): Promise<string | null> {
  const res = (await post(callReq(1, `0x6352211e${pad(tokenId)}`))) as RpcRes;
  if (res.error) return null;
  return wordToAddress(res.result);
}

/** Владельцы пачки токенов: Map номер → адрес (несуществующих в ответе нет). */
export async function ownersOf(ids: number[]): Promise<Map<number, string>> {
  const res = (await post(ids.map((id) => callReq(id, `0x6352211e${pad(id)}`)))) as RpcRes[];
  const out = new Map<number, string>();
  for (const r of res) {
    const a = wordToAddress(r.result);
    if (a) out.set(Number(r.id), a);
  }
  return out;
}

/** Строка из ABI-ответа (offset, length, bytes). */
export function decodeString(hex: string): string {
  const h = hex.replace(/^0x/, "");
  if (h.length < 128) return "";
  const len = parseInt(h.slice(64, 128), 16);
  const bytes = h.slice(128, 128 + len * 2).match(/../g) ?? [];
  return new TextDecoder().decode(new Uint8Array(bytes.map((b) => parseInt(b, 16))));
}

/** Карточка токена: имя героя, картинка, редкость — из tokenURI. */
export async function tokenMeta(
  tokenId: number,
): Promise<{ heroName: string | null; image: string | null; rarity: string | null; race: string | null } | null> {
  const res = (await post(callReq(1, `0xc87b56dd${pad(tokenId)}`))) as RpcRes;
  if (res.error || !res.result) return null;
  const uri = decodeString(res.result);
  if (!/^https:\/\//.test(uri)) return null;
  const r = await fetch(uri, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) return null;
  const d = (await r.json()) as {
    image?: string;
    attributes?: Array<{ trait_type?: string; value?: unknown }>;
  };
  const at = (k: string) => {
    const v = d.attributes?.find((a) => a.trait_type === k)?.value;
    return typeof v === "string" ? v : null;
  };
  return { heroName: at("Hero Name"), image: d.image ?? null, rarity: at("Rarity"), race: at("Race") };
}
