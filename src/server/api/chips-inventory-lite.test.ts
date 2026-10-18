import { describe, expect, it } from "vitest";
import { chipLite } from "./chips-inventory-lite";

describe("фишка в инвентаре без пустого", () => {
  it("прошедший отдых и пустое оглушение не отправляем", () => {
    const c = chipLite(
      {
        id: "uci_1",
        serial_no: 7,
        obtained_at: "2026-09-20T12:34:56.789123+00:00",
        rest_until: "2020-01-01T00:00:00Z",
      },
      null,
    );
    expect(c).toEqual({ id: "uci_1", serialNo: 7, obtainedAt: "2026-09-20T12:34:56.789Z" });
  });
  it("действующие отдых и оглушение — на месте", () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const c = chipLite(
      { id: "uci_2", serial_no: null, obtained_at: "2026-09-20T00:00:00Z", rest_until: future },
      future,
    );
    expect(c.restUntil).toBe(future);
    expect(c.stunUntil).toBe(future);
  });
});
