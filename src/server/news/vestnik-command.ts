// Команда /vestnik игрового бота: админ пишет её в чате игроков — газета дня
// начинает выходить туда; «/vestnik stop» — перестаёт. Остальным — тишина:
// чужая команда в группе не должна ни отвечать, ни что-то менять.
import { gameBotSend, gamePlayButton } from "@/server/tgGameBot";
import { chatFor, setChat } from "./vestnik-publish";

/** Админы по Telegram — тот же список, что у входа в админку (auth.ts). */
export function isAdminTg(
  id: number,
  env: string | undefined = process.env.ADMIN_TG_ACCOUNTS,
): boolean {
  return (env ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .some((n) => Number.isSafeInteger(n) && n > 0 && n === id);
}

/** Команда ли это газеты: «/vestnik», «/vestnik@бот», с «stop» или без. */
export function parseVestnik(text: string): "on" | "stop" | null {
  const m = /^\/vestnik(?:@\w+)?(?:\s+(\w+))?\s*$/i.exec(text.trim());
  if (!m) return null;
  return m[1]?.toLowerCase() === "stop" ? "stop" : "on";
}

/** true — команда газеты (обработана или молча отклонена). */
export async function handleVestnikCommand(
  text: string,
  fromId: number,
  chatId: number,
  chatType: string | undefined,
): Promise<boolean> {
  const cmd = parseVestnik(text);
  if (!cmd) return false;
  const group = chatType === "group" || chatType === "supergroup";
  if (!group || !isAdminTg(fromId)) return true;
  // «stop» выключает только этот чат: из чужой группы газету не остановить.
  if (cmd === "stop" && (await chatFor("day")) !== chatId) return true;
  await setChat("day", cmd === "stop" ? null : chatId);
  await gameBotSend(
    chatId,
    cmd === "stop"
      ? "«Вестник героев» больше не выходит в этом чате."
      : "Готово: «Вестник героев» будет выходить здесь каждый день в 10:00 по Москве.",
    gamePlayButton("Играть"),
  ).catch(() => false);
  return true;
}
