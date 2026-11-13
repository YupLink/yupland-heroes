// Личное «sentHome» (синий динамит взорвал корабль игрока, его отнесли в основной город):
// клиент перечитывает всё «beta-raid*» (позиция, карта, соседи, корабли и окно
// «корабль подорвали»); чужие события не трогает.
import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { handleSentHome } from "./sentHomeLive";

describe("sentHome", () => {
  it("перечитывает только beta-raid* (и окно взрыва); другое событие — мимо", () => {
    const qc = new QueryClient();
    const keys = ["beta-raid-state", "beta-raid-map", "beta-raid-ship-blast", "my-energy"];
    for (const key of keys) qc.setQueryData([key], { v: 1 });
    expect(handleSentHome(qc, { type: "ships" })).toBe(false);
    expect(qc.getQueryState(["beta-raid-state"])?.isInvalidated).toBe(false);
    expect(handleSentHome(qc, { type: "sentHome" })).toBe(true);
    const stale = (key: string) => qc.getQueryState([key])?.isInvalidated;
    expect(stale("beta-raid-state")).toBe(true);
    expect(stale("beta-raid-map")).toBe(true);
    expect(stale("beta-raid-ship-blast")).toBe(true);
    expect(stale("my-energy")).toBe(false);
  });
});
