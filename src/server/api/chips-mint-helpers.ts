// Shared helpers for chips-mint-* modules: константы, auth, title NFT-фишки, карта
// title → шаблон (нужна вводу NFT). Вывод фишки в NFT (цена, склад, доминт)
// удалён словом владельца 17.10.2026.
import { pg } from "../db/pg";
import { getCurrentWallet, isAdminWallet } from "../auth";
import { assertNotMaintenance } from "../maintenance";

export function requireAdmin(): string {
  const w = getCurrentWallet();
  if (!w || !isAdminWallet(w)) throw new Error("Только админ");
  return w;
}

export function requireWallet(): string {
  const w = getCurrentWallet();
  if (!w) throw new Error("Кошелёк не подключён");
  assertNotMaintenance(w);
  return w;
}

export function levelKey(lvl: number): string {
  return Number.isInteger(lvl) ? String(lvl) : lvl.toFixed(1);
}

export const DARAI_FT_CONTRACT = "darai.tkn.near";
export const STORE_NFT_CONTRACT = "yuplandshop.mintbase1.near";
export const CHIP_MINT_RECIPIENT = "darai_gdrop.near";
export const ALL_CHIP_LEVELS = [3, 3.5, 4, 4.5, 5];

export function buildChipNftTitle(
  templateNo: number,
  collectionName: string,
  level: number
): string {
  const base = Math.floor(level);
  const isPlus = Math.round(level * 2) % 2 === 1;
  return `#${templateNo} ${collectionName.trim()} (${base} Stars${isPlus ? "+" : ""})`;
}

// ──────── Mint mapping (читает ввод NFT) ────────

export type MintMapEntry = { contract: string; title: string };

export async function getMintMap(): Promise<Record<string, MintMapEntry>> {
  const row = await pg.settings.findOne({ key: "chip_mint_map" });
  if (!row?.value) return {};
  try {
    return JSON.parse(row.value) as Record<string, MintMapEntry>;
  } catch {
    return {};
  }
}

// ──────── Mint spend (учёт DARAI в computeDaraiBalance, только чтение) ────────

export async function getMintSpend(wallet: string): Promise<number> {
  const row = await pg.settings.findOne({ key: `mintspend:${wallet}` });
  const v = row?.value ? Number(row.value) : 0;
  return Number.isFinite(v) && v > 0 ? v : 0;
}
