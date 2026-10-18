// Чтение основного инструмента героя (ПРАВИЛА §8.24): что записано у героя,
// какие у него инструменты и какие ключи вообще бывают инструментами.
//
// Решает не это чтение, а оператор удара под локом героя (main-tool-sql
// mainOkSql): чтение выбирает стопку и формулирует отказ до денег и износа.
import { mcpExec } from "@/server/db/mcpClient";
import { durabilityOf, toolWearOf } from "@/lib/raid/toolWear";
import { effectiveMain, type ToolStack } from "@/lib/raid/mainTool";
import { storedMainSql, toolStateSql } from "@/server/api/beta-raid/main-tool/main-tool-sql";
import { loadInteractiveDecor } from "@/server/api/beta-raid/decor-interact";

/** Стопка своего товара героя: для выбора и отказа — имя и «Износ за удар». */
export type StateStack = ToolStack & { name: string; toolWear: number | null };

/** Записанный основной (и лопата/удочка ли он) и свои товары рюкзака с целой штукой. */
export type ToolState = {
  stored: { key: string | null; shovel: boolean; rod: boolean };
  stacks: StateStack[];
};

type Raw = {
  stackKey: unknown;
  count: unknown;
  wear: unknown;
  shovel: unknown;
  rod?: unknown;
  name: unknown;
  toolWear: unknown;
};

/** json_agg приходит массивом, а у моста бывает и строкой — читаем оба. */
function listOf(v: unknown): Raw[] {
  if (Array.isArray(v)) return v as Raw[];
  if (typeof v !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(v);
    return Array.isArray(parsed) ? (parsed as Raw[]) : [];
  } catch {
    return [];
  }
}

/** Всё для выбора стопки удара. Сбой базы — бросок: действие без проверки не идёт. */
export async function loadToolState(heroId: string): Promise<ToolState> {
  const rows = (await mcpExec(toolStateSql(heroId), { wrapJson: true })) as Array<{
    mainKey: unknown;
    mainShovel: unknown;
    mainRod?: unknown;
    stacks: unknown;
  }>;
  const row = rows?.[0];
  return {
    stored: {
      key: typeof row?.mainKey === "string" && row.mainKey ? row.mainKey : null,
      shovel: row?.mainShovel === true,
      rod: row?.mainRod === true,
    },
    stacks: listOf(row?.stacks).map((s) => ({
      stackKey: String(s.stackKey ?? ""),
      count: Number(s.count) || 0,
      shovel: s.shovel === true,
      rod: s.rod === true,
      durability: durabilityOf(s.wear),
      name: String(s.name ?? ""),
      toolWear: toolWearOf(s.toolWear),
    })),
  };
}

/**
 * Записанный основной для окон (рюкзак): сбой или колонки ещё нет (миграция
 * tool-01 не накатана) — «не выбран», рюкзак при этом открывается.
 */
export async function loadStoredMain(
  heroId: string,
): Promise<{ key: string | null; shovel: boolean; rod: boolean }> {
  const rows = (await mcpExec(storedMainSql(heroId), { wrapJson: true }).catch(() => [])) as Array<{
    key: unknown;
    shovel: unknown;
    rod?: unknown;
  }>;
  const row = rows?.[0];
  return {
    key: typeof row?.key === "string" && row.key ? row.key : null,
    shovel: row?.shovel === true,
    rod: row?.rod === true,
  };
}

/** Ключи стопок, которые бывают инструментом декора (топор, кирка…): канон ключа, все из списков. */
export async function decorToolKeys(): Promise<Set<string>> {
  const list = await loadInteractiveDecor();
  const keys = new Set<string>();
  for (const conf of Object.values(list)) for (const t of conf.tools ?? []) keys.add(t.key);
  return keys;
}

/**
 * Рюкзак для окон: у стопок — «инструмент ли» (можно взять в руки), у рюкзака —
 * основной сейчас (effectiveMain: кончившуюся лопату заменяет другая лопата,
 * удочку — другая удочка). Сбой чтения — без инструментов и без основного:
 * рюкзак всё равно открывается.
 */
export async function withMainTool<T extends ToolStack>(
  heroId: string,
  stacks: T[],
): Promise<{ stacks: Array<T & { tool: boolean }>; mainTool: string | null }> {
  const [keys, stored] = await Promise.all([
    decorToolKeys().catch(() => new Set<string>()),
    loadStoredMain(heroId),
  ]);
  const marked = stacks.map((s) => ({
    ...s,
    tool: s.shovel === true || s.rod === true || keys.has(s.stackKey),
  }));
  return { stacks: marked, mainTool: effectiveMain(stored, marked) };
}
