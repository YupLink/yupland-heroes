// Миграция mine-mgmt-01: страховка «одно „Управление шахтами“ на аккаунт» —
// уникальный индекс по виду из кода, одной транзакцией, повтор безвреден.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MINE_OFFICE_KIND } from "@/lib/townHallCatalog";

const sql = readFileSync(
  fileURLToPath(new URL("../../../../migrations/mine-mgmt-01-one-per-account.sql", import.meta.url)),
  "utf8",
);

describe("миграция mine-mgmt-01", () => {
  it("одной транзакцией, чужой лок ждём не дольше 5 с", () => {
    expect(sql).toMatch(/^BEGIN;\nSET LOCAL lock_timeout = '5s';$/m);
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
  });
  it("уникальный индекс по аккаунту для вида из кода, повтор безвреден", () => {
    expect(sql).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS castle_building_one_mine_office\n" +
        `  ON yuplink.castle_building (account_id) WHERE kind = '${MINE_OFFICE_KIND}';`,
    );
    const statements = sql.replace(/--.*$/gm, "").split(";").map((x) => x.trim()).filter(Boolean);
    expect(statements).toHaveLength(4);
  });
});
