// Лаборатория артефактов (§8.81) — пока только админам (владелец 25.10.2026:
// «пока только тестово и только для админов»). Клиент шлёт редкость
// («сертификат») и слова игрока (28.10: «по словам или рандомно — напишу
// наручи, делает наручи»). Предмет и желания из слов, бросок (crypto), запрос
// к нейросети, проверка картинки и выдача — на сервере.
// Цены — потом (владелец: «по цене — всё потом»).
//
// Серверные модули грузятся внутри ручек: файл импортирует клиент, а SQL,
// sharp и сеть в его сборке не нужны.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireAdmin } from "@/server/auth";
import { CRAFT_RARITIES } from "@/lib/craft/craftTable";
import { rollCraft } from "@/lib/craft/craftRoll";
import { CRAFT_FORMS, formById } from "@/lib/craft/craftForms";
import { cleanWords, lookWords, readWords } from "@/lib/craft/craftWords";
import { craftName, craftPrompt } from "@/lib/craft/craftPrompt";
import type { LabJob } from "./lab-sql";

/** Предохранители теста: заданий за сутки (UTC) и одновременно в работе. */
export const LAB_DAY_LIMIT = 30;
export const LAB_QUEUE_LIMIT = 3;

export type LabView = { jobs: LabJob[]; today: number; dayLimit: number };

async function owner() {
  const wallet = requireAdmin();
  const { accountOf } = await import("@/server/api/user-shared");
  return { wallet, account: await accountOf(wallet) };
}

const idSchema = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{6,40}$/) }).strict();

export const adminLabState = createServerFn({ method: "GET" }).handler(
  async (): Promise<LabView> => {
    const o = await owner();
    const sql = await import("./lab-sql");
    await sql.expireJobs(o.account);
    const [jobs, today] = await Promise.all([sql.listJobs(o.account), sql.todayCount(o.account)]);
    return { jobs, today, dayLimit: LAB_DAY_LIMIT };
  },
);

export const adminLabCraft = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        rarity: z.enum(CRAFT_RARITIES),
        // Слова игрока: «наручи», «хочу на ассасина»; пусто — всё рандом.
        words: z.string().max(400),
        nonce: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ job: LabJob }> => {
    const o = await owner();
    // 18+ (владелец 28.10: «тогда переводи полностью на рандом») — слова не
    // в счёт: предмет, желания и вид — как при пустом поле.
    const words = cleanWords(data.words) ?? "";
    const wish = readWords(words);
    const { randomInt } = await import("node:crypto");
    const rng = (n: number) => randomInt(n);
    // Предмет назван словами — он; нет — случайный из всех форм.
    const form = (wish.form && formById(wish.form)) || CRAFT_FORMS[rng(CRAFT_FORMS.length)];
    const roll = rollCraft(data.rarity, wish.boost, rng);
    const { insertJob } = await import("./lab-sql");
    const res = await insertJob(
      {
        id: nanoid(12),
        account: o.account,
        wallet: o.wallet,
        nonce: data.nonce,
        rarity: data.rarity,
        slot: form.slot,
        form: form.id,
        boost: wish.boost,
        roll,
        name: craftName(form, data.rarity, roll),
        prompt: craftPrompt(form, data.rarity, roll, lookWords(words)),
      },
      LAB_DAY_LIMIT,
      LAB_QUEUE_LIMIT,
    );
    if (res === "day_limit") throw new Error("lab.err_day_limit");
    if (res === "queue_full") throw new Error("lab.err_queue_full");
    return { job: res };
  });

/** Продвинуть задание: окно зовёт раз в несколько секунд, пока оно в очереди. */
export const adminLabTick = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data }): Promise<{ job: LabJob }> => {
    const o = await owner();
    const { advanceJob } = await import("./lab-run");
    const job = await advanceJob(o, data.id);
    if (!job) throw new Error("lab.err_not_found");
    return { job };
  });

/** «Не вышло» → ещё раз: картинку рисуем заново, бросок прежний. */
export const adminLabRetry = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const o = await owner();
    const { retryJob } = await import("./lab-sql");
    return { ok: await retryJob(o.account, data.id) };
  });
