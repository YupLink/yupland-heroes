// Отдельное подключение кошелька для /storage — сессию приложения не трогает.
//
// Коннектор HOT хранит выбранный кошелёк в localStorage («selected-wallet»), а
// сам кошелёк-песочница — под ключами «<id кошелька>:…». Второй коннектор с
// теми же id делил бы с приложением одну сессию: подключил здесь
// darai_collection.near — и всё приложение оказалось бы под ним. Поэтому у
// этого коннектора свой префикс и в хранилище, и в id кошельков.
import type { NearConnector as NearConnectorType, WalletManifest } from "@hot-labs/near-connect";
import { pageNonce } from "@/lib/csp/pageNonce";

const PREFIX = "yl-storage";

// Те же списки кошельков, что коннектор берёт по умолчанию.
const MANIFESTS = [
  "https://raw.githubusercontent.com/hot-dao/near-selector/refs/heads/main/repository/manifest.json",
  "https://cdn.jsdelivr.net/gh/azbang/hot-connector/repository/manifest.json",
];

type Manifest = { version: string; wallets: WalletManifest[] };

const storage = {
  get: async (k: string) => localStorage.getItem(`${PREFIX}:${k}`),
  set: async (k: string, v: string) => localStorage.setItem(`${PREFIX}:${k}`, v),
  remove: async (k: string) => localStorage.removeItem(`${PREFIX}:${k}`),
};

async function loadManifest(): Promise<Manifest> {
  for (const url of MANIFESTS) {
    const r = await fetch(url).catch(() => null);
    if (r?.ok) return (await r.json()) as Manifest;
  }
  throw new Error("storage.err_wallets");
}

/** Кошелёк из нашего списка (с префиксом), а не из рамки Telegram или расширения. */
export function isOwnWallet(id: string | undefined): boolean {
  return !!id?.startsWith(`${PREFIX}.`);
}

/** Забыть выбор на этой странице, не выходя из самого кошелька. */
export function forgetWallet(): void {
  localStorage.removeItem(`${PREFIX}:selected-wallet`);
}

let instance: Promise<NearConnectorType> | null = null;

/** Коннектор страницы /storage. null — на сервере (SSR). */
export async function getStorageConnector(): Promise<NearConnectorType | null> {
  if (typeof window === "undefined") return null;
  instance ??= Promise.all([import("@hot-labs/near-connect"), loadManifest()])
    .then(
      ([{ NearConnector }, m]) =>
        new NearConnector({
          network: "mainnet",
          // Кошелёк из рамки Telegram подключился бы сам — здесь только по кнопке.
          autoConnect: false,
          cspNonce: pageNonce(),
          storage,
          manifest: {
            version: m.version,
            wallets: m.wallets.map((w) => ({ ...w, id: `${PREFIX}.${w.id}` })),
          },
        }),
    )
    .catch((e: unknown) => {
      instance = null; // упавшая подгрузка не должна залипать навсегда
      throw e;
    });
  return instance;
}
