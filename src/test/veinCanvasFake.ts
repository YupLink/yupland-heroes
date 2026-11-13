// Холст-самописец для тестов жил (veinDraw.test): какие вызовы, в каком
// порядке и что за картинка лежит в каждом спрайте. canvasFakes.ts сортирует
// источники по размеру — спрайт жилы там неотличим от тайла местности.
export type Call = [string, ...unknown[]];

/** Холст-самописец: какие вызовы и с какими источниками. */
export class FakeCtx {
  calls: Call[] = [];
  fillStyle = "";
  imageSmoothingQuality = "low";
  private rec(name: string, args: unknown[]) {
    this.calls.push([name, ...args]);
  }
  setTransform(...a: unknown[]) {
    this.rec("setTransform", a);
  }
  translate(...a: unknown[]) {
    this.rec("translate", a);
  }
  rotate(...a: unknown[]) {
    this.rec("rotate", a);
  }
  clip(...a: unknown[]) {
    this.rec("clip", a);
  }
  drawImage(...a: unknown[]) {
    this.rec("drawImage", a);
  }
  fill() {
    this.rec("fill", [this.fillStyle]);
  }
  save() {
    this.rec("save", []);
  }
  restore() {
    this.rec("restore", []);
  }
  beginPath() {}
  rect() {}
}
export class FakeCanvas {
  width = 0;
  height = 0;
  readonly ctx = new FakeCtx();
  getContext() {
    return this.ctx;
  }
}
export const fakeImg = (name: string, ready = true) =>
  ({
    name,
    complete: ready,
    naturalWidth: ready ? 256 : 0,
    naturalHeight: 256,
  }) as unknown as HTMLImageElement;
/** Что за картинка лежит в спрайте: первый drawImage его холста. */
export const spriteSource = (src: unknown): string | null => {
  if (!(src instanceof FakeCanvas)) return null;
  const d = src.ctx.calls.find((c) => c[0] === "drawImage");
  return (d?.[1] as { name?: string } | undefined)?.name ?? null;
};
