// Прихожа v2 · конфиг-слой. Все тюнимые значения механики живут одним JSON в
// settings['hallway:config'] (без миграции на каждый параметр). Сервер читает
// свежий конфиг на каждом начислении — клиентские значения никогда не в доверии.
// Уровни (EXP/окно) — в таблице hallway_levels (источник истины), тут их нет.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "../auth";
import { pg } from "../db/pg";

const CONFIG_KEY = "hallway:config";

const starMap = z.object({
  "1": z.number(),
  "1.5": z.number(),
  "2": z.number(),
  "2.5": z.number(),
  "3": z.number(),
});

// Марафон: одна запись на день (1..30). kind + сумма/звезда/кол-во.
const marathonDay = z.object({
  day: z.number().int().min(1).max(30),
  kind: z.enum(["awareness", "exp", "chip", "chest"]),
  amount: z.number().default(0), // для awareness/exp
  star: z.number().default(0), // для chip (1..3)
  count: z.number().int().default(0), // для chest (сколько роллов)
});

export const hallwayConfigSchema = z.object({
  tap: z.object({
    baseAwareness: z.number().default(1),
    starMultipliers: starMap,
  }),
  regen: z.object({
    perStarPerMin: z.number().default(1), // +1 тап/мин за звезду
    topN: z.number().int().default(10), // сколько сильнейших фишек работают
  }),
  chest: z.object({
    basePrice: z.number().default(10),
    priceGrowthPct: z.number().default(10), // +10% за каждое открытие
    priceFloor: z.number().default(10),
    cashback: z.object({ minPct: z.number(), maxPct: z.number() }), // % цены назад в осозн
    exp: z.object({ min: z.number(), max: z.number() }),
    premiumExp: z.object({
      chancePct: z.number(),
      min: z.number(),
      max: z.number(),
    }),
    chip: z.object({
      unlockLevel: z.number().int().default(5), // L5-гейт
      totalChancePct: z.number().default(25),
      stars: starMap, // % шанс на каждую звёздность (сумма = totalChancePct)
    }),
  }),
  marathon: z.object({
    resetOnMiss: z.boolean().default(true),
    schedule: z.array(marathonDay).length(30),
  }),
  release: z.object({
    requiredTopChips: z.number().int().default(10),
    ticketPerStar: z.number().default(0.1), // 0.1 билета за 1★
    ticketCap: z.number().default(3), // потолок билетов на аккаунт
    gateLevel: z.number().int().default(5),
    confirmWindowSec: z.number().int().default(120),
  }),
  boss: z.object({
    trialStatScale: z.number().default(0.5), // триал-фишки ×2 слабее
    // «Единство: Тираж» — бонус к боевым статам от серийника фишки.
    // OFF по умолчанию: включать после балансировки босса под усиленные фишки.
    tirageBonusEnabled: z.boolean().default(false),
  }),
  // Магазин прихожи за Telegram Stars: наборы триал-фишек (звёздность/кол-во/
  // цена в ⭐). Покупка выдаёт фишки в hallway_training_chips → набираешь 10 и
  // выпускаешься в игру, минуя гринд сундуков.
  starShop: z
    .object({
      // Килсвитч: пока OFF — офферы не отдаются и инвойс не создаётся. Включать
      // ТОЛЬКО после того как вебхук получает successful_payment (перерегистрация
      // с allowed_updates + secret) и оплата протестирована.
      enabled: z.boolean().default(false),
      offers: z
        .array(
          z.object({
            id: z.string(),
            title: z.string(),
            // fixed — count фишек одной звёздности (star); random — count фишек,
            // у каждой звёздность случайно 1/1.5/2/2.5/3 (равный шанс 20%).
            kind: z.enum(["fixed", "random"]).default("fixed"),
            star: z.number().default(0), // для fixed (1,1.5,2,2.5,3)
            count: z.number().int().min(1).max(50), // сколько фишек в наборе
            priceStars: z.number().int().min(0).max(100000), // цена в ⭐ (0 = бесплатная выдача, тест)
            active: z.boolean().default(true),
          })
        )
        .default([]),
    })
    .default({ offers: [] }),
  images: z.object({
    chest: z.string().nullable().default(null),
    marathonBanner: z.string().nullable().default(null),
    chipByStar: z.record(z.string(), z.string().nullable()).default({}),
    yupikByLevel: z.record(z.string(), z.string().nullable()).default({}),
  }),
});

export type HallwayConfig = z.infer<typeof hallwayConfigSchema>;

