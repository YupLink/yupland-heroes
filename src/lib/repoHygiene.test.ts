// Проверка гигиены репо (scripts/check-repo-hygiene.mjs): ловит секреты и данные игроков,
// пропускает заглушки. Все «секреты» здесь собираются в рантайме из генератора, чтобы сам
// тест не содержал ничего похожего на настоящий ключ.
import { describe, expect, it } from "vitest";
import { checkPath, scanLine } from "../../scripts/check-repo-hygiene.mjs";

const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const gen = (n: number, seed = 7) =>
  Array.from({ length: n }, (_, i) => ALPHA[(i * seed + 11) % ALPHA.length]).join("");
const rules = (file: string, text: string) => scanLine(file, text).map((h) => h.rule);

describe("repo hygiene: ловит", () => {
  it.each([
    ["private-key", ["-----BEGIN", "RSA PRIVATE KEY-----"].join(" ")],
    ["near-key", "ed25519" + ":" + gen(88)],
    ["tg-bot-token", ["123456789", "AA" + gen(33)].join(":")],
    ["jwt", ["eyJ" + gen(20), "eyJ" + gen(30, 5), gen(40, 3)].join(".")],
    ["github-token", "ghp" + "_" + gen(36)],
    ["fal-key", "fal" + "_sk_" + gen(24)],
    ["db-password", `DATABASE_URL=postgres://app:${gen(24)}@db.internal:5432/app`],
    ["secret-assign", `const BOT_TOKEN = "${gen(32)}";`],
    ["secret-assign", `SESSION_SECRET=${gen(40)}`],
    ["account-id", `const OWNER = "acc_${gen(20)}";`],
    ["tg-wallet", `wallet: "tg${4815162342}"`],
    ["ipv4", `ssh root@${[93, 184, 216, 34].join(".")}`],
  ])("%s", (rule, text) => {
    expect(rules("src/server/x.ts", text)).toContain(rule);
  });

  it("маскирует значение", () => {
    const value = gen(32);
    const [hit] = scanLine("src/server/x.ts", `const API_KEY = "${value}";`);
    expect(hit.shown).not.toContain(value);
    expect(hit.shown).toMatch(/…\(32\)$/);
  });

  it.each([
    "audit/2026-11-01/players.json",
    "data/payouts.csv",
    "backup/prod.dump",
    "db.sql.gz",
    ".env",
    "deploy/.env.production",
  ])("путь %s", (path) => expect(checkPath(path)).not.toBeNull());
});

describe("repo hygiene: пропускает", () => {
  it.each([
    ["публичный ключ NEAR", "src/a.ts", "ed25519" + ":" + gen(44)],
    ["тестовый пароль базы", "x.yml", "postgres://postgres:isolated-test-only@127.0.0.1:5432/t"],
    [
      "секрет из env",
      "src/a.ts",
      "const SESSION_SECRET = process.env.SESSION_SECRET_VALUE_FROM_ENV;",
    ],
    ["публичный адрес программы", "src/a.ts", `export const SPL_TOKEN_PROGRAM = "${gen(43)}";`],
    ["заглушка в .example", ".env.example", `BOT_TOKEN=${gen(40)}`],
    ["фейк в тесте", "src/a.test.ts", `const BOT_TOKEN = "${gen(32)}";`],
    ["фейковый аккаунт", "src/a.ts", 'const A = "acc_test0001";'],
    ["аккаунт в миграции", "migrations/x.sql", `WHERE account_id = 'acc_${gen(20)}'`],
    ["tg-кошелёк в тесте", "src/a.test.ts", `wallet: "tg${4815162342}"`],
    ["заглушка tg", "docs/a.md", "tg123456789"],
    [
      "частные и док-адреса",
      "a.md",
      "127.0.0.1 10.0.0.5 192.168.1.1 172.20.0.2 203.0.113.7 1.2.3.4 0.0.0.0",
    ],
    ["версии", "a.md", "v0.63.2 и 1.2.3.4.5"],
    ["пометка hygiene-ok", "src/a.ts", `const BOT_TOKEN = "${gen(32)}"; // hygiene-ok`],
  ])("%s", (_name, file, text) => {
    expect(scanLine(file, text)).toEqual([]);
  });

  it.each([".env.example", "src/lib/a.ts", "public/data.json"])("путь %s", (path) => {
    expect(checkPath(path)).toBeNull();
  });
});
