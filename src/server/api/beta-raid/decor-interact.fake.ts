// Фейк базы для decor-interact.test: список декора со «Взаимодействием» и
// клетки карты — по тексту SQL. Состояние — у теста (vi.hoisted), здесь только
// разбор операторов: вынесено из теста ради лимита ≤250 строк.

/** Что фейк читает и меняет: SQL по порядку, декор и клетки с инструментом. */
export type DecorFake = {
  sql: string[];
  decorOnCell: boolean;
  /** Клетки с декором-с-инструментом: "q,r" → id декора. */
  cells: Record<string, string>;
};

export function decorSql(s: DecorFake, sql: string): unknown[] {
  s.sql.push(sql);
  if (sql.includes("meta->'interact' AS interact")) {
    // Инструменты — json_agg справочника (decor-interact-load): удалённого в нём нет.
    const row = (id: string, interact: object, tool: string | null) => ({
      id,
      name: id,
      interact,
      item_name: "Дерево",
      item_image: null,
      tools: tool ? [{ id: "cst_axe", name: tool, image: null, wear: null }] : null,
    });
    const base = { on: true, cost: 3, itemId: "cst_wood", amount: "2" };
    return [
      { ...row("decoration_tree", base, null), name: "Ёлка" },
      row("decoration_pine", { ...base, toolItemId: "cst_axe" }, "Топор"),
      // Инструмент задан, но товар удалён из справочника.
      row("decoration_ghost", { ...base, toolItemId: "cst_gone" }, null),
    ];
  }
  const at = /q = (-?\d+) AND r = (-?\d+)/.exec(sql);
  const key = at ? `${at[1]},${at[2]}` : "";
  if (sql.includes("'decoration_pine'")) {
    if (sql.includes("SET decoration_id = NULL")) {
      const hit = s.cells[key] === "decoration_pine";
      if (hit) delete s.cells[key];
      return hit ? [{ q: 1 }] : [];
    }
    if (!s.cells[key]) s.cells[key] = "decoration_pine";
    return [];
  }
  if (sql.includes("SET decoration_id = NULL")) {
    const hit = s.decorOnCell;
    s.decorOnCell = false;
    return hit ? [{ q: 1 }] : [];
  }
  if (sql.includes("SET decoration_id = 'decoration_tree'")) s.decorOnCell = true;
  return [];
}
