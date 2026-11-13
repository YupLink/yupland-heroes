import type { FogView } from './fogMask';
import type { DrawScene } from './betaCanvasScene';
import { forEachVisible, type MapIndex } from './mapIndex';
import { hexPath2D } from './hexGeometry';
import { REACH, chunkId, chunkX, chunkY } from './chunkIndex';
import { blocksOf } from './mergeBlocks';
import { drawDecoration } from './drawDecoration';
import { RIBBON_DRAW_W, RIBBON_DRAW_H } from './roadRibbonCache';
import { veinsOf, veinKey } from './veinStore';
import { drawVein } from './veinDraw';
import { createWaterPhases, waterPhase, waterViewport, WATER_INTERVAL } from './waterPattern';
import { WaterLayers, type WaterView } from './waterLayers';
import { mapFramesHeld } from './mapFrameHold';
import { mapCovered } from './mapCovered';

/** One viewport mask, one work surface and 32 tiny phases per mounted renderer.
 * No world/chunk cache: panning any distance cannot grow water memory.
 * Draw after baked terrain and before moving content and fog.
 *
 * Пока камера едет (герой бежит, палец тащит карту), ряби нет: маска строится
 * по точному окну, и на ходу её пересобирали КАЖДЫЙ кадр — все клетки, дороги и
 * декор экрана заново (12.11.2026: подвисания телефонов ×4–10 с 11.11, «тупит на
 * пробежке»). Камера встала и постояла SETTLE_MS — маска строится один раз.
 *
 * Стоя маску тоже не пересобираем от каждого события карты (бой, чужой шаг —
 * просьба перерисовать): только когда сменились её источники — колонки
 * местности, дорог, декора, построек, купола, жил (правки карты копируют лишь
 * тронутые колонки) и туман; не чаще REBUILD_MS. Картинки декора ещё грузились —
 * догоняем до LOAD_TRIES пересборок (у декора может не быть картинки вовсе).
 * Планшет, реплей событий прода, ×16: подвисания 49 → 5 за 40 с.
 *
 * Есть свои холсты (attach, waterLayers) — фаза идёт мимо кадра карты: draw
 * отдаёт верхний холст, кадр дорисовывает на нём, а таймер ряби перекрашивает
 * только подложку. Нет (тесты, другие экраны) — как раньше: слой поверх кадра.
 */
const SETTLE_MS = 300;
const REBUILD_MS = 1000;
const LOAD_TRIES = 5;
export class WaterRipples {
  private mask: HTMLCanvasElement | null = null;
  private layer: HTMLCanvasElement | null = null;
  private phases: HTMLCanvasElement[] = [];
  private patterns: (CanvasPattern | null)[] = [];
  private key = '';
  /** Из чего собрана маска: колонки карты и туман (по ссылкам). */
  private deps: unknown[] = [];
  /** Источники сменились после сборки — пересобрать, но не чаще REBUILD_MS. */
  private stale = false;
  private soft = '';
  private builtAt = 0;
  private tries = 0;
  private ids: ReadonlySet<string> | undefined;
  private maskHasWater = false;
  private active = false;
  private paintedPhase = -1;
  /** Когда камера встала (null — едет, -∞ — стоит с начала); wake — разбудить кадр, когда постоит. */
  private still: number | null = -Infinity;
  private wake = false;
  private dom = new WaterLayers();
  private view: WaterView = { minX: 0, minY: 0, w: 0, h: 0 };
  private size = { width: 0, height: 0 };
  beginFrame() { this.active = false; this.wake = false; }
  attach(canvas: HTMLCanvasElement | null, top: HTMLCanvasElement | null) { this.dom.attach(canvas, top); this.paintedPhase = -1; }
  /** Просьба перерисовать кадр: слой фазы — заново (дёшево), маска — только по своим источникам. */
  invalidate() { this.paintedPhase = -1; }
  private reset() { this.key = ''; this.soft = ''; this.stale = false; this.tries = 0; this.paintedPhase = -1; }
  delay() {
    if (this.dom.attached) return this.wake ? SETTLE_MS : this.stale ? REBUILD_MS : null;
    return this.active ? WATER_INTERVAL : this.wake ? SETTLE_MS : null;
  }
  /** Ряби в кадре нет: своя подложка гаснет. */
  private off(): null { this.dom.hide(); return null; }
  clear() {
    this.dom.hide();
    for (const cv of [this.mask, this.layer, ...this.phases]) if (cv) cv.width = cv.height = 0;
    this.mask = this.layer = null; this.phases = []; this.patterns = [];
    this.deps = []; this.ids = undefined;
    this.active = this.maskHasWater = false; this.reset();
  }

