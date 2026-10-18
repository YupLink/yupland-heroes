// Проходная автораздачи: что вообще принимаем от админа.
//
// Живёт отдельно от ручек (scatter.ts) не ради красоты: обе ручки — и
// предпросмотр, и выполнение — обязаны проверять план ОДНОЙ схемой. Разойдись
// они, предпросмотр показал бы одно, а выполнение приняло другое, и цену за
// разницу заплатили бы игроки.
//
// Панель шлёт сюда уже причёсанный черновик (components/…/scatterDraft), но
// ручка открыта не только панели: за требованием ниже стоит именно голый
// запрос от админа, собранный руками.
import { z } from "zod";
import { MAX_PER_GROUP, SCATTER_SEED_MAX, type ScatterPlan } from "@/lib/raid/scatterPlan";

/**
 * Наградный фонд группы.
 *
 * Токенный фонд БЕЗ символа монеты не проходит. Сервер физически не знает, что
 * класть: символ читает и выдача (encounter-rewards подменяет вид только у
 * `token`), и сверка со свободным остатком (scatter-funds). Строка без символа
 * молча выпадала из обеспечения — раздача шла мимо всякого учёта, — но в отчёт
 * попадала безымянной строкой «Токен». Пусть лучше админ увидит отказ.
 */
const fund = z
  .object({
    kind: z.enum(["token", "likes", "energy", "tickets", "resource", "custom"]),
    token: z.string().max(32).nullable().default(null),
    amount: z.number().min(0).max(1e12),
    /** kind:"resource" — код ресурса единого счёта (wood/stone/gold/…). */
    resource: z.string().max(40).nullable().default(null),
    /** kind:"custom" — id своего товара (cst_…). */
    itemId: z.string().max(64).nullable().default(null),
  })
  .refine((f) => f.kind !== "token" || (f.token ?? "").trim() !== "", {
    message: "Токенный фонд без символа монеты: непонятно, какую монету раскладывать",
    path: ["token"],
  })
  .refine((f) => f.kind !== "resource" || (f.resource ?? "").trim() !== "", {
    message: "Ресурсный фонд без кода ресурса: выбери, что раскладывать",
    path: ["resource"],
  })
  .refine((f) => f.kind !== "custom" || (f.itemId ?? "").startsWith("cst_"), {
    message: "Товарный фонд без выбранного товара: пусто не выкладывается",
    path: ["itemId"],
  });

const ids = z.array(z.string().max(64)).max(300).default([]);
const common = { enabled: z.boolean(), removeKilled: z.boolean() };
const count = z.number().int().min(0).max(MAX_PER_GROUP);

/**
 * «Среднее значение» кучки — точка разброса. Дробное намеренно: у USDT кучка
 * бывает в две копейки. `default(null)` держит совместимость: план, собранный
 * руками без этого поля, обязан проходить, как проходил вчера.
 */
const point = z.number().min(0).max(1e12).nullable().default(null);

/**
 * Отмеченные админом местности. `count: null` — «делит общее число раздела»;
 * сорок строк — потолок формы, дальше это уже не выбор, а вся карта.
 */
const lands = z
  .array(
    z.object({
      terrainId: z.string().min(1).max(64),
      count: z.number().int().min(0).max(5000).nullable().default(null),
    }),
  )
  .max(40)
  .default([]);

const planSchema = z.object({
  /**
   * Сид раскладки. `default(null)` держит совместимость: план без поля (старая
   * панель, ручной запрос) обязан проходить, как проходил вчера, и раскладка
   * у него остаётся случайной.
   */
  seed: z.number().int().min(0).max(SCATTER_SEED_MAX).nullable().default(null),
  boss: z.object({
    ...common,
    count,
    levelMin: z.number().int().min(1).max(100),
    levelMax: z.number().int().min(1).max(100),
    terrainLevel: z
      .object({ from: z.number().int().min(0).max(1000), to: z.number().int().min(0).max(1000) })
      .nullable()
      .default(null),
    funds: z.array(fund).max(8).default([]),
    packs: z
      .array(z.object({ packId: z.string().max(64), count }))
      .max(16)
      .default([]),
    arts: z
      .array(
        z.object({ rarity: z.string().max(32).nullable().default(null), templateIds: ids, count }),
      )
      .max(16)
      .default([]),
    lands,
  }),
  // Один раздел на сундуки и монетки. Необязателен: план без него — это старый
  // клиент, он по-прежнему шлёт пару разделов ниже.
  loot: z
    .object({
      ...common,
      count: count.nullable(),
      point,
      funds: z.array(fund).max(8).default([]),
      templateIds: ids,
      lands,
    })
    .optional(),
  chests: z.object({
    ...common,
    count: count.nullable(),
    point,
    funds: z.array(fund).max(8).default([]),
    templateIds: ids,
    lands,
  }),
  coins: z.object({
    ...common,
    count: count.nullable(),
    point,
    funds: z.array(fund).max(8).default([]),
    templateIds: ids,
    lands,
  }),
  artifacts: z.object({
    ...common,
    count,
    rarities: z.array(z.string().max(32)).max(8).default([]),
    templateIds: ids,
    lands,
  }),
});

/**
 * Разбор плана для обеих ручек.
 *
 * Наружу отдаём ПЕРВУЮ внятную фразу, а не свалку ZodError: её админ читает
 * тостом (humanError), и `[{"code":"custom","path":["boss","funds",0,…]}]` ему
 * не говорит ничего.
 */
export function parseScatterPlan(raw: unknown): ScatterPlan {
  const res = planSchema.safeParse(raw);
  if (res.success) return res.data;
  throw new Error(res.error.issues[0]?.message ?? "План раздачи не разобран");
}
