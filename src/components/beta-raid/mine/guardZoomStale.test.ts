// Жалоба 21.10.2026 («Мир Альфа»): игрок добил чужого охранника, захватил шахту
// и поставил своего. Вблизи на шахте — новый, а при отдалении — «старая стоит,
// которую снёс 10 мин назад». Вблизи (bucket > 2) охранник рисуется картинкой
// прямо в кадр, издалека — спрайтом под зум; спрайт и его мастер были по
// ключу КЛЕТКИ, а мастера из кэша не вытесняются — убитый жил до перезагрузки.
// Тест гоняет настоящий SpriteCache на подменённом canvas.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { drawBuilding } from "@/components/beta-raid/drawBuilding";
import { SpriteCache } from "@/components/beta-raid/spriteCache";
import { guardImageKey } from "@/components/beta-raid/mine/guardArt";
import type { DrawScene } from "@/components/beta-raid/betaCanvasScene";
import type { SceneCell } from "@/components/beta-raid/mapIndex";

/** Холст-пустышка: помнит, ЧТО на него нарисовали (картинки и другие холсты). */
type Painted = { drawn: unknown[] };

function recorder(target: Painted): CanvasRenderingContext2D {
  return new Proxy(
    {},
    {
      get: (_t, k: string) =>
        k === "drawImage" ? (src: unknown) => void target.drawn.push(src) : () => undefined,
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
}

beforeAll(() => {
  vi.stubGlobal("document", {
    createElement: () => {
      const cv: Painted & { width: number; height: number; getContext?: unknown } = {
        drawn: [],
        width: 0,
        height: 0,
      };
      cv.getContext = () => recorder(cv);
      return cv;
    },
  });
});
afterAll(() => vi.unstubAllGlobals());

const pic = (src: string) => ({ src, complete: true, naturalWidth: 100, naturalHeight: 100 });
const OLD = "/boss/killed.png";
const NEW = "/boss/mine.png";

/** Какие картинки в итоге легли на экран — разворачиваем спрайты до исходников. */
function sources(src: unknown): string[] {
  const p = src as Partial<Painted> & { src?: string };
  if (p.drawn) return p.drawn.flatMap(sources);
  return p.src ? [p.src] : [];
}

const cell = { key: "57,40", x: 0, y: 0 } as unknown as SceneCell;

function frame(sprites: SpriteCache, bucket: number, guardImage: string): string[] {
  const screen: Painted = { drawn: [] };
  sprites.beginFrame();
  const scene = {
    g: recorder(screen),
    bucket,
    sprites,
    buildingTiers: {},
    // Кэш картинок держит обе: старую ещё не вытеснили, новая уже пришла.
    images: new Map([
      ["b:mine:0", pic("/mine.png")],
      [guardImageKey(OLD), pic(OLD)],
      [guardImageKey(NEW), pic(NEW)],
    ]),
    mineGuards: { [cell.key]: { image: guardImage } },
  } as unknown as DrawScene;
  drawBuilding(scene, cell, "mine");
  return screen.drawn.flatMap(sources).filter((s) => s.startsWith("/boss/"));
}

describe("охранник шахты на разном зуме после смены", () => {
  it("издалека после смены охранника — новый, а не убитый", () => {
    const sprites = new SpriteCache();
    expect(frame(sprites, 1, OLD)).toEqual([OLD]);
    // Убитого сменил новый на той же клетке — кадр того же зума.
    expect(frame(sprites, 1, NEW)).toEqual([NEW]);
    // И на другом «далёком» зуме (свой спрайт из того же мастера).
    expect(frame(sprites, 0.6, NEW)).toEqual([NEW]);
  });

  it("вблизи и издалека — один и тот же охранник", () => {
    const sprites = new SpriteCache();
    frame(sprites, 1.5, OLD);
    expect(frame(sprites, 3, NEW)).toEqual([NEW]);
    expect(frame(sprites, 1.5, NEW)).toEqual([NEW]);
  });
});
