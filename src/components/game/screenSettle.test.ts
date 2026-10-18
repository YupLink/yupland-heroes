// Когда заставка может уходить: экран дорисован и ничего не качается.
import { describe, expect, it, vi } from "vitest";

type FakeImg = {
  src: string;
  listeners: Record<string, Array<() => void>>;
  addEventListener: (ev: string, fn: () => void) => void;
};
const fakeImg = (): FakeImg => {
  const img: FakeImg = {
    src: "",
    listeners: {},
    addEventListener: (ev, fn) => void (img.listeners[ev] ??= []).push(fn),
  };
  return img;
};

const domImg = (o: {
  complete?: boolean;
  lazy?: boolean;
  splash?: boolean;
  w?: number;
  top?: number;
}) => ({
  complete: o.complete ?? false,
  loading: o.lazy ? "lazy" : "auto",
  closest: (sel: string) => (o.splash && sel === ".game-load-state" ? {} : null),
  getBoundingClientRect: () => {
    const top = o.top ?? 10;
    const w = o.w ?? 40;
    return { width: w, height: w, top, left: 10, right: 10 + w, bottom: top + w };
  },
});
const doc = (images: unknown[], fonts = "loaded") =>
  ({
    images,
    defaultView: { innerWidth: 400, innerHeight: 800 },
    fonts: { status: fonts },
  }) as never;

describe("очередь картинок карты", () => {
  it("считает и ждущие, и летящие — ноль только когда всё догрузилось", async () => {
    vi.resetModules();
    const { queueImage, imagesInFlight } = await import("@/components/beta-raid/imageQueue");
    const imgs = Array.from({ length: 8 }, fakeImg);
    imgs.forEach((img, i) => queueImage(img as unknown as HTMLImageElement, `/a${i}.webp`));
    expect(imagesInFlight()).toBe(8);
    // Очередь пускает по 6: у двух последних адреса ещё нет.
    const started = imgs.filter((img) => img.src);
    expect(started).toHaveLength(6);
    for (const img of started) img.listeners.load?.[0]?.();
    expect(imagesInFlight()).toBe(2);
    for (const img of imgs.slice(6)) img.listeners.error?.[0]?.();
    expect(imagesInFlight()).toBe(0);
  });
});

describe("screenQuiet", () => {
  it("карта: нужен кадр этой карты, допечённая статика и разведанное с сервера", async () => {
    vi.resetModules();
    const s = await import("./settleSignals");
    const { screenQuiet } = await import("./useScreenSettled");
    const empty = doc([]);
    expect(screenQuiet("raid", empty)).toBe(false); // кадра ещё не было
    s.noteMapFrame(true);
    expect(screenQuiet("raid", empty)).toBe(false); // статика печётся
    s.noteMapFrame(false);
    expect(screenQuiet("raid", empty)).toBe(false); // туман не пришёл
    s.noteFogPulled();
    expect(screenQuiet("raid", empty)).toBe(true);
    // Качается значок интерфейса на экране или шрифт — ещё не тихо.
    expect(screenQuiet("raid", doc([domImg({})]))).toBe(false);
    expect(screenQuiet("raid", doc([], "loading"))).toBe(false);
    // Карту смонтировали заново — прежние кадры и туман не в счёт.
    s.noteMapMount();
    expect(screenQuiet("raid", empty)).toBe(false);
  });

  it("замок: ждёт свои картинки", async () => {
    vi.resetModules();
    const s = await import("./settleSignals");
    const { screenQuiet } = await import("./useScreenSettled");
    expect(screenQuiet("castle", doc([]))).toBe(false);
    s.noteCastleArt();
    expect(screenQuiet("castle", doc([]))).toBe(true);
  });
});

describe("domImagesPending", () => {
  it("считает только видимые незагруженные значки, не свою заставку и не ленивые", async () => {
    const { domImagesPending } = await import("./useScreenSettled");
    const images = [
      domImg({}), // качается, на экране — считаем
      domImg({ complete: true }),
      domImg({ lazy: true }),
      domImg({ splash: true }),
      domImg({ w: 0 }), // скрыт
      domImg({ top: 2000 }), // ниже экрана
    ];
    expect(domImagesPending(doc(images))).toBe(1);
    expect(domImagesPending(undefined)).toBe(0);
  });
});

describe("значки карты", () => {
  it("сразу качаются только стрелки маршрута, остальное — по требованию кадра", async () => {
    const { MAP_PRELOAD } = await import("@/lib/gameArt");
    expect(MAP_PRELOAD.filter((a) => a.eager).map((a) => a.key)).toEqual(["arrow", "runner-arrow"]);
  });
});
