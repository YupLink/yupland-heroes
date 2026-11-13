// «Разрешить боту писать» (владелец 04.11.2026, §8.106): спросить ли игрока
// при входе и что он ответил. Telegram — только из проверенной сессии.
// Серверные модули — динамическим импортом: файл импортирует экран замка.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSessionTgId } from "@/server/auth";

export const getTgWriteAsk = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ ask: boolean }> => {
    const tg = getSessionTgId();
    if (!tg) return { ask: false };
    const { askDue } = await import("@/server/tgReach");
    return { ask: await askDue(tg).catch(() => false) };
  },
);

export const doneTgWriteAsk = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ allowed: z.boolean() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const tg = getSessionTgId();
    if (!tg) return { ok: false };
    const { askDone } = await import("@/server/tgReach");
    await askDone(tg, data.allowed);
    return { ok: true };
  });
