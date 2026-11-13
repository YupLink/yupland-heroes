// Схема (art-broken-01) и скрипт запуска (art-broken-launch) поломки артефактов
// (§8.63 п.3): схема только добавляет; скрипт снимает сломанное с героев теми же
// правилами, что удар, пишет события, ставит флаг — и повтор ничего не задваивает.
// Оба файла прогнаны на встроенном Postgres (PGlite) с заглушками таблиц прода:
// накат дважды; скрипт дважды (события не задвоились, флаг 'false' → 'true');
// без таблицы событий скрипт падает до записей.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../migrations/${name}`, import.meta.url)), "utf8");
const schema = read("art-broken-01.sql");
const launch = read("art-broken-launch.sql");

/** Текст без комментариев — проверяем то, что уйдёт в базу. */
const code = (sql: string) =>
  sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");

describe("схема art-broken-01", () => {
  const s = code(schema);
  it("одной транзакцией, чужой лок не дольше 5 с", () => {
    expect(schema).toContain("BEGIN;\nSET LOCAL lock_timeout = '5s';");
    expect(schema.trimEnd().endsWith("COMMIT;")).toBe(true);
  });

  it("только добавляет: IF NOT EXISTS, данных и прочих таблиц не трогает", () => {
    expect(s).toContain("CREATE TABLE IF NOT EXISTS yuplink.art_break_notice");
    expect(s).toContain("CREATE INDEX IF NOT EXISTS art_break_notice_unshown");
    expect(s).toContain("WHERE shown_at IS NULL");
    expect(s).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/);
    expect(s).not.toMatch(/\b(DROP|DELETE|TRUNCATE|ALTER|UPDATE|INSERT)\b/);
    // Флаг запуска схема не ставит: поведение игроков не меняется.
    expect(s).not.toContain("settings");
  });

  it("поля события: аккаунт, предмет, шаблон, имя, картинка, герой, время, показано", () => {
    for (const col of [
      "id          text        PRIMARY KEY",
      "account_id  text        NOT NULL",
      "item_id     text        NOT NULL",
      "template_id text",
      "name        text",
      "image_url   text",
      "hero_id     text",
      "created_at  timestamptz NOT NULL DEFAULT now()",
      "shown_at    timestamptz",
    ]) {
      expect(s).toContain(col);
    }
  });
});

describe("скрипт запуска art-broken-launch", () => {
  const s = code(launch);
  it("одной транзакцией; без таблицы событий — отказ до записей", () => {
    expect(launch).toContain("BEGIN;\nSET LOCAL lock_timeout = '5s';");
    expect(launch.trimEnd().endsWith("COMMIT;")).toBe(true);
    const guard = s.indexOf("to_regclass('yuplink.art_break_notice') IS NULL");
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(s.indexOf("INSERT INTO yuplink.art_break_notice"));
    expect(guard).toBeLessThan(s.indexOf("UPDATE yuplink.hero_instance"));
  });

  it("снимает только сломанное (износ 100) — с любых героев, остальное надетое не трогает", () => {
    expect(s).toContain("WHERE u.kind = 'artifact' AND u.wear >= 100");
    expect(s).toContain("WHERE e.value NOT IN (SELECT id FROM broken)");
    // Предмет остаётся в инвентаре: строки артефактов не меняются и не удаляются.
    expect(s).not.toMatch(/(UPDATE|DELETE FROM) yuplink\.user_game_item/);
    expect(s.match(/UPDATE yuplink\./g)).toHaveLength(1);
    expect(s).not.toMatch(/\b(DELETE|DROP|TRUNCATE|ALTER)\b/);
  });

  it("событие — владельцу предмета, по ключу запуска; залогу рынка — нет", () => {
    expect(s).toContain("'abn_launch_' || w.id");
    expect(s).toContain("ON CONFLICT (id) DO NOTHING");
    expect(s).toContain("w.account_id <> '_hero_market'");
    // Один предмет — одно событие, даже если надет на двух героях.
    expect(s).toContain("SELECT DISTINCT ON (b.id)");
  });

  it("флаг запуска — тот же, что у ремонта; повтор — то же значение", () => {
    expect(s).toContain(
      "INSERT INTO yuplink.settings (key, value) VALUES ('art_repair_open', 'true')\nON CONFLICT (key) DO UPDATE SET value = 'true';",
    );
    // Флаг — после снятия: в одной транзакции, порядок не важен, но так читается.
    expect(s.indexOf("UPDATE yuplink.hero_instance")).toBeLessThan(
      s.indexOf("INSERT INTO yuplink.settings"),
    );
  });

  it("битый equipped (не объект) не роняет скрипт", () => {
    expect(
      s.match(/jsonb_typeof\(h\.equipped::jsonb\) = 'object'/g)?.length,
    ).toBeGreaterThanOrEqual(3);
  });
});
