// Сломанная шахта — картинкой «разрушено» из набора: только четыре шаблона
// набора и только при пустой полосе службы; масштаб и опорная точка — как у
// обычной картинки (верх совпадает); пока картинка едет — обычная шахта.
import { beforeEach, describe, expect, it } from "vitest";
import { drawBrokenMine, mineArtKindOfBuilding, mineArtRect, MINE_ART_W } from "./drawMineArt";
import { drawBuilding } from "../drawBuilding";
import { setMineBars } from "../mine-life/mineLifeStore";
import { decodeMineLife } from "@/lib/mineLifeBars";
import { MINE_ART_PAD_B, MINE_ART_PAD_T, MINE_ART_PAD_X, mineArtKey } from "@/lib/mineArt";
import { MINE_PLACE_BUILDING } from "@/lib/minePlacement";
import type { DrawScene } from "../betaCanvasScene";
import type { SceneCell } from "../mapIndex";

const NOW = Date.now();
const STONE = MINE_PLACE_BUILDING.stone;

/**
 * «2,2» — ничья после поломки (w); «5,5» — ничья с рождения (остров до починки);
 * «3,3» — полная; «4,4» — запас кончился по часам (обход поломок ещё не прошёл).
 */
function loadBars(): void {
  const wire = { bars: `2,2,w;5,5;3,3,0,1,0;4,4,2,0.01,${3600}`, serverNow: NOW };
  setMineBars(decodeMineLife(wire, NOW).bars, 0);
}

const img = (w: number, h: number) =>
  ({ complete: true, naturalWidth: w, naturalHeight: h }) as HTMLImageElement;

/** Кэш картинок с журналом запросов (get и запускает загрузку в LazyImages). */
class Images extends Map<string, HTMLImageElement> {
  asked: string[] = [];
  override get(key: string) {
    this.asked.push(key);
    return super.get(key);
  }
}

function sceneWith(images: Images, extra: Partial<DrawScene> = {}) {
  const calls: Array<{ img: unknown; args: number[] }> = [];
  const g = {
    drawImage: (im: unknown, ...a: number[]) => calls.push({ img: im, args: a }),
    fillRect: () => {},
    strokeRect: () => {},
  };
  const scene = { g, images, buildingTiers: {}, bucket: 99, ...extra } as unknown as DrawScene;
  return { scene, calls };
}

beforeEach(loadBars);

describe("вид шахты по шаблону постройки", () => {
  it("четыре шаблона набора; энерго-шахта, облик и прочее — нет", () => {
    expect(mineArtKindOfBuilding(MINE_PLACE_BUILDING.wood)).toBe("wood");
    expect(mineArtKindOfBuilding(STONE)).toBe("stone");
    expect(mineArtKindOfBuilding(MINE_PLACE_BUILDING.gold)).toBe("gold");
    expect(mineArtKindOfBuilding(MINE_PLACE_BUILDING.diamonds)).toBe("diamonds");
    expect(mineArtKindOfBuilding("building_myA1ovKxRp")).toBeNull();
    expect(mineArtKindOfBuilding("skin:bskin_dm_gold")).toBeNull();
  });
});

describe("прямоугольник картинки набора", () => {
  it("шире на поля, низ чуть ниже, верх обычной картинки — на своём месте", () => {
    // Кадр каменной шахты: оригинал 617×697 + поля → 256×274.
    const r = mineArtRect(img(256, 274), 100, 200, MINE_ART_W);
    expect(r.w).toBeCloseTo(MINE_ART_W * (1 + 2 * MINE_ART_PAD_X));
    expect(r.x + r.w / 2).toBeCloseTo(100);
    expect(r.y + r.h).toBeCloseTo(200 + MINE_ART_W * MINE_ART_PAD_B);
    expect(r.top).toBeCloseTo(200 - MINE_ART_W * (697 / 617), 0);
    expect(r.top - r.y).toBeCloseTo(MINE_ART_W * MINE_ART_PAD_T);
  });
});