// Дефолты строго из PDF-механики.
export const DEFAULT_HALLWAY_CONFIG: HallwayConfig = {
  tap: {
    baseAwareness: 1,
    starMultipliers: { "1": 1.0, "1.5": 1.05, "2": 1.1, "2.5": 1.25, "3": 1.3 },
  },
  regen: { perStarPerMin: 1, topN: 10 },
  chest: {
    basePrice: 10,
    priceGrowthPct: 10,
    priceFloor: 10,
    cashback: { minPct: 10, maxPct: 50 },
    exp: { min: 40, max: 120 },
    premiumExp: { chancePct: 1, min: 500, max: 1000 },
    chip: {
      unlockLevel: 5,
      totalChancePct: 25,
      stars: { "1": 9, "1.5": 7, "2": 5, "2.5": 3, "3": 1 },
    },
  },
  marathon: {
    resetOnMiss: true,
    schedule: [
      { day: 1, kind: "awareness", amount: 3, star: 0, count: 0 },
      { day: 2, kind: "exp", amount: 8, star: 0, count: 0 },
      { day: 3, kind: "chest", amount: 0, star: 0, count: 1 },
      { day: 4, kind: "awareness", amount: 3, star: 0, count: 0 },
      { day: 5, kind: "awareness", amount: 3, star: 0, count: 0 },
      { day: 6, kind: "exp", amount: 8, star: 0, count: 0 },
      { day: 7, kind: "chip", amount: 0, star: 1, count: 0 },
      { day: 8, kind: "awareness", amount: 5, star: 0, count: 0 },
      { day: 9, kind: "exp", amount: 12, star: 0, count: 0 },
      { day: 10, kind: "chest", amount: 0, star: 0, count: 1 },
      { day: 11, kind: "exp", amount: 12, star: 0, count: 0 },
      { day: 12, kind: "awareness", amount: 5, star: 0, count: 0 },
      { day: 13, kind: "chest", amount: 0, star: 0, count: 1 },
      { day: 14, kind: "chip", amount: 0, star: 1.5, count: 0 },
      { day: 15, kind: "awareness", amount: 8, star: 0, count: 0 },
      { day: 16, kind: "awareness", amount: 8, star: 0, count: 0 },
      { day: 17, kind: "chest", amount: 0, star: 0, count: 2 },
      { day: 18, kind: "exp", amount: 18, star: 0, count: 0 },
      { day: 19, kind: "awareness", amount: 8, star: 0, count: 0 },
      { day: 20, kind: "chest", amount: 0, star: 0, count: 2 },
      { day: 21, kind: "chip", amount: 0, star: 2, count: 0 },
      { day: 22, kind: "awareness", amount: 12, star: 0, count: 0 },
      { day: 23, kind: "exp", amount: 25, star: 0, count: 0 },
      { day: 24, kind: "chest", amount: 0, star: 0, count: 2 },
      { day: 25, kind: "exp", amount: 25, star: 0, count: 0 },
      { day: 26, kind: "awareness", amount: 12, star: 0, count: 0 },
      { day: 27, kind: "chest", amount: 0, star: 0, count: 2 },
      { day: 28, kind: "chip", amount: 0, star: 2.5, count: 0 },
      { day: 29, kind: "chest", amount: 0, star: 0, count: 3 },
      { day: 30, kind: "chip", amount: 0, star: 3, count: 0 },
    ],
  },
  release: {
    requiredTopChips: 10,
    ticketPerStar: 0.1,
    ticketCap: 3,
    gateLevel: 5,
    confirmWindowSec: 120,
  },
  boss: { trialStatScale: 0.5, tirageBonusEnabled: false },
  // Дефолтный набор: 10 фишек 1★ за 50 ⭐ (хватает выпуститься). Владелец
  // правит/добавляет офферы в /admin/hallway.
  starShop: {
    enabled: false, // включить после go-live вебхука + теста оплаты
    offers: [
      { id: "c1x3", title: "1 фишка 3★", kind: "fixed", star: 3, count: 1, priceStars: 15, active: true },
      { id: "c10x3", title: "10 фишек 3★", kind: "fixed", star: 3, count: 10, priceStars: 100, active: true },
      { id: "pack3rand", title: "Пак: 3 случайные фишки (1–3★)", kind: "random", star: 0, count: 3, priceStars: 22, active: true },
    ],
  },
  images: { chest: null, marathonBanner: null, chipByStar: {}, yupikByLevel: {} },
};

// In-memory кэш конфига: тапы читают его на КАЖДЫЙ вызов, а меняется он только
// из админки. TTL 30с → при 100 тапперах не бьём settings-таблицу тысячи раз.
let _cfgCache: { value: HallwayConfig; at: number } | null = null;
const CFG_TTL_MS = 30_000;

/** Сбросить кэш конфига (звать после админ-сохранения). */
export function bustHallwayConfigCache(): void {
  _cfgCache = null;
}

/** Читает конфиг из settings; если нет/битый — дефолты (мержит недостающее). */
export async function getHallwayConfig(): Promise<HallwayConfig> {
  const c = _cfgCache;
  if (c && Date.now() - c.at < CFG_TTL_MS) return c.value;
  try {
    const row = await pg.settings.findOne({ key: CONFIG_KEY });
    if (row?.value) {
      const parsed = hallwayConfigSchema.safeParse(JSON.parse(row.value));
      if (parsed.success) {
        _cfgCache = { value: parsed.data, at: Date.now() };
        return parsed.data;
      }
    }
  } catch {
    /* дефолты */
  }
  _cfgCache = { value: DEFAULT_HALLWAY_CONFIG, at: Date.now() };
  return DEFAULT_HALLWAY_CONFIG;
}

export const adminGetHallwayConfig = createServerFn({ method: "GET" }).handler(
  async () => {
    requireAdmin();
    return await getHallwayConfig();
  }
);

export const adminUpdateHallwayConfig = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => hallwayConfigSchema.parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    await pg.settings.upsert(
      { key: CONFIG_KEY, value: JSON.stringify(data) },
      { onConflict: "key" }
    );
    bustHallwayConfigCache(); // сразу применяем, не ждём TTL
    return { ok: true };
  });
