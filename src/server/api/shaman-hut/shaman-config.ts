// Цена шамана (владелец, 28.10.2026: «админ ставит цену — и начинает
// продаваться»): одна строка JSON в yuplink.settings (ключ shaman_config), как
// townhall_config. Нет строки или цены — шаманов не продают, их только видно.
//
// Читают окно хижины и каждая покупка — кэш процесса на 2 с: админ сохранил —
// новую цену видят и платят сразу.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { requireAdmin } from "@/server/auth";
import {
  SHAMAN_CONFIG_KEY,
  SHAMAN_CURRENCIES,
  SHAMAN_PRICE_MAX,
  parseShamanConfig,
  shamanConfigJson,
  type ShamanConfig,
} from "@/lib/shamanHut";
import { loadShamanTemplate, type ShamanTemplate } from "./shaman-template";

const TTL_MS = 2_000;
let cache: { at: number; cfg: ShamanConfig } | null = null;

/** Настройка хижины (цена шамана или null). */
export async function loadShamanConfig(): Promise<ShamanConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.cfg;
  const rows = (await mcpExec(
    `SELECT value FROM yuplink.settings WHERE key = ${sqlStr(SHAMAN_CONFIG_KEY)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ value: unknown }>;
  const cfg = parseShamanConfig(rows?.[0]?.value ?? null);
  cache = { at: Date.now(), cfg };
  return cfg;
}

/** Только для тестов: забыть кэш. */
export function dropShamanConfigCache(): void {
  cache = null;
}

export type ShamanAdminView = ShamanConfig & { template: ShamanTemplate | null };

/** Админ: цена (свежая, мимо кэша) и шаблон шамана — что уже задано в редакторе босса. */
export const adminGetShamanConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<ShamanAdminView> => {
    requireAdmin();
    cache = null;
    const [cfg, template] = await Promise.all([loadShamanConfig(), loadShamanTemplate()]);
    return { ...cfg, template };
  },
);

const priceInput = z
  .object({
    currency: z.enum(SHAMAN_CURRENCIES),
    amount: z.number().int().min(1).max(SHAMAN_PRICE_MAX),
  })
  .nullable();

/** Админ: поставить цену (шаманов начинают продавать) или снять (null — «Скоро в продаже»). */
export const adminSetShamanPrice = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ price: priceInput }).strict().parse(d))
  .handler(async ({ data }): Promise<ShamanConfig> => {
    requireAdmin();
    const json = shamanConfigJson(data.price);
    await mcpExec(
      `INSERT INTO yuplink.settings (key, value)
       VALUES (${sqlStr(SHAMAN_CONFIG_KEY)}, ${sqlStr(json)})
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
    );
    const cfg = parseShamanConfig(json);
    cache = { at: Date.now(), cfg };
    return cfg;
  });
