import { describe, expect, it, vi } from "vitest";

const queued: string[] = [];
vi.mock("./imageQueue", () => ({ queueImage: (_img: unknown, url: string) => queued.push(url) }));

const { LazyImages } = await import("./lazyImages");
const img = () => ({}) as HTMLImageElement;

describe("LazyImages — картинки карты по требованию кадра", () => {
  it("заведённая картинка не качается, пока кадр её не попросил", () => {
    queued.length = 0;
    const m = new LazyImages();
    m.defer("o:a", img(), "/a");
    m.defer("o:b", img(), "/b");
    expect(queued).toEqual([]);
    expect(m.has("o:a")).toBe(true);
    expect(m.idle).toBe(2);
  });

  it("первый get ставит в очередь ровно один раз", () => {
    queued.length = 0;
    const m = new LazyImages();
    const a = img();
    m.defer("o:a", a, "/a");
    expect(m.get("o:a")).toBe(a);
    expect(m.get("o:a")).toBe(a);
    expect(queued).toEqual(["/a"]);
    expect(m.idle).toBe(0);
  });

  it("удалённая из словаря не качается и после get", () => {
    queued.length = 0;
    const m = new LazyImages();
    m.defer("o:a", img(), "/a");
    m.delete("o:a");
    expect(m.get("o:a")).toBeUndefined();
    expect(queued).toEqual([]);
  });

  it("обычный set — как у Map, без очереди", () => {
    queued.length = 0;
    const m = new LazyImages();
    const h = img();
    m.set("hero", h);
    expect(m.get("hero")).toBe(h);
    expect(queued).toEqual([]);
  });
});
