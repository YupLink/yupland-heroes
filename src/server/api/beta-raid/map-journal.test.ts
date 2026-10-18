// Сведение журнала в дельту: позже главнее, полная пересборка — снимок,
// слишком много клеток — снимок, версии не хватило — снимок.
import { describe, expect, it } from "vitest";
import { squashJournal, JOURNAL_MAX_CELLS, JOURNAL_MAX_ROWS } from "./map-journal";

describe("map-journal.squashJournal", () => {
  it("та же версия — пустая дельта", () => {
    expect(squashJournal([], 5, 5)).toEqual({ rev: 5, patches: [] });
  });
  it("нет строк, а версия ушла — снимок", () => {
    expect(squashJournal([], 5, 7)).toEqual({ full: true, rev: 7, lagging: true });
  });
  it("правки одной клетки сливаются, позже главнее; словари складываются", () => {
    const out = squashJournal(
      [
        {
          revision: 6,
          patch: {
            patches: [{ q: 1, r: 1, objectId: "a", alive: true }],
            assets: { objects: { a: { id: "a" } } },
          },
        },
        {
          revision: 7,
          patch: {
            patches: [
              { q: 1, r: 1, alive: false },
              { q: 2, r: 2, tier: 3 },
            ],
          },
        },
      ],
      5,
      7,
    );
    expect(out.full).toBeFalsy();
    if (out.full) throw new Error("unexpected");
    expect(out.rev).toBe(7);
    expect(out.patches).toEqual([
      { q: 1, r: 1, objectId: "a", alive: false },
      { q: 2, r: 2, tier: 3 },
    ]);
    expect(out.assets?.objects).toEqual({ a: { id: "a" } });
  });
  it("дыра в середине журнала — снимок", () => {
    const row = (revision: number) => ({
      revision,
      patch: { patches: [{ q: 1, r: revision, tier: 1 }] },
    });
    expect(squashJournal([row(6), row(8)], 5, 8)).toEqual({ full: true, rev: 8 });
  });
  it("версия ушла дальше последней строки журнала — снимок", () => {
    const row = (revision: number) => ({
      revision,
      patch: { patches: [{ q: 1, r: revision, tier: 1 }] },
    });
    expect(squashJournal([row(6), row(7)], 5, 8)).toEqual({ full: true, rev: 8, lagging: true });
  });
  it("журнал начинается не сразу после from — снимок", () => {
    expect(
      squashJournal([{ revision: 8, patch: { patches: [{ q: 1, r: 1, tier: 1 }] } }], 5, 8),
    ).toEqual({ full: true, rev: 8 });
  });
  it("полная пересборка внутри окна — снимок", () => {
    const out = squashJournal(
      [
        { revision: 6, patch: { patches: [{ q: 1, r: 1, tier: 1 }] } },
        { revision: 7, patch: { full: true } },
      ],
      5,
      7,
    );
    expect(out).toEqual({ full: true, rev: 7 });
  });
  it("больше JOURNAL_MAX_CELLS клеток — снимок", () => {
    const patches = Array.from({ length: JOURNAL_MAX_CELLS + 1 }, (_, i) => ({
      q: i,
      r: 0,
      tier: 1,
    }));
    expect(squashJournal([{ revision: 6, patch: { patches } }], 5, 6)).toEqual({
      full: true,
      rev: 6,
    });
  });
  it("окно строк исчерпано, а до текущей версии не дошли — снимок", () => {
    const rows = Array.from({ length: JOURNAL_MAX_ROWS }, (_, i) => ({
      revision: 6 + i,
      patch: { patches: [{ q: 0, r: 0, tier: i }] },
    }));
    expect(squashJournal(rows, 5, 6 + JOURNAL_MAX_ROWS + 10)).toEqual({
      full: true,
      rev: 6 + JOURNAL_MAX_ROWS + 10,
      lagging: false,
    });
  });
});
