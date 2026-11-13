// Настройки газет — settings.newspaper_config (JSON), без выката:
//  · cellsPerCopy — сколько свободных клеток суши карты на один экземпляр
//    (Кай: «с учётом открытой территории»). Числа в коде НЕТ: пока владелец
//    не утвердил, в settings пусто и размещение отказывает newspaper.count_not_set.
import { mcpExec } from "@/server/db/mcpClient";

export const NEWSPAPER_CONFIG_KEY = "newspaper_config";

export type NewspaperConfig = { cellsPerCopy: number | null };

/** Потолок числа клеток на экземпляр — шире любой карты. */
const MAX_CELLS_PER_COPY = 1_000_000;

export function parseNewspaperConfig(raw: unknown): NewspaperConfig {
  let v: unknown = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      v = null;
    }
  }
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const n = Number(o.cellsPerCopy);
  return {
    cellsPerCopy: Number.isInteger(n) && n >= 1 && n <= MAX_CELLS_PER_COPY ? n : null,
  };
}

const TTL_MS = 5_000;
let cache: { at: number; cfg: NewspaperConfig } | null = null;

export async function loadNewspaperConfig(): Promise<NewspaperConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.cfg;
  const rows = (await mcpExec(
    `SELECT value FROM yuplink.settings WHERE key = '${NEWSPAPER_CONFIG_KEY}' LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ value: unknown }>;
  const cfg = parseNewspaperConfig(rows?.[0]?.value ?? null);
  cache = { at: Date.now(), cfg };
  return cfg;
}

export function dropNewspaperConfigCache(): void {
  cache = null;
}
