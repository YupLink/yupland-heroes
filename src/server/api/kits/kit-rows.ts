// Строки наборов из базы → типы админки и витрины. Числа из numeric приезжают
// строками или числами — разбираем защищённо, без веры в форму (ответ лежит у
// игрока в кэше сутки, ПРАВИЛА §11 п.13в). Имя и обложка — у бокса набора.
import { kitLeft, kitPrices, type KitAdminRow, type KitOffer } from "@/lib/kits";

export type KitRow = {
  id: string;
  box_id: string;
  box_count: number | string;
  price_usd: number | string;
  stock: number | string | null;
  per_account: number | string | null;
  sold: number | string;
  active: boolean;
  box_name: string | null;
  box_image: string | null;
  mine?: number | string | null;
};

/** SELECT наборов с их боксом — один на админку и витрину. */
export const kitSelect = (extra = "") => `
  SELECT k.id, k.box_id, k.box_count, k.price_usd, k.stock, k.per_account, k.sold, k.active,
         p.name AS box_name, p.cover_image_url AS box_image${extra}
    FROM yuplink.kit k
    LEFT JOIN yuplink.chip_packs p ON p.id = k.box_id`;

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const numOrNull = (v: unknown): number | null => (v == null || v === "" ? null : num(v));
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

export function toAdminRow(r: KitRow, daraiPerUsd: number | null): KitAdminRow {
  const priceUsd = num(r.price_usd);
  return {
    id: String(r.id),
    boxId: String(r.box_id ?? ""),
    boxName: String(r.box_name ?? r.box_id ?? ""),
    boxImage: text(r.box_image),
    boxCount: num(r.box_count) || 1,
    priceUsd,
    prices: kitPrices(priceUsd, daraiPerUsd),
    stock: numOrNull(r.stock),
    perAccount: numOrNull(r.per_account),
    sold: num(r.sold),
    active: r.active === true,
  };
}

export function toOffer(r: KitRow, daraiPerUsd: number | null): KitOffer {
  const { active: _active, sold, ...rest } = toAdminRow(r, daraiPerUsd);
  return { ...rest, left: kitLeft(rest.stock, sold), mine: num(r.mine) };
}
