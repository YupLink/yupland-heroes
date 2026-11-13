// weather-05: обряд — по одному в КАЖДОМ мире за смену (владелец, 29.10.2026). Ключ
// голоса — слот + аккаунт + мир; «уже был» — по этому миру. Поток проверен на проде
// в откатываемой транзакции (два мира — по обряду, второй в том же мире — отказ).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const raw = readFileSync(
  new URL("../../../../../migrations/weather-05-ritual-per-world.sql", import.meta.url),
  "utf8",
);
const flat = raw.replace(/\s+/g, " ");

describe("weather-05: обряд в каждом мире", () => {
  it("ключ голоса — слот, аккаунт и мир", () => {
    expect(flat).toContain("PRIMARY KEY (slot_at, account_id, map_id)");
  });
  it("«уже был» — только в этом мире; повтор нажатия по-прежнему «ok»", () => {
    expect(flat).toContain(
      "WHERE v.slot_at = v_slot AND v.account_id = p_acc AND v.map_id = p_map;",
    );
    expect(flat).toContain("WHERE v.account_id = p_acc AND v.op_id = p_op) THEN RETURN 'ok';");
    expect(flat).toContain("IF NOT yuplink.castle_shaman_take(p_acc) THEN RETURN 'no_shaman';");
  });
});
