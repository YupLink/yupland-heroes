// Переход по реферальной ссылке (/start ref<id>) — строка в ref_click
// (migrations/ref-03): игровой и кошельковый боты. Для статистики «переходы →
// привязки → траты» в «$ Экономика → Рефералы». Best-effort: бот отвечает в любом
// случае, сбой записи — только в лог.
import { mcpExec } from "./db/mcpClient";

export async function noteRefClick(
  inviterTg: string | number,
  friendTg: number,
  bot: "game" | "wallet",
): Promise<void> {
  const inv = Number(inviterTg);
  if (!Number.isSafeInteger(inv) || !Number.isSafeInteger(friendTg) || inv <= 0 || friendTg <= 0)
    return;
  await mcpExec(
    `INSERT INTO yuplink.ref_click (inviter_tg, friend_tg, bot) VALUES (${inv}, ${friendTg}, '${bot}');`,
  ).catch((e: unknown) =>
    console.warn("[ref-click] не записан:", e instanceof Error ? e.message : e),
  );
}
