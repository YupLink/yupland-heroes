import { createServerFn } from "@tanstack/react-start";
import { nanoid } from "nanoid";
import { z } from "zod";
import { pg } from "../db/pg";
import { getCurrentWallet, getSessionTgId } from "../auth";
import { isGoogleTg } from "@/lib/auth/googleTg";
import { assertNotMaintenance } from "../maintenance";
import { requireLinkedTelegram } from "./user-claims-inventory";
import { getSisterWallets } from "./user-claims-core";

// Google-игрок (§8.91) не в Telegram — подписки на каналы ему не показываем:
// проверить их нечем, а «гнать через Телеграм» его нельзя (владелец).
const forSession = <T extends { kind: string }>(tasks: T[]): T[] =>
  isGoogleTg(getSessionTgId()) ? tasks.filter((t) => t.kind !== "tg_channel") : tasks;

export const listMyTasks = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  const allTasks = forSession(
    await pg.tasks.findMany({ active: true }, { orderBy: { column: "created_at", ascending: false } }),
  );

  if (!wallet) {
    return allTasks.map((t) => ({ ...t, completed: false }));
  }

  const taskSisters = await getSisterWallets(wallet);
  const { data: myDone } = await pg.taskCompletions
    .raw()
    .select("task_id")
    .in("wallet", taskSisters);
  const doneSet = new Set((myDone ?? []).map((r) => (r as { task_id: string }).task_id));

  return allTasks.map((t) => ({ ...t, completed: doneSet.has(t.id) }));
});

export const verifyTaskCompletion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ taskId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    assertNotMaintenance();
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    await requireLinkedTelegram(wallet);

    const task = await pg.tasks.findOne({ id: data.taskId });
    if (!task || forSession([task]).length === 0) throw new Error("Задание не найдено");
    if (!task.active) throw new Error("Задание не активно");

    const existing = await pg.taskCompletions.findFirst({
      task_id: data.taskId,
      wallet,
    });
    if (existing) {
      return { alreadyDone: true };
    }

    if (task.kind === "tg_channel") {
      const u = await pg.users.findOne({ wallet });
      const tgId = u?.telegram_id;
      if (!tgId) throw new Error("Telegram не привязан");

      const targetRaw = task.target?.trim();
      if (!targetRaw) throw new Error("В задании не указан канал");

      let chatId = targetRaw;
      if (chatId.startsWith("https://t.me/")) {
        chatId = "@" + chatId.slice("https://t.me/".length).split(/[/?#]/)[0];
      } else if (chatId.startsWith("t.me/")) {
        chatId = "@" + chatId.slice("t.me/".length).split(/[/?#]/)[0];
      } else if (!chatId.startsWith("@") && !chatId.startsWith("-")) {
        chatId = "@" + chatId;
      }

      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) throw new Error("Бот не сконфигурирован");

      const url = new URL(`https://api.telegram.org/bot${botToken}/getChatMember`);
      url.searchParams.set("chat_id", chatId);
      url.searchParams.set("user_id", String(tgId));
      const res = await fetch(url.toString());
      const json = (await res.json()) as {
        ok: boolean;
        description?: string;
        result?: { status?: string };
      };
      if (!json.ok) {
        const desc = json.description ?? "ошибка API";
        const botName = process.env.TELEGRAM_BOT_USERNAME ?? "yuplink_bot";
        if (/member list is inaccessible|chat_admin_required|bot is not a member/i.test(desc)) {
          throw new Error(
            `Админу нужно добавить @${botName} в канал ${chatId} как администратора. Telegram: ${desc}`,
          );
        }
        if (/chat not found|chat_not_found/i.test(desc)) {
          throw new Error(`Канал ${chatId} не найден. Проверь @username в задании.`);
        }
        if (/user not found|user_not_found/i.test(desc)) {
          throw new Error("Бот не видит твой Telegram-аккаунт. Напиши /start в @" + botName);
        }
        throw new Error(`Не удалось проверить подписку: ${desc}`);
      }
      const status = json.result?.status;
      if (status !== "creator" && status !== "administrator" && status !== "member") {
        throw new Error("Ты ещё не подписан на канал. Подпишись и нажми «Проверить» снова.");
      }
    }

    await pg.taskCompletions.insert({
      id: nanoid(),
      task_id: data.taskId,
      wallet,
    });

    // Награда за задание — золото, 100 за прежний билет (§8.61). ref привязан к
    // АККАУНТУ, а не к кошельку: вторая «сестра» того же Telegram иначе
    // получила бы награду повторно.
    const { accAccountId } = await import("./currency/move");
    const acc = await accAccountId(wallet);
    // До 20.10 эта же награда шла билетами под тем же ключом: если аккаунт её
    // уже получил (с другой «сестры»), золото второй раз не начисляется.
    const ref = `task:${acc ?? wallet}:${data.taskId}`;
    const { mcpExec } = await import("../db/mcpClient");
    const { sqlStr } = await import("./raid-shared");
    const paid = (await mcpExec(
      `SELECT 1 AS x FROM yuplink.ticket_ledger WHERE kind = 'task' AND ref = ${sqlStr(ref)} LIMIT 1;`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ x: number }> | null;
    if (paid?.length) return { alreadyDone: false, gold: 0 };
    const { creditGoldForTickets } = await import("./gold-earn");
    const gold = await creditGoldForTickets({
      wallet,
      account: acc,
      tickets: 1,
      kind: "task",
      ref,
    });

    return { alreadyDone: false, gold };
  });
