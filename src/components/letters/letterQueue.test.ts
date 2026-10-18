// Очередь писем на экране: по одному по порядку, «Понятно» убирает сразу,
// убранное не возвращается со свежим ответом, номер «2 из 3» не прыгает.
import { describe, expect, it } from "vitest";
import type { PlayerLetter } from "@/lib/letters";
import { letterQueue, nextLetters, withDone } from "./letterQueue";

const L = (id: string): PlayerLetter => ({
  id,
  title: id,
  body: "",
  image: null,
  titleEn: null,
  bodyEn: null,
});
const none: ReadonlySet<string> = new Set();

describe("очередь писем", () => {
  it("пусто — показывать нечего", () => {
    expect(letterQueue([], none)).toEqual({ current: null, position: 0, total: 0 });
  });

  it("несколько — по очереди, с номером", () => {
    const all = [L("a"), L("b"), L("c")];
    let done = none;
    expect(letterQueue(all, done)).toMatchObject({ current: { id: "a" }, position: 1, total: 3 });
    done = withDone(done, "a");
    expect(letterQueue(all, done)).toMatchObject({ current: { id: "b" }, position: 2, total: 3 });
    done = withDone(withDone(done, "b"), "c");
    expect(letterQueue(all, done).current).toBeNull();
  });

  it("повтор id — одно окно", () => {
    expect(letterQueue([L("a"), L("a")], none).total).toBe(1);
  });

  it("«Понятно» не мутирует прежнее множество, повтор — то же самое", () => {
    const done = withDone(none, "a");
    expect(none.has("a")).toBe(false);
    expect(withDone(done, "a")).toBe(done);
  });
});

describe("свежий ответ сервера", () => {
  it("окно открыто: прежние на местах, новые в конец, убранное не возвращается", () => {
    const done = withDone(none, "a");
    const next = nextLetters([L("a"), L("b")], [L("a"), L("b"), L("c")], done);
    expect(next.map((l) => l.id)).toEqual(["a", "b", "c"]);
    expect(letterQueue(next, done)).toMatchObject({ current: { id: "b" }, position: 2, total: 3 });
  });

  it("окно закрыто: счёт заново, без убранных", () => {
    const done = withDone(withDone(none, "a"), "b");
    const next = nextLetters([L("a"), L("b")], [L("b"), L("d")], done);
    expect(next.map((l) => l.id)).toEqual(["d"]);
    expect(letterQueue(next, done)).toMatchObject({ current: { id: "d" }, position: 1, total: 1 });
  });
});
