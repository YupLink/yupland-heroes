import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCurrentWallet, requireAdmin } from "../auth";
import { tgBroadcast, tgBroadcastPhoto } from "../tg";
import { normalizeTitle } from "@/lib/normalizeTitle";
import { pg } from "../db/pg";
import { teamOwnerWallet } from "../team";

export const SENDLER_DEFAULT_CONTRACT = "yuplandshop.mintbase1.near";

export function fireBroadcast(text: string) {
  tgBroadcast(text).catch((err) => {
    console.warn("tgBroadcast failed:", err);
  });
}

/**
 * Fire-and-forget broadcast с прикреплённым фото.
 * Если photoUrl=null — фолбэк на text-only.
 */
export function fireBroadcastPhoto(photoUrl: string | null, caption: string) {
  tgBroadcastPhoto(photoUrl, caption).catch((err) => {
    console.warn("tgBroadcastPhoto failed:", err);
  });
}

/**
 * Найти URL картинки NFT по title (через кэш collection_titles).
 * Используется для прикрепления превью в broadcast-уведомлениях о дропах.
 * Возвращает null если ничего не нашли — fallback на text-only broadcast.
 */
export async function findNftImageForTitle(
  contractId: string,
  title: string
): Promise<string | null> {
  try {
    const cached = await pg.collectionTitles.findOne({
      id: `${contractId}:${normalizeTitle(title)}`,
    });
    return cached?.image ?? null;
  } catch (err) {
    console.warn("[findNftImageForTitle]", err);
    return null;
  }
}

/**
 * Админы для которых рассылка о НОВОМ дропе подавляется (по умолчанию — владелец).
 */
const SILENT_DROP_BROADCAST_WALLETS = new Set(
  (process.env.SILENT_DROP_BROADCAST_WALLETS ?? teamOwnerWallet())
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

export function shouldBroadcastNewDrop(): boolean {
  const w = (getCurrentWallet() ?? "").toLowerCase();
  return !SILENT_DROP_BROADCAST_WALLETS.has(w);
}

/**
 * Точечный admin-only broadcast произвольного текста всем юзерам с
 * включёнными нотификациями (notifications_enabled=true в users).
 */
export const adminBroadcastMessage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ text: z.string().min(3).max(2000) }).parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    return await tgBroadcast(data.text);
  });
