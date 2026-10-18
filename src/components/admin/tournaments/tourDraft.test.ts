// Форма турнира: черновик строк мест → bands, проверка через bandsError,
// раскладка плашек по разделам и «сколько осталось».
import { describe, expect, it } from "vitest";
import { fundDarai } from "@/lib/tournament/places";
import type { TourAdminRow } from "@/lib/tournament/types";
import {
  amountOf,
  bandsOfDraft,
  daysOf,
  draftError,
  draftOfRow,
  emptyTourDraft,
  nextBandPlaces,
  prizeOfDraft,
  prizeOfUiKind,
  savePayload,
  uiKindOf,
  type TourDraft,
} from "./tourDraft";
import { groupTours, timeLeft } from "./tourList";

const darai = (amount: string) => ({ ...prizeOfUiKind("darai"), amount });
const gold = (amount: string) => ({ ...prizeOfUiKind("resource"), amount });
const box = (amount: string) => ({
  kind: "pack" as const,
  amount,
  refId: "cp_x",
  title: "Бокс",
  image: "/b.webp",
});

const draft = (patch: Partial<TourDraft> = {}): TourDraft => ({
  ...emptyTourDraft(),
  name: "Осенний урон",
  bands: [
    { places: "1", prizes: [darai("1000"), gold("50000")] },
    { places: " 2-3 ", prizes: [darai("500"), box("2")] },
  ],
  ...patch,
});

describe("черновик → bands", () => {
  it("места обрезаны, суммы числами, фонд DARAI по местам", () => {
    const bands = bandsOfDraft(draft());
    expect(bands[1].places).toBe("2-3");
    expect(bands[0].prizes).toEqual([
      { kind: "token", amount: 1000, refId: "Darai", title: null, image: null },
      { kind: "resource", amount: 50000, refId: "gold", title: null, image: null },
    ]);
    expect(bands[1].prizes[1]).toEqual({
      kind: "pack",
      amount: 2,
      refId: "cp_x",
      title: "Бокс",
      image: "/b.webp",
    });
    expect(fundDarai(bands)).toBe(1000 + 2 * 500);
  });

  it("штучное — целое вниз, запятая — точка, мусор — 0", () => {
    expect(amountOf("pack", "2.9")).toBe(2);
    expect(amountOf("energy", "1,5")).toBe(1.5);
    expect(amountOf("token", "abc")).toBe(0);
  });

  it("чужие поля вычищены: у энергии нет ref, у токена нет подписи", () => {
    expect(
      prizeOfDraft({ kind: "energy", amount: "5", refId: "Darai", title: "x", image: "y" }),
    ).toEqual({
      kind: "energy",
      amount: 5,
      refId: null,
      title: null,
      image: null,
    });
    expect(
      prizeOfDraft({ kind: "token", amount: "5", refId: " USDT ", title: "x", image: null }).title,
    ).toBeNull();
  });
});

describe("проверка формы", () => {
  it("верная форма — без ошибки; бесплатная запись — тоже", () => {
    expect(draftError(draft())).toBeNull();
    expect(draftError(draft({ entryPrice: [] }))).toBeNull();
  });

  it("цена записи: отказ ключом tour.err.price_*, хвосты чужих ресурсов не уходят", () => {
    const priced = (entryPrice: TourDraft["entryPrice"]) => draft({ entryPrice });
    // Строка без суммы — ошибка, а не тихая бесплатная запись.
    expect(draftError(priced([{ resource: "gold", amount: 0 }]))).toBe("tour.err.price_amount");
    expect(draftError(priced([{ resource: "gold", amount: 1.5 }]))).toBe("tour.err.price_amount");
    expect(draftError(priced([{ resource: "token", token: null, amount: 1 }]))).toBe(
      "tour.err.price_token",
    );
    expect(draftError(priced([{ resource: "pack", amount: 1 }]))).toBe("tour.err.price_resource");
    const tail = priced([{ resource: "gold", token: "USDT", itemKey: "custom:x", amount: 5 }]);
    expect(savePayload(tail).entryPrice).toEqual([{ resource: "gold", amount: 5 }]);
  });

  it("ошибки ключами tour.err.*", () => {
    expect(draftError(draft({ name: "  " }))).toBe("tour.err.name");
    expect(draftError(draft({ days: "0" }))).toBe("tour.err.days");
    expect(draftError(draft({ days: "91" }))).toBe("tour.err.days");
    expect(draftError(draft({ days: "2.5" }))).toBe("tour.err.days");
    expect(draftError(draft({ bands: [{ places: "abc", prizes: [darai("1")] }] }))).toBe(
      "tour.err.places",
    );
    expect(draftError(draft({ bands: [{ places: "1", prizes: [] }] }))).toBe("tour.err.no_prize");
    expect(draftError(draft({ bands: [] }))).toBe("tour.err.no_prize");
    expect(draftError(draft({ bands: [{ places: "1", prizes: [darai("0")] }] }))).toBe(
      "tour.err.amount",
    );
    expect(
      draftError(
        draft({
          bands: [
            { places: "1-3", prizes: [darai("1")] },
            { places: "3", prizes: [darai("1")] },
          ],
        }),
      ),
    ).toBe("tour.err.overlap");
  });

  it("приз без выбора (токен/бокс/артефакт) — tour.err.prize", () => {
    const noBox = { ...prizeOfUiKind("pack"), amount: "1" };
    expect(draftError(draft({ bands: [{ places: "1", prizes: [noBox] }] }))).toBe("tour.err.prize");
    const noToken = { ...prizeOfUiKind("token"), refId: null, amount: "10" };
    expect(draftError(draft({ bands: [{ places: "1", prizes: [noToken] }] }))).toBe(
      "tour.err.prize",
    );
    const noCustom = { ...prizeOfUiKind("custom"), amount: "3" };
    expect(draftError(draft({ bands: [{ places: "1", prizes: [noCustom] }] }))).toBe(
      "tour.err.prize",
    );
  });

  it("дни: целое 1..90", () => {
    expect(daysOf("7")).toBe(7);
    expect(daysOf("")).toBeNull();
  });
});

