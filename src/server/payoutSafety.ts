// Запись причины фейла NFT-выплаты в строку nft_redemptions + TG-уведомление
// админам о НОВЫХ фейлах (чтобы не заходить в панель, а узнавать сразу).
//
// last_error TEXT + failed_at TIMESTAMPTZ уже существуют в БД (миграция
// add_nft_redemptions_last_error). Здесь — единственный writer этих колонок.
//
// Используется из catch-блоков withdrawMyNfts. best-effort: молча
// проглатывает ошибки записи (это диагностика, не должна валить основной flow).

import { pg } from "./db/pg";

function truncate(s: string, max = 500): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/**
 * Записать last_error+failed_at для перечисленных nft_redemptions.id и
 * уведомить админов в TG о НОВЫХ фейлах. Игнорирует ошибки БД/TG —
 * diagnostics не должна ломать payout flow.
 */
export async function writePayoutError(
  rowIds: string[],
  message: string
): Promise<void> {
  if (rowIds.length === 0) return;

  // НОВЫЕ фейлы = строки, где last_error ещё НЕ стоял. Уведомляем только о них,
  // иначе ретраи резолвера (повторно зовут writePayoutError по тем же id) спамят.
  let newRows: Array<{ nft_title: string | null; user_wallet: string }> = [];
  try {
    const { data } = await pg.nftRedemptions
      .raw()
      .select("nft_title, user_wallet")
      .in("id", rowIds)
      .is("last_error", null);
    newRows = (data ?? []) as Array<{
      nft_title: string | null;
      user_wallet: string;
    }>;
  } catch {
    // не критично — просто не отправим уведомление
  }

  try {
    await pg.nftRedemptions
      .raw()
      .update({
        last_error: truncate(message),
        failed_at: new Date().toISOString(),
      })
      .in("id", rowIds);
  } catch (err) {
    console.warn("[payoutSafety] writePayoutError failed:", err);
  }

  // Уведомляем админов о новых фейлах (best-effort, сгруппировано по NFT).
  if (newRows.length > 0) {
    try {
      const { sendTgMessageToAdmins } = await import("./tg");
      const byTitle = new Map<string, number>();
      for (const r of newRows) {
        const t = r.nft_title ?? "—";
        byTitle.set(t, (byTitle.get(t) ?? 0) + 1);
      }
      const titlesStr = Array.from(byTitle.entries())
        .map(([t, n]) => `• «${t}» ×${n}`)
        .join("\n");
      const wallets = Array.from(new Set(newRows.map((r) => r.user_wallet)));
      const text =
        `⚠️ Не удалось выдать NFT (${newRows.length} шт.) — вероятно, кончился запас приза:\n` +
        `${titlesStr}\n` +
        `Кошельки: ${wallets.slice(0, 8).join(", ")}${
          wallets.length > 8 ? "…" : ""
        }\n\n` +
        `Пополни призовой кошелёк и сними флаги: Админка → Выплаты → Ошибки выдачи NFT.`;
      await sendTgMessageToAdmins(text);
    } catch (err) {
      console.warn("[payoutSafety] notify admins failed:", err);
    }
  }
}
