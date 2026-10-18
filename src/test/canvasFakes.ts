// Поддельный канвас для тестов отрисовки карты рейда: записывает операции в
// МИРОВЫХ координатах (относительно базового setTransform), чтобы тест мог
// сверять порядок слоёв, а не пиксели. Браузерных тестов в проекте нет
// (окружение node), jsdom канвас всё равно не рисует.
//
// Кто что: картинка (FakeImage) → «dec», канвас до 120 px → «tile» (тайл
// местности из hexTileCache), крупнее → «chunk» (кусок статичного слоя, с
// ссылкой на его контекст), rect + clip → «clip».
export type Op = {
  kind: "tile" | "dec" | "clip" | "chunk";
  x: number;
  y: number;
  w: number;
  h: number;
  src?: FakeCtx;
};

export class FakeImage {
  complete = true;
  constructor(
    public naturalWidth: number,
    public naturalHeight: number,
  ) {}
}

export class FakeCanvas {
  width = 0;
  height = 0;
  ctx: FakeCtx | null = null;
  getContext() {
    return (this.ctx ??= new FakeCtx());
  }
}

export class FakeCtx {
  a = 1;
  e = 0;
  f = 0;
  base = { a: 1, e: 0, f: 0 };
  stack: number[][] = [];
  ops: Op[] = [];
  pendingRect = { x: 0, y: 0, w: 0, h: 0 };
  fillStyle = "";
  strokeStyle = "";
  lineWidth = 1;
  globalAlpha = 1;
  setTransform(a: number, _b: number, _c: number, _d: number, e: number, f: number) {
    this.a = a;
    this.e = e;
    this.f = f;
    this.base = { a, e, f };
  }
  translate(x: number, y: number) {
    this.e += x * this.a;
    this.f += y * this.a;
  }
  scale(s: number) {
    this.a *= s;
  }
  save() {
    this.stack.push([this.a, this.e, this.f]);
  }
  restore() {
    const s = this.stack.pop();
    if (s) [this.a, this.e, this.f] = s;
  }
  private world(dx: number, dy: number) {
    return {
      x: (this.e + dx * this.a - this.base.e) / this.base.a,
      y: (this.f + dy * this.a - this.base.f) / this.base.a,
    };
  }
  drawImage(src: unknown, dx: number, dy: number, dw = 0, dh = 0) {
    const p = this.world(dx, dy);
    if (src instanceof FakeImage) this.ops.push({ kind: "dec", ...p, w: dw, h: dh });
    else {
      const cv = src as FakeCanvas;
      if (cv.width <= 120) this.ops.push({ kind: "tile", ...p, w: dw, h: dh });
      else this.ops.push({ kind: "chunk", ...p, w: dw, h: dh, src: cv.ctx ?? undefined });
    }
  }
  rect(x: number, y: number, w: number, h: number) {
    this.pendingRect = { ...this.world(x, y), w, h };
  }
  clip() {
    this.ops.push({ kind: "clip", ...this.pendingRect });
  }
  fill() {}
  beginPath() {}
  arc() {}
  stroke() {}
  fillRect() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
}

export class FakePath2D {
  moveTo() {}
  lineTo() {}
  closePath() {}
  addPath() {}
}

/** Подменить document и Path2D на подделки — в beforeAll теста. */
export function installCanvasFakes(): void {
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => new FakeCanvas(),
  };
  (globalThis as unknown as { Path2D: unknown }).Path2D = FakePath2D;
}
