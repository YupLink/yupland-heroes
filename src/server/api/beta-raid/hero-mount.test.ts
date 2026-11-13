// Конь героя для шага (§8.84): свежий запрос — место «Конь» выбранного героя аккаунта.
import { describe, expect, it } from "vitest";
import { heroMountSql } from "./hero-mount";

describe("конь героя для шага", () => {
  it("берёт место «Конь» выбранного героя своего аккаунта", () => {
    const sql = heroMountSql("acc_1");
    expect(sql).toContain("h.equipped::jsonb ->> 'Конь'");
    expect(sql).toContain("u.account_id = h.account_id");
    expect(sql).toContain("h.account_id = 'acc_1' AND h.selected_at IS NOT NULL");
    expect(sql).toContain("t.meta->>'mount'");
  });
});
