// Пиннинг картинок в IPFS через Pinata для минта NFT-фишек.
// Проблема: раньше в metadata.media зашивался ЛОКАЛЬНЫЙ путь (/uploads/tasks/…),
// из-за чего у минченных NFT не было картинки (media должен быть в IPFS).
// Тут пинним арт в Pinata и отдаём gateway-URL как у остальной коллекции
// (https://gateway.dialog-tbot.com/ipfs/<CID>). Кэш — в settings, чтобы пинить
// каждый файл один раз. No-op для пустых и уже-IPFS ссылок.
import { pg } from "./db/pg";

const GATEWAY = (
  process.env.PINATA_GATEWAY || "https://gateway.dialog-tbot.com/ipfs"
).replace(/\/+$/, "");
const ABS_BASE = "https://service.yupland.io";

export async function pinImageToIpfs(
  src: string | null | undefined
): Promise<string> {
  const url = (src ?? "").trim();
  if (!url) return "";
  // Уже IPFS/gateway — не трогаем (идемпотентно).
  if (/^ipfs:\/\//i.test(url) || /\/ipfs\//i.test(url)) return url;

  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    console.warn("[ipfs] PINATA_JWT не задан — media остаётся как есть:", url);
    return url;
  }

  const cacheKey = `ipfs:${url}`;
  const cached = await pg.settings.findOne({ key: cacheKey });
  if (cached?.value) return cached.value;

  const abs = url.startsWith("http")
    ? url
    : `${ABS_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
  const img = await fetch(abs);
  if (!img.ok) throw new Error(`[ipfs] не скачать арт ${abs}: ${img.status}`);
  const buf = await img.arrayBuffer();
  const name = abs.split("/").pop()?.split("?")[0] || "chip.png";
  const type = img.headers.get("content-type") || "image/png";

  const fd = new FormData();
  fd.append("file", new Blob([buf], { type }), name);
  fd.append("pinataMetadata", JSON.stringify({ name }));

  const up = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: fd,
  });
  if (!up.ok) {
    throw new Error(`[ipfs] Pinata pin failed: ${up.status} ${await up.text()}`);
  }
  const j = (await up.json()) as { IpfsHash?: string };
  if (!j.IpfsHash) throw new Error("[ipfs] Pinata не вернул IpfsHash");

  const out = `${GATEWAY}/${j.IpfsHash}`;
  await pg.settings.upsert({ key: cacheKey, value: out }, { onConflict: "key" });
  return out;
}
