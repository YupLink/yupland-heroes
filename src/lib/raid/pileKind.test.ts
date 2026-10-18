// Монетка или сундук: разбор `maxHp` из меты шаблона.
//
// Правило читают четверо (подбор шаблонов, счёт убитых, снятие с карты, список
// в панели), и оно уже разъезжалось: два места кастовали `(meta->>'maxHp')::
// numeric` в лоб, третий проверял тип, а вписанное руками «1 000» роняло весь
// оператор. Поэтому здесь проверяются ОБЕ половины правила — JS и SQL — и то,
// что они читают одинаково.
import { describe, expect, it } from "vitest";
import { COIN_MAX_HP, DEFAULT_MAX_HP, isCoinTemplate, maxHpOf } from "@/lib/raid/pileKind";
import { SCATTER_GROUPS } from "@/lib/raid/scatterPlan";
import {
  cellGroup,
  cellInGroup,
  cellOrphan,
  tplIsCoin,
  tplMaxHp,
} from "@/server/api/beta-raid/pile-kind";

describe("maxHpOf", () => {
  it("число берётся как есть", () => {
    expect(maxHpOf({ maxHp: 1 })).toBe(1);
    expect(maxHpOf({ maxHp: 0 })).toBe(0);
    expect(maxHpOf({ maxHp: 2500 })).toBe(2500);
    expect(maxHpOf({ maxHp: 0.5 })).toBe(0.5);
  });

  it("строка читается, только если она целиком число", () => {
    expect(maxHpOf({ maxHp: "1" })).toBe(1);
    expect(maxHpOf({ maxHp: "9000" })).toBe(9000);
    expect(maxHpOf({ maxHp: "12.75" })).toBe(12.75);
  });

  it("«1 000» руками — не число, а сундук", () => {
    // Ключевой случай: гадать за админа мы не будем, а пробел в числе — это
    // ровно та строка, на которой раньше падал SQL.
    expect(maxHpOf({ maxHp: "1 000" })).toBe(DEFAULT_MAX_HP);
    expect(isCoinTemplate({ maxHp: "1 000" })).toBe(false);
    expect(maxHpOf({ maxHp: "1,5" })).toBe(DEFAULT_MAX_HP);
    expect(maxHpOf({ maxHp: " 1" })).toBe(DEFAULT_MAX_HP);
    expect(maxHpOf({ maxHp: "1e3" })).toBe(DEFAULT_MAX_HP);
    expect(maxHpOf({ maxHp: "" })).toBe(DEFAULT_MAX_HP);
  });

  it("пусто и мусор — сундук, а не монетка", () => {
    // Направление ошибки выбрано намеренно: сундук в монетках вскрывался бы
    // одним касанием, а монетка среди сундуков просто скучно стоит.
    for (const meta of [null, undefined, 0, "", "chest", [], {}, { maxHp: null }]) {
      expect(maxHpOf(meta), `мета ${JSON.stringify(meta) ?? "undefined"}`).toBe(DEFAULT_MAX_HP);
      expect(isCoinTemplate(meta)).toBe(false);
    }
    expect(maxHpOf({ maxHp: Number.NaN })).toBe(DEFAULT_MAX_HP);
    expect(maxHpOf({ maxHp: Number.POSITIVE_INFINITY })).toBe(DEFAULT_MAX_HP);
    expect(maxHpOf({ maxHp: true })).toBe(DEFAULT_MAX_HP);
    expect(maxHpOf({ maxHp: { n: 1 } })).toBe(DEFAULT_MAX_HP);
  });

  it("монетка — до одного касания включительно", () => {
    expect(isCoinTemplate({ maxHp: 1 })).toBe(true);
    expect(isCoinTemplate({ maxHp: "1" })).toBe(true);
    expect(isCoinTemplate({ maxHp: 1.0001 })).toBe(false);
    expect(isCoinTemplate({ maxHp: 2 })).toBe(false);
    expect(isCoinTemplate({ maxHp: DEFAULT_MAX_HP })).toBe(false);
  });
});

describe("тот же разбор в SQL", () => {
  const sql = tplIsCoin("t");

  it("числа общие с клиентом, а не переписаны в запрос руками", () => {
    expect(sql).toContain(`, ${DEFAULT_MAX_HP})`);
    expect(sql).toContain(`<= ${COIN_MAX_HP}`);
  });

  it("тип проверяется до приведения — иначе «1 000» роняет весь запрос", () => {
    expect(sql).toContain("jsonb_typeof(t.meta->'maxHp') = 'number'");
    // Регулярка строкового случая обязана совпадать с JS-разбором: разъедутся —
    // и один и тот же шаблон окажется монеткой в подборе и сундуком при снятии.
    expect(sql).toContain("^[0-9]+(\\.[0-9]+)?$");
  });

  it("незаполненный запас через COALESCE, а не голым сравнением", () => {
    // `NULL <= 1` даёт NULL, и `NOT (…)` тоже NULL: шаблон без запаса не попал
    // бы ни в монетки, ни в сундуки.
    expect(sql.startsWith("COALESCE(")).toBe(true);
  });

  it("алиас таблицы подставляется везде", () => {
    const other = tplMaxHp("tpl");
    expect(other).toContain("tpl.meta->'maxHp'");
    expect(other).not.toContain("t.meta");
    expect(tplIsCoin()).toContain("t.meta");
  });
});

describe("кто стоит на клетке", () => {
  const sql = cellGroup("c");

  it("группу решает префикс object_id, а не вид шаблона", () => {
    // Вид шаблона был отдельным правилом у предпросмотра — и разошёлся со
    // снятием, которое всегда смотрело на префикс. Второго правила больше нет.
    expect(sql).toContain("c.object_id LIKE 'boss:%'");
    expect(sql).toContain("c.object_id LIKE 'artifact:%'");
    expect(sql).toContain("c.object_id LIKE 'chest:%'");
    expect(sql).not.toContain("kind");
  });

  it("сирота без шаблона — сундук, а не «other»", () => {
    // Кучка становится монеткой, ТОЛЬКО если шаблон нашёлся и он монеточный;
    // во всех остальных случаях — сундук. Значит объект с удалённым шаблоном
    // попадает в ту же группу, которая его и снимет, и в обещание «снимем N»
    // он входит. Раньше он проваливался в «other» и снимался молча.
    expect(sql).toMatch(/LIKE 'chest:%'[\s\S]*CASE WHEN EXISTS[\s\S]*THEN 'coin' ELSE 'chest' END/);
  });

  it("чужие объекты не трогаем вовсе", () => {
    expect(sql).toContain("ELSE 'other' END");
  });

  it("предикат группы собран из того же выражения", () => {
    // Ключевая гарантия: пока «кого считаем» и «кого снимаем» — один текст,
    // разъехаться им нечем.
    for (const group of SCATTER_GROUPS) {
      expect(cellInGroup(group, "c")).toBe(`(${sql}) = '${group}'`);
    }
    expect(cellInGroup("chest")).toContain(cellGroup());
  });

  it("сироту ищем только там, где шаблон обязан быть", () => {
    // Боссы живут в raid_boss_template, и «нет строки в mystic_item_template»
    // для них норма: посчитать их сиротами значит пугать админа пустым числом.
    const orphan = cellOrphan("c");
    expect(orphan).toContain("c.object_id LIKE 'chest:%'");
    expect(orphan).toContain("c.object_id LIKE 'artifact:%'");
    expect(orphan).not.toContain("boss:");
    expect(orphan).toContain("NOT EXISTS");
  });
});