  /** Холст, на котором кадр рисует всё поверх воды (своя подложка), или null — тот же. */
  draw(scene: DrawScene & { seen: FogView }, index: MapIndex, waterIds: ReadonlySet<string> | undefined, now: number, moving = false): CanvasRenderingContext2D | null {
    this.active = false;
    if (moving) { this.still = null; this.wake = true; return this.off(); }
    this.still ??= now;
    if (now - this.still < SETTLE_MS) { this.wake = true; return this.off(); }
    const v = scene.view, w = v.maxX - v.minX, h = v.maxY - v.minY;
    const size = waterViewport(w, h, scene.scale);
    if (!size || !waterIds?.size || !scene.covered.size || document.hidden
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return this.off();
    if (this.ids !== waterIds) { this.reset(); this.ids = waterIds; }
    const p = index.store.packed;
    const deps = [p.q, p.r, p.t, p.road, p.dec, p.bld, p.voidFog, p.groups, p.veins, scene.seen, scene.visible];
    if (deps.length !== this.deps.length || deps.some((d, k) => d !== this.deps[k])) {
      this.deps = deps; this.stale = true; this.tries = 0;
    }
    const soft = [scene.seen.version, scene.seen.size, scene.revealAll, scene.covered.size].join(':');
    if (soft !== this.soft) { this.soft = soft; this.stale = true; }
    const key = [v.minX, v.minY, w, h, size.width, size.height].join(':');
    if (key !== this.key) this.tries = 0;
    if (key !== this.key || (this.stale && now - this.builtAt >= REBUILD_MS)) {
      this.mask ??= document.createElement('canvas');
      if (!this.dom.attached) this.layer ??= document.createElement('canvas');
      this.mask.width = size.width; this.mask.height = size.height;
      const m = this.mask.getContext('2d');
      if (!m) return this.off();
      m.setTransform(size.width / w, 0, 0, size.height / h,
        -v.minX * size.width / w, -v.minY * size.height / h);
      m.imageSmoothingEnabled = false;
      const hex = hexPath2D(), water = new Path2D(), matrix = new DOMMatrix();
      let count = 0;
      forEachVisible(index, v, c => {
        if (!waterIds.has(c.cell.terrainId ?? '') || c.cell.voidFog
          || (!scene.revealAll && !scene.seen.hasIndex(c.i) && !scene.visible.has(c.i))
          || !scene.covered.has(chunkId(chunkX(c.x), chunkY(c.y)))) return;
        count++; matrix.e = c.x; matrix.f = c.y; water.addPath(hex, matrix);
      });
      this.maskHasWater = count > 0;
      let loading = false;
      if (count) {
        m.fillStyle = '#fff'; m.fill(water);
        m.globalCompositeOperation = 'destination-out';
        const blocks = blocksOf(index.store), veins = veinsOf(index.store.packed);
        // Include decor whose base is outside the viewport but whose crown hangs over water.
        forEachVisible(index, { minX: v.minX - REACH.x, maxX: v.maxX + REACH.x,
          minY: v.minY - REACH.y, maxY: v.maxY + REACH.dec }, c => {
          if (!scene.revealAll && !scene.seen.hasIndex(c.i) && !scene.visible.has(c.i)) return;
          m.save(); m.translate(c.x, c.y);
          const road = c.cell.roadId;
          if (road) {
            if (!scene.images.get('r:' + road)?.complete) loading = true;
            const ribbon = scene.ribbons.get(road, c.roadMask, scene.images.get('r:' + road));
            if (ribbon) m.drawImage(ribbon, -RIBBON_DRAW_W / 2, -RIBBON_DRAW_H / 2, RIBBON_DRAW_W, RIBBON_DRAW_H);
          }
          const vein = veins.size ? veins.get(veinKey(c.q, c.r)) : undefined;
          if (vein) drawVein(m, scene.images, vein);
          m.restore();
          const decor = c.cell.decorationId;
          if (decor && !scene.images.get('d:' + decor)?.complete) loading = true;
          if (decor && (blocks.groupOf[c.i] ?? -1) < 0) drawDecoration({ g: m, images: scene.images }, c, decor);
        });
        m.globalCompositeOperation = 'source-over';
      }
      // Картинка декора/дороги ещё грузилась — её вырез догоним следующей пересборкой.
      this.key = key; this.paintedPhase = -1; this.stale = loading && ++this.tries < LOAD_TRIES; this.builtAt = now;
    }
    // Пересборку отложили — кадр вернётся сам (delay), даже если воды пока нет.
    if (this.stale) this.active = true;
    if (!this.maskHasWater || !this.mask) return this.off();
    this.view = { minX: v.minX, minY: v.minY, w, h };
    this.size = size;
    if (this.dom.attached && this.dom.canvas) {
      const over = this.dom.show(scene.g, scene.W, this.view);
      if (!over || !this.paint(this.dom.canvas, now)) return this.off();
      this.dom.schedule(this.tick);
      return over;
    }
    if (!this.layer || !this.paint(this.layer, now)) return null;
    scene.g.save(); scene.g.imageSmoothingEnabled = false;
    scene.g.drawImage(this.layer, v.minX, v.minY, w, h); scene.g.restore();
    this.active = true;
    return null;
  }

  /** Фаза ряби в холст target (размер — окна маски). false — рисовать нечем. */
  private paint(target: HTMLCanvasElement, now: number): boolean {
    const { width, height } = this.size, { minX, minY, w, h } = this.view;
    if (target.width !== width || target.height !== height) {
      target.width = width; target.height = height; this.paintedPhase = -1;
    }
    const g = target.getContext('2d');
    if (!g || !this.mask) return false;
    if (!this.phases.length) {
      this.phases = createWaterPhases();
      this.patterns = this.phases.map(cv => {
        const pattern = g.createPattern(cv, 'repeat');
        pattern?.setTransform(new DOMMatrix([2, 0, 0, 2, 0, 0]));
        return pattern;
      });
    }
    const phase = waterPhase(now), pattern = this.patterns[phase];
    if (!pattern) return false;
    if (this.paintedPhase !== phase) {
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, width, height);
      g.imageSmoothingEnabled = false;
      g.setTransform(width / w, 0, 0, height / h, -minX * width / w, -minY * height / h);
      g.fillStyle = pattern; g.fillRect(minX, minY, w, h);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(this.mask, 0, 0);
      g.globalCompositeOperation = 'source-over'; this.paintedPhase = phase;
    }
    return true;
  }

  /** Таймер ряби: только подложка, кадр карты не трогаем. */
  private tick = () => {
    if (!this.dom.shown || !this.dom.canvas || document.hidden || mapFramesHeld()) return;
    // Под окном фаза стоит; проверяем раз в секунду, не закрылось ли.
    if (mapCovered()) { this.dom.schedule(this.tick, true); return; }
    if (this.paint(this.dom.canvas, performance.now())) this.dom.schedule(this.tick);
  };
}
