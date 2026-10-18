// Двоичная куча для поиска пути: всегда достаём самый дешёвый узел.
//
// Обычная очередь давала кратчайший путь по числу шагов, а не по энергии:
// на корабле десять клеток по воде (по 1) проигрывали трём по горам (по 5).
// Куча делает поиск дейкстровским, оставаясь дешёвой по памяти.
//
// Ключ и значение — числа в типизированных массивах, а не объекты в обычном:
// узел кладётся в кучу десятки тысяч раз за тап, и пара {key, value} на каждый
// push — это десятки тысяч объектов в мусор на одно касание экрана.
export class MinHeap {
  private keys: Float64Array;
  private vals: Int32Array;
  private count = 0;

  constructor(capacity = 1024) {
    this.keys = new Float64Array(capacity);
    this.vals = new Int32Array(capacity);
  }

  get size(): number {
    return this.count;
  }

  push(key: number, value: number): void {
    if (this.count === this.keys.length) this.grow();
    const { keys, vals } = this;
    let i = this.count++;
    keys[i] = key;
    vals[i] = value;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= keys[i]) break;
      this.swap(p, i);
      i = p;
    }
  }

  /** Самый дешёвый узел. Куча пуста — вернётся −1 (номера клеток неотрицательны). */
  pop(): number {
    if (this.count === 0) return -1;
    const { keys, vals } = this;
    const top = vals[0];
    const last = --this.count;
    keys[0] = keys[last];
    vals[0] = vals[last];
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let m = i;
      if (l < this.count && keys[l] < keys[m]) m = l;
      if (r < this.count && keys[r] < keys[m]) m = r;
      if (m === i) break;
      this.swap(m, i);
      i = m;
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const { keys, vals } = this;
    const k = keys[a];
    keys[a] = keys[b];
    keys[b] = k;
    const v = vals[a];
    vals[a] = vals[b];
    vals[b] = v;
  }

  private grow(): void {
    const keys = new Float64Array(this.keys.length * 2);
    const vals = new Int32Array(this.vals.length * 2);
    keys.set(this.keys);
    vals.set(this.vals);
    this.keys = keys;
    this.vals = vals;
  }
}