describe("drawBrokenMine", () => {
  const at = (key: string) => ({ key, x: 50, k: 1 });

  it("сломанная шахта набора — «разрушено», полоса — на верх обычной", () => {
    const images = new Images([[mineArtKey("stone", "destroyed"), img(256, 274)]]);
    const { scene, calls } = sceneWith(images);
    const top = drawBrokenMine(scene, at("2,2"), STONE, 80, MINE_ART_W, true);
    expect(top).not.toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].img).toBe(images.get(mineArtKey("stone", "destroyed")));
  });

  it("запас кончился по часам — тоже сломана", () => {
    const images = new Images([[mineArtKey("stone", "destroyed"), img(256, 274)]]);
    const { scene } = sceneWith(images);
    expect(drawBrokenMine(scene, at("4,4"), STONE, 80, MINE_ART_W, true)).not.toBeNull();
  });

  it("рабочая, ничья с рождения, без полосы или не шаблон набора — null, картинку не качаем", () => {
    const images = new Images([[mineArtKey("stone", "destroyed"), img(256, 274)]]);
    const { scene, calls } = sceneWith(images);
    expect(drawBrokenMine(scene, at("3,3"), STONE, 80, MINE_ART_W, true)).toBeNull();
    expect(drawBrokenMine(scene, at("5,5"), STONE, 80, MINE_ART_W, true)).toBeNull();
    expect(drawBrokenMine(scene, at("9,9"), STONE, 80, MINE_ART_W, true)).toBeNull();
    expect(drawBrokenMine(scene, at("2,2"), "building_myA1ovKxRp", 80, 47, true)).toBeNull();
    expect(images.asked).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("картинка ещё едет — null (рисуется обычная), но загрузка запрошена", () => {
    const loading = { complete: false, naturalWidth: 0, naturalHeight: 0 } as HTMLImageElement;
    const images = new Images([[mineArtKey("stone", "destroyed"), loading]]);
    const { scene } = sceneWith(images);
    expect(drawBrokenMine(scene, at("2,2"), STONE, 80, MINE_ART_W, true)).toBeNull();
    expect(images.asked).toEqual([mineArtKey("stone", "destroyed")]);
  });
});

describe("drawBuilding с шахтой набора", () => {
  const cell = (key: string) => ({ key, x: 100, y: 100 }) as unknown as SceneCell;
  const normal = img(100, 113);
  const ruin = img(256, 274);

  function run(key: string) {
    const images = new Images([
      [`b:${STONE}:0`, normal],
      [mineArtKey("stone", "destroyed"), ruin],
      ["flag-red", img(10, 10)],
    ]);
    const { scene, calls } = sceneWith(images, { mineFlags: { [key]: "enemy" } });
    const top = drawBuilding(scene, cell(key), STONE);
    return { calls, top };
  }

  it("сломанная — одна картинка «разрушено», без флажка; верх как у обычной", () => {
    const { calls, top } = run("2,2");
    expect(calls.map((c) => c.img)).toEqual([ruin]);
    const normalTop = run("3,3").top!;
    expect(Math.abs(top! - normalTop)).toBeLessThan(0.6);
  });

  it("ничья с рождения (остров новичка до починки) — обычная картинка, как раньше", () => {
    const { calls } = run("5,5");
    expect(calls.map((c) => c.img)).toEqual([img(10, 10), normal]);
    expect(calls[1].img).toBe(normal);
  });

  it("рабочая — как раньше: флажок и обычная картинка", () => {
    const { calls } = run("3,3");
    expect(calls).toHaveLength(2);
    expect(calls[1].img).toBe(normal);
    const [x, y, w, h] = calls[1].args;
    expect(w).toBeCloseTo(MINE_ART_W);
    expect(h).toBeCloseTo(MINE_ART_W * 1.13);
    expect(x).toBeCloseTo(100 - MINE_ART_W / 2);
    expect(y + h).toBeCloseTo(100 + 28 * 0.55);
  });
});
