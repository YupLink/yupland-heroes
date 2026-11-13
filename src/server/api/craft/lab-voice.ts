// Голос → слова для лаборатории (§8.81, пока только админам). Окно присылает
// запись (до 15 с), наш транскрибатор на сервере распознаёт её (serverAsr) и
// отдаёт текст — тот же
// фильтр слов, что у набранного руками (18+ — пусто: будет полный рандом). Серверные модули — внутри ручки: файл
// импортирует клиент.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { cleanWords } from "@/lib/craft/craftWords";

/** ~2 МБ записи: 15 с голоса — десятки-сотни КБ, с запасом. */
const MAX_B64 = 2_800_000;

export const adminLabTranscribe = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        audio: z
          .string()
          .min(100)
          .max(MAX_B64)
          .regex(/^[A-Za-z0-9+/=]+$/),
        lang: z.enum(["ru", "en"]),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ text: string }> => {
    requireAdmin();
    const { serverTranscribe } = await import("@/server/craft/serverAsr");
    const heard = await serverTranscribe(Buffer.from(data.audio, "base64"), data.lang);
    if (!heard.ok) throw new Error("lab.err_voice");
    // 18+ не возвращаем в поле — пустое поле даёт полный рандом, как и сами слова.
    return { text: cleanWords(heard.text) ?? "" };
  });
