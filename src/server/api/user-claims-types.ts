import { normalizeTitle } from "@/lib/normalizeTitle";
import {
  fetchSendlerNftsByOwner,
  fetchSendlerNftsByTitle,
} from "../sendler";
import { pg, type PgCampaign, type PgNft } from "../db/pg";
import { mcpExec } from "../db/mcpClient";

// ─── Types ────────────────────────────────────────────────────────────

export type SendlerLite = {
  token_id: string;
  title?: string;
  media?: string;
  owner_id?: string;
};
export type OwnedIndex = Map<string, Map<string, SendlerLite[]>>;
export type InventoryByContract = Map<string, SendlerLite[]>;
export type TicketsResult = {
  total: number;
  used: number;
  available: number;
  availableRaw: number;
  earnedFromReferrals: number;
  earnedFromTasks: number;
  earnedFromTicketEvents: number;
  earnedFromPurchases: number;
};

// ─── Constants ────────────────────────────────────────────────────────

export const NFT_PRIZE_OWNER = "darai_gdrop.near";
export const SISTER_TTL_MS = 60_000;
export { TICKETS_TTL_MS } from "./tickets-cache";
export const INVENTORY_TTL_MS = 60_000;

// ─── Module-level caches ──────────────────────────────────────────────

export const _sisterCache = new Map<string, { value: string[]; at: number }>();
export { _ticketsCache } from "./tickets-cache";
export const nftsForOwnerCache = new Map<
  string,
  { at: number; data: Array<{ token_id: string; title: string; media: string }> }
>();
export const inventoryCache = new Map<
  string,
  { at: number; data: SendlerLite[] }
>();
export const freeNftCache = new Map<
  string,
  { at: number; tokens: Array<{ tokenId: string; image: string }> }
>();
