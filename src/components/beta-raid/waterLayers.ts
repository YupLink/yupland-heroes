// Рябь своей подложкой (12.11.2026). Раньше каждая из 8 фаз в секунду перерисовывала
// ВСЮ карту: на устройствах без ускорения холста (планшет Lenovo TB-X306F, часть
// Samsung/Xiaomi) это 80+ мс главного потока на кадр — 20–50 с подвисаний в минуту
// стоя у воды (perf_client 11–12.11; стенд с программной отрисовкой: занятость
// 1 % → 61 %). Теперь, пока рябь идёт, карта — три холста:
//   основной (местность кусками) → подложка ряби (≤512 точек, растягивает CSS) →
//   верхний (всё, что кадр рисует поверх воды: содержимое клеток, туман, герой).
// Смена фазы перерисовывает только подложку; основной и верхний не трогаются.
// Камера поехала — подложка гаснет, верхний освобождается, кадр снова один холст.
import { WATER_INTERVAL } from "./waterPattern";
import { COVERED_DELAY_MS } from "./mapCovered";

export type WaterView = { minX: number; minY: number; w: number; h: number };

export class WaterLayers {
  canvas: HTMLCanvasElement | null = null;
  private top: HTMLCanvasElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private place = "";
  shown = false;

  get attached(): boolean { return !!this.canvas && !!this.top; }

  attach(canvas: HTMLCanvasElement | null, top: HTMLCanvasElement | null) {
    this.hide();
    this.canvas = canvas;
    this.top = top;
  }

  /**
   * Подложку — на место окна v (мировые координаты) поверх основного холста g;
   * верхний холст — размером с основной, чистый, с его же переносом. Его и рисуем дальше.
   */
  show(g: CanvasRenderingContext2D, cssW: number, v: WaterView): CanvasRenderingContext2D | null {
    const cv = this.canvas, top = this.top;
    if (!cv || !top) return null;
    const main = g.canvas, m = g.getTransform(), k = cssW / main.width;
    const place = [m.a * v.minX + m.e, m.d * v.minY + m.f, m.a * v.w, m.d * v.h].map((n) => (n * k).toFixed(2));
    const key = place.join(":");
    if (key !== this.place) {
      this.place = key;
      cv.style.left = place[0] + "px"; cv.style.top = place[1] + "px";
      cv.style.width = place[2] + "px"; cv.style.height = place[3] + "px";
    }
    if (top.width !== main.width || top.height !== main.height) {
      top.width = main.width; top.height = main.height;
    }
    const t = top.getContext("2d");
    if (!t) return null;
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.clearRect(0, 0, top.width, top.height);
    t.setTransform(m);
    if (!this.shown) {
      cv.style.visibility = top.style.visibility = "visible";
      this.shown = true;
    }
    return t;
  }

  /** Ряби нет (едем, нет воды, вкладка скрыта): подложку прячем, верхний холст отпускаем. */
  hide() {
    this.stop();
    if (!this.shown) return;
    this.shown = false;
    this.place = "";
    if (this.canvas) this.canvas.style.visibility = "hidden";
    if (this.top) { this.top.style.visibility = "hidden"; this.top.width = this.top.height = 0; }
  }

  /** Следующая фаза — по общим часам ряби (waterPhase), мимо кадра карты. */
  schedule(tick: () => void, covered = false) {
    if (this.timer) return;
    const ms = covered ? COVERED_DELAY_MS : WATER_INTERVAL - (performance.now() % WATER_INTERVAL) + 1;
    this.timer = setTimeout(() => { this.timer = null; tick(); }, ms);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
