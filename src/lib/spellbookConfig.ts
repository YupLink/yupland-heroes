// Настройка СТОЛБА ЗАКЛИНАНИЙ на клетке — для редактора.
//
// Живёт там же, где портал и алтарь: building_config.spellbook, а нет своей —
// meta.spellbook шаблона. Один и тот же облик «Столб» в разных концах карты
// учит разному и берёт разное.
//
// Здесь ТОЛЬКО черновик редактора: строки не выбрасываем, даже пустые, иначе
// свежая строка цены исчезала бы под пальцем, не дождавшись ввода суммы.
// Рабочую настройку (с отбраковкой нулей) считает сервер — spellPillarConfig в
// server/api/beta-raid/spell-pillar.ts; второй копии этого правила нет намеренно.
import type { PortalPrice } from "./portal";

export type SpellbookCellConfig = {
  /** Чем платят за изучение. Пусто — столб не настроен и не работает. */
  learnPrices: PortalPrice[];
  /** Чем платят за забвение. Пусто — забыть здесь нельзя. */
  forgetPrices: PortalPrice[];
  /** Каким заклинаниям учит. Пусто — всему активному каталогу. */
  spells: string[];
};

export const EMPTY_SPELLBOOK: SpellbookCellConfig = {
  learnPrices: [],
  forgetPrices: [],
  spells: [],
};

const pricesOf = (raw: unknown): PortalPrice[] =>
  Array.isArray(raw)
    ? (raw as PortalPrice[]).filter((p) => p && typeof p === "object").map((p) => ({ ...p }))
    : [];

const idsOf = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string" && !!s.trim()) : [];

/** Настройка как есть — для формы админа. */
export function spellbookConfigDraft(cellConfig: unknown): SpellbookCellConfig {
  const raw = (cellConfig as { spellbook?: unknown } | null)?.spellbook;
  if (!raw || typeof raw !== "object") return { ...EMPTY_SPELLBOOK };
  const o = raw as Record<string, unknown>;
  return {
    learnPrices: pricesOf(o.learnPrices),
    forgetPrices: pricesOf(o.forgetPrices),
    spells: idsOf(o.spells),
  };
}

/** Настроен ли столб: без цены изучения он не работает (правило сервера). */
export function spellbookConfigured(cfg: SpellbookCellConfig): boolean {
  return cfg.learnPrices.some((p) => (Number(p.amount) || 0) > 0);
}
