// Права по одному: только аккаунты acc_ и только известные права.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: async () => [] }));

const { parseAdminRights } = await import("./admin-rights");

describe("parseAdminRights", () => {
  it("строка и объект; незнакомые права и не-аккаунты — мимо", () => {
    const r = parseAdminRights('{"acc_a":["god_map","payouts"],"w.near":["god_map"],"acc_b":[]}');
    expect([...r.keys()]).toEqual(["acc_a"]);
    expect([...(r.get("acc_a") ?? [])]).toEqual(["god_map"]);
    expect(
      parseAdminRights({ acc_c: ["god_map"] })
        .get("acc_c")
        ?.has("god_map"),
    ).toBe(true);
  });
  it("мусор — пусто", () => {
    expect(parseAdminRights(null).size).toBe(0);
    expect(parseAdminRights("{bad").size).toBe(0);
    expect(parseAdminRights(["god_map"]).size).toBe(0);
  });
});
