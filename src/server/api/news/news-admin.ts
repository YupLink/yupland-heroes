// Вкладка «Новости» панели «$ Экономика»: та же сводка, что у /api/news, ключ
// для ссылок (ключ создаётся при первом открытии) и выпуск «Вестника героев»
// по кнопке. Только админам.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { clampNewsDays, type NewsDigest } from "@/lib/news/types";
import { newsText } from "@/lib/news/newsText";
import { recentWeek } from "@/lib/news/vestnikWindow";
import { buildNewsDigest } from "./news-digest";
import { ensureNewsKey } from "./news-key";

const inputSchema = z.object({ days: z.number(), lang: z.enum(["ru", "en"]) });

export type AdminNewsView = { digest: NewsDigest; text: string; apiPath: string; key: string };

export const adminNewsDigest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<AdminNewsView> => {
    requireAdmin();
    const days = clampNewsDays(data.days);
    const [digest, key] = await Promise.all([buildNewsDigest(days, data.lang), ensureNewsKey()]);
    return {
      digest,
      text: newsText(digest, data.lang),
      // Одна ссылка для владельца — страница «Вестника» со всем управлением.
      apiPath: `/vestnik?key=${encodeURIComponent(key)}`,
      key,
    };
  });

const sendSchema = z.object({ lang: z.enum(["ru", "en"]) });

export type VestnikSendResult = {
  ok: boolean;
  reason?: "no_chat" | "already" | "send_failed" | "unknown";
};

/**
 * Сводка последних 7 дней в канал — сейчас, по кнопке. Газета дня по кнопке не
 * выходит: она выходит сама утром, и вторая за ту же дату была бы лишней.
 * Та же сводка за тот же день второй раз не уйдёт (отметка выпуска).
 * Сборка — в импорте внутри ручки: satori и шрифты не должны попасть в клиент.
 */
export const adminVestnikSend = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => sendSchema.parse(d))
  .handler(async ({ data }): Promise<VestnikSendResult> => {
    requireAdmin();
    const { publishMarked } = await import("@/server/news/vestnik-schedule");
    const res = await publishMarked(recentWeek(Date.now()), data.lang);
    return res.ok ? { ok: true } : { ok: false, reason: res.reason };
  });