describe("строки и виды", () => {
  it("новая строка — место за самым дальним", () => {
    expect(
      nextBandPlaces([
        { places: "1", prizes: [] },
        { places: "2-5", prizes: [] },
      ]),
    ).toBe("6");
    expect(nextBandPlaces([])).toBe("1");
  });

  it("DARAI — тоже токен (по умолчанию), ресурс сразу золото, артефакт по редкости", () => {
    expect(prizeOfUiKind("token")).toMatchObject({ kind: "token", refId: "Darai" });
    expect(uiKindOf(prizeOfUiKind("token"))).toBe("token");
    expect(uiKindOf({ kind: "token", refId: "USDT" })).toBe("token");
    expect(prizeOfUiKind("art_rarity")).toMatchObject({ kind: "art", refId: "rarity:legendary" });
    expect(uiKindOf({ kind: "art", refId: "rarity:epic" })).toBe("art_rarity");
    expect(uiKindOf({ kind: "art", refId: "artifact_x" })).toBe("art");
    expect(prizeOfUiKind("resource", "5")).toMatchObject({
      kind: "resource",
      refId: "gold",
      amount: "5",
    });
  });

  it("строка сервера → черновик → тело сохранения", () => {
    const row: TourAdminRow = {
      id: "t1",
      name: "Шаги",
      metric: "steps",
      days: 3,
      status: "draft",
      bands: [{ places: "1", prizes: [{ kind: "energy", amount: 50 }] }],
      fundDarai: 0,
      createdAt: "2026-10-03T00:00:00Z",
      startedAt: null,
      endsAt: null,
      finishedAt: null,
      dry: true,
      players: 0,
      startAt: null,
      endAt: null,
      lastError: null,
      entryPrice: [{ resource: "token", token: "USDT", amount: 0.5 }],
    };
    const p = savePayload(draftOfRow(row));
    expect(p).toEqual({
      id: "t1",
      name: "Шаги",
      metric: "steps",
      days: 3,
      startAt: null,
      endAt: null,
      bands: [
        {
          places: "1",
          prizes: [{ kind: "energy", amount: 50, refId: null, title: null, image: null }],
        },
      ],
      entryPrice: [{ resource: "token", token: "USDT", amount: 0.5 }],
      items: [],
    });
    expect("id" in savePayload(emptyTourDraft())).toBe(false);
    // Новый турнир — 5 золота (владелец, 04.10); правка черновика не трогает образец.
    const fresh = emptyTourDraft();
    expect(savePayload(fresh).entryPrice).toEqual([{ resource: "gold", amount: 5 }]);
    fresh.entryPrice[0].amount = 9;
    expect(emptyTourDraft().entryPrice).toEqual([{ resource: "gold", amount: 5 }]);
  });
});

describe("список плашек", () => {
  const row = (id: string, status: TourAdminRow["status"], endsAt: string | null = null) =>
    ({ id, status, endsAt, createdAt: "2026-10-01T00:00:00Z", finishedAt: null }) as TourAdminRow;

  it("разделы: черновики / идут (и раздача призов) / завершены; идущие — кто раньше кончится", () => {
    const g = groupTours([
      row("a", "running", "2026-10-09T00:00:00Z"),
      row("b", "draft"),
      row("c", "paying"),
      row("d", "running", "2026-10-05T00:00:00Z"),
      row("e", "done"),
    ]);
    expect(g.draft.map((r) => r.id)).toEqual(["b"]);
    expect(g.running.map((r) => r.id)).toEqual(["c", "d", "a"]);
    expect(g.done.map((r) => r.id)).toEqual(["e"]);
  });

  it("сколько осталось", () => {
    const now = Date.parse("2026-10-03T00:00:00Z");
    expect(timeLeft("2026-10-05T03:20:00Z", now)).toEqual({ d: 2, h: 3, m: 20 });
    expect(timeLeft("2026-10-02T00:00:00Z", now)).toBeNull();
    expect(timeLeft(null, now)).toBeNull();
  });
});
