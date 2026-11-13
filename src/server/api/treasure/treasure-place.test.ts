// Закопать клад слота: один на слот, приз — первый из фонда, пустой фонд и сбой
// скрина — сигнал админам раз за слот, админам — фото с миром, координатами и
// призом; «на огрызок» суток (меньше 6 ч до следующих 09:00 МСК) не закапываем.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  busy: false,
  live: false,
  fund: true,
  renderFails: false,
  inserted: [] as string[],
  photos: [] as string[],
  alerts: [] as string[],
  alerted: new Set<string>(),
  notified: false,
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    if (sql.includes("slot = ") && sql.includes("status = 'live'")) return s.busy ? [{ x: 1 }] : [];
    if (sql.includes("WHERE status = 'live' LIMIT 1")) return s.live ? [{ x: 1 }] : [];
    if (sql.includes("FROM yuplink.raid_treasure_fund")) {
      return s.fund
        ? [{ id: "trf_1", resource: "token", token: "Darai", amount: 5e6, name: null, image: null }]
        : [];
    }
    if (sql.includes("INSERT INTO yuplink.raid_treasure")) return (void s.inserted.push(sql), []);
    if (sql.includes("SELECT 1 AS x FROM yuplink.raid_treasure WHERE id =")) {
      return s.inserted.length ? [{ x: 1 }] : [];
    }
    if (sql.includes("t.notified_at IS NULL AND t.shot IS NOT NULL")) {
      const shot = Buffer.from("jpg").toString("base64");
      return [
        { id: "x", q: 7, r: 8, resource: "token", token: "Darai", amount: 5e6, name: null, shot },
      ].map((x) => ({ ...x, exp: Date.UTC(2026, 10, 8, 6), world: "Хель" }));
    }
    if (sql.includes("SET notified_at = now(), notify_op")) {
      if (s.notified) return [];
      s.notified = true;
      return [{ id: "x" }];
    }
    return [];
  },
}));
vi.mock("./treasure-pick", () => ({
  pickTreasureSpot: async () => ({ mapId: "rmap_hel", world: "Хель", q: 7, r: 8 }),
}));
vi.mock("./treasure-shot-data", () => ({ loadShotCells: async () => [] }));
vi.mock("./treasure-shot", () => ({
  SHOT_RADIUS: 9,
  frameCenter: () => ({ x: 0, y: 0 }),
  centerCell: () => ({ q: 7, r: 8 }),
  renderTreasureShot: async () => {
    if (s.renderFails) throw new Error("sharp <boom>");
    return Buffer.from("jpg");
  },
}));
vi.mock("./treasure-tg", async (orig) => ({
  ...(await orig<typeof import("./treasure-tg")>()),
  sendAdminsPhoto: async (_b: Buffer, caption: string) => (s.photos.push(caption), 2),
  alertOnce: async (reason: string, mark: string, text: string) => {
    if (s.alerted.has(reason + mark)) return;
    s.alerted.add(reason + mark);
    s.alerts.push(text);
  },
}));

const { placeIfDue, buryNow } = await import("./treasure-place");
const NOW = Date.UTC(2026, 10, 7, 9, 5);

beforeEach(() => {
  Object.assign(s, {
    busy: false,
    live: false,
    fund: true,
    renderFails: false,
    inserted: [],
    photos: [],
    alerts: [],
    alerted: new Set(),
    notified: false,
  });
});

describe("клад слота", () => {
  it("закопан: слот дня, до следующих 09:00 МСК, приз из фонда; админам — фото с координатами", async () => {
    expect(await placeIfDue(NOW)).toMatch(/^trs_/);
    const sql = s.inserted[0].replace(/\s+/g, " ");
    expect(sql).toContain("'2026-11-07'::date, false, 'rmap_hel', 7, 8, 'token', 'Darai', 5000000");
    expect(sql).toContain(`to_timestamp(${Date.UTC(2026, 10, 8, 6) / 1000})`);
    expect(s.photos).toHaveLength(1);
    expect(s.photos[0]).toContain("Мир: Хель");
    expect(s.photos[0]).toContain("Координаты: 7,8");
    expect(s.photos[0]).toContain("Приз: 5 000 000 Darai");
    expect(s.photos[0]).toContain("08.11 09:00 МСК");
  });

  it("в слоте уже есть клад (или лежит живой) — второго нет", async () => {
    s.busy = true;
    expect(await placeIfDue(NOW)).toBeNull();
    expect(s.inserted).toEqual([]);
  });

  it("до следующих 09:00 МСК меньше 6 часов — ждём следующего слота", async () => {
    expect(await placeIfDue(Date.UTC(2026, 10, 8, 0, 30))).toBeNull();
    expect(s.inserted).toEqual([]);
    expect(await placeIfDue(Date.UTC(2026, 10, 7, 23, 59))).toMatch(/^trs_/);
  });

  it("фонд пуст — сигнал админам один раз за слот", async () => {
    s.fund = false;
    await placeIfDue(NOW);
    await placeIfDue(NOW + 5 * 60_000);
    expect(s.alerts).toEqual(["⚠️ Фонд клада пуст — сегодня клад не закопан."]);
    expect(s.inserted).toEqual([]);
  });

  it("скрин не нарисовался — сигнал раз за слот (экранирован), клада нет", async () => {
    s.renderFails = true;
    await expect(placeIfDue(NOW)).rejects.toThrow("sharp");
    await expect(placeIfDue(NOW)).rejects.toThrow("sharp");
    expect(s.alerts).toEqual(["⚠️ Клад не закопан: sharp &lt;boom&gt;. Пробую снова."]);
    expect(s.inserted).toEqual([]);
  });

  it("админ закапывает сам — сейчас, на сутки от запуска; лежит живой или фонд пуст — отказ", async () => {
    const at = Date.UTC(2026, 10, 7, 15, 0);
    expect(await buryNow(at)).toMatch(/^trs_/);
    const sql = s.inserted[0].replace(/\s+/g, " ");
    expect(sql).toContain("'2026-11-07'::date, true, 'rmap_hel'");
    expect(sql).toContain(`to_timestamp(${(at + 24 * 3600_000) / 1000})`);
    s.live = true;
    await expect(buryNow(at)).rejects.toThrow("treasure.live_exists");
    s.live = false;
    s.fund = false;
    await expect(buryNow(at)).rejects.toThrow("treasure.fund_empty_err");
  });
});
