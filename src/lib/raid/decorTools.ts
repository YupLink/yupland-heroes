// Несколько инструментов у декора (владелец, 05.10.2026): «нужна возможность
// настраивать сразу несколько видов топоров». Декору подходит любой инструмент
// из списка шаблона.
//
// Хранится в meta шаблона: meta.interact.toolItemIds — свои товары (cst_…), до
// 10, без повторов, порядок задаёт админ. Рядом пишется toolItemId — первый из
// списка: старый код и кэши видят его и даром декор не отдают. Старая
// настройка (только toolItemId) читается как список из одного.
//
// Какой берётся (pickMain, need «items»): основной в руках есть в списке — он;
// иначе первый по порядку списка, который есть у героя (в руках пусто — им и
// рубим, в руках другое — «Взять …»); нет ни одного — «Требуется Топор или Кирка».
import { pickMain, type ToolStack } from "@/lib/raid/mainTool";

/** Потолок списка: больше — опечатка, а не задумка. */
export const TOOLS_MAX = 10;

/** Инструмент — только свой товар (cst_…); пусто и мусор — инструмента нет. */
export function toolIdOf(v: unknown): string | null {
  return typeof v === "string" && /^cst_[A-Za-z0-9_-]+$/.test(v) ? v : null;
}

/** jsonb-массив приходит массивом, а у моста бывает и строкой — читаем оба. */
function listOf(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Список инструментов из meta.interact (или формы): toolItemIds, а старый
 * toolItemId — первым, если его нет в списке (запись вне админки не должна
 * сделать декор бесплатным). Мусор выпадает, повторы схлопываются, до 10.
 */
export function toolIdsOf(o: { toolItemIds?: unknown; toolItemId?: unknown }): string[] {
  const legacy = toolIdOf(o.toolItemId);
  const list = listOf(o.toolItemIds).map(toolIdOf);
  // У записи админки toolItemId — первый из списка: порядок не меняется.
  const ids: string[] = [];
  for (const id of list.includes(legacy) ? list : [legacy, ...list]) {
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids.slice(0, TOOLS_MAX);
}

/** Инструмент декора для окна и удара: товар, имя, картинка, «Износ за удар», ключ стопки. */
export type DecorToolView = {
  id: string;
  name: string;
  image: string | null;
  /** «Износ за удар, %»; null — ломается с первого удара. */
  wear: number | null;
  /** Ключ стопки в рюкзаке (канон вида): его и берут в руки (§8.24). */
  key: string;
};

/** Декор глазами клиента: список инструментов или (старый ответ, кэш) один. */
export type DecorToolsSource = {
  tools?: DecorToolView[];
  toolItemId?: string;
  toolName?: string;
  toolImage?: string | null;
  toolWear?: number | null;
  toolKey?: string;
};

/** Инструменты декора; ответ прошлой версии сервера (persist-кэш) — его единственный. */
export function decorToolsOf(conf: DecorToolsSource | null | undefined): DecorToolView[] {
  if (!conf) return [];
  if (Array.isArray(conf.tools) && conf.tools.length > 0) return conf.tools;
  if (!conf.toolItemId) return [];
  return [
    {
      id: conf.toolItemId,
      name: conf.toolName ?? "",
      image: conf.toolImage ?? null,
      wear: conf.toolWear ?? null,
      key: conf.toolKey ?? `custom:${conf.toolItemId}`,
    },
  ];
}

/** ok — рубит он; idle — есть, взять его; none — нет ни одного (tool — null). */
export type ToolChoice = { state: "ok" | "idle" | "none"; tool: DecorToolView | null };

/** Чем рубить декор: правило pickMain над списком, ответ — сам инструмент. */
export function chooseDecorTool(
  main: string | null,
  stacks: readonly ToolStack[],
  tools: readonly DecorToolView[],
): ToolChoice {
  const p = pickMain(main, stacks, { kind: "items", keys: tools.map((t) => t.key) });
  const key = p.ok || p.why === "idle" ? p.key : null;
  return { state: p.ok ? "ok" : p.why, tool: tools.find((t) => t.key === key) ?? null };
}

/** Допустимые одной строкой: «Топор», «Топор или Кирка», «Топор, Кирка или Пила». */
export function orList(names: readonly string[], or: string): string {
  const list = [...new Set(names.filter(Boolean))];
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} ${or} ${list[list.length - 1]}`;
}
