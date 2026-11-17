// Проходимость и поиск пути для одной «зоны» (участок или комната в доме).
// Препятствия — круги и прямоугольники на плоскости XZ.
// Путь ищется A* по сетке, затем лишние точки выкидываются (прямая видимость).

export type Obstacle =
  | { kind: 'circle'; x: number; z: number; r: number }
  | { kind: 'rect'; minX: number; maxX: number; minZ: number; maxZ: number };

export interface P2 {
  x: number;
  z: number;
}

export class NavArea {
  readonly cols: number;
  readonly rows: number;
  private blocked: Uint8Array;

  constructor(
    readonly minX: number,
    readonly maxX: number,
    readonly minZ: number,
    readonly maxZ: number,
    readonly cell: number,
    readonly obstacles: Obstacle[],
    readonly agentRadius: number,
  ) {
    this.cols = Math.ceil((maxX - minX) / cell);
    this.rows = Math.ceil((maxZ - minZ) / cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const p = this.cellCenter(c, r);
        this.blocked[r * this.cols + c] = this.isFreePoint(p.x, p.z) ? 0 : 1;
      }
    }
  }

  cellCenter(c: number, r: number): P2 {
    return { x: this.minX + (c + 0.5) * this.cell, z: this.minZ + (r + 0.5) * this.cell };
  }

  private cellOf(x: number, z: number): [number, number] {
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.minX) / this.cell)));
    const r = Math.min(this.rows - 1, Math.max(0, Math.floor((z - this.minZ) / this.cell)));
    return [c, r];
  }

  /** Может ли центр героя стоять в этой точке. */
  isFreePoint(x: number, z: number): boolean {
    const R = this.agentRadius;
    if (x < this.minX + R || x > this.maxX - R || z < this.minZ + R || z > this.maxZ - R) return false;
    for (const o of this.obstacles) {
      if (o.kind === 'circle') {
        const dx = x - o.x;
        const dz = z - o.z;
        if (dx * dx + dz * dz < (o.r + R) * (o.r + R)) return false;
      } else {
        const cx = Math.max(o.minX, Math.min(x, o.maxX));
        const cz = Math.max(o.minZ, Math.min(z, o.maxZ));
        const dx = x - cx;
        const dz = z - cz;
        if (dx * dx + dz * dz < R * R) return false;
      }
    }
    return true;
  }

  /** Выталкивает точку из препятствий (для WASD: скольжение вдоль стен). */
  resolve(p: P2): P2 {
    const R = this.agentRadius;
    let { x, z } = p;
    for (let iter = 0; iter < 3; iter++) {
      for (const o of this.obstacles) {
        if (o.kind === 'circle') {
          const dx = x - o.x;
          const dz = z - o.z;
          const d = Math.hypot(dx, dz);
          const min = o.r + R;
          if (d < min) {
            if (d < 1e-6) {
              x = o.x + min;
            } else {
              x = o.x + (dx / d) * min;
              z = o.z + (dz / d) * min;
            }
          }
        } else {
          const inside = x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ;
          if (inside) {
            // вытолкнуть по ближайшей стороне
            const dl = x - o.minX;
            const dr = o.maxX - x;
            const dt = z - o.minZ;
            const db = o.maxZ - z;
            const m = Math.min(dl, dr, dt, db);
            if (m === dl) x = o.minX - R;
            else if (m === dr) x = o.maxX + R;
            else if (m === dt) z = o.minZ - R;
            else z = o.maxZ + R;
            continue;
          }
          const cx = Math.max(o.minX, Math.min(x, o.maxX));
          const cz = Math.max(o.minZ, Math.min(z, o.maxZ));
          const dx = x - cx;
          const dz = z - cz;
          const d = Math.hypot(dx, dz);
          if (d < R && d > 1e-6) {
            x = cx + (dx / d) * R;
            z = cz + (dz / d) * R;
          }
        }
      }
      x = Math.max(this.minX + R, Math.min(this.maxX - R, x));
      z = Math.max(this.minZ + R, Math.min(this.maxZ - R, z));
    }
    return { x, z };
  }

  /**
   * Ближайшая к цели свободная клетка. Среди почти одинаково близких
   * выбирается та, что ближе к герою, — чтобы не обходить пень кругом.
   */
  nearestFree(target: P2, from: P2, maxRadius: number): P2 | null {
    if (this.isFreePoint(target.x, target.z)) return { ...target };
    const [tc, tr] = this.cellOf(target.x, target.z);
    const rad = Math.ceil(maxRadius / this.cell);
    let best: P2 | null = null;
    let bestD = Infinity;
    const cand: { p: P2; d: number }[] = [];
    for (let r = tr - rad; r <= tr + rad; r++) {
      if (r < 0 || r >= this.rows) continue;
      for (let c = tc - rad; c <= tc + rad; c++) {
        if (c < 0 || c >= this.cols) continue;
        if (this.blocked[r * this.cols + c]) continue;
        const p = this.cellCenter(c, r);
        const d = Math.hypot(p.x - target.x, p.z - target.z);
        cand.push({ p, d });
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
    }
    if (!best) return null;
    const slack = this.cell * 2;
    let pick = best;
    let pickD = Infinity;
    for (const { p, d } of cand) {
      if (d > bestD + slack) continue;
      const dp = Math.hypot(p.x - from.x, p.z - from.z);
      if (dp < pickD) {
        pickD = dp;
        pick = p;
      }
    }
    return pick;
  }

  /** Есть ли прямой свободный проход между точками. */
  lineOfSight(a: P2, b: P2): boolean {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.isFreePoint(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  /** Путь от from до goal (goal уже должна быть свободной). Без стартовой точки. */
  findPath(from: P2, goal: P2): P2[] | null {
    if (this.lineOfSight(from, goal)) return [goal];

    let start = from;
    if (!this.isFreePoint(from.x, from.z)) {
      const s = this.nearestFree(from, from, 2);
      if (!s) return null;
      start = s;
    }
    const [sc, sr] = this.cellOf(start.x, start.z);
    const [gc, gr] = this.cellOf(goal.x, goal.z);
    const W = this.cols;
    const N = W * this.rows;
    const startI = sr * W + sc;
    const goalI = gr * W + gc;

    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = new MinHeap();
    const h = (i: number) => {
      const c = i % W;
      const r = (i / W) | 0;
      const dx = Math.abs(c - gc);
      const dz = Math.abs(r - gr);
      return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
    };
    g[startI] = 0;
    heap.push(startI, h(startI));
    const dirs = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
    ];
    let found = false;
    while (heap.size > 0) {
      const cur = heap.pop();
      if (cur === goalI) {
        found = true;
        break;
      }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cc = cur % W;
      const cr = (cur / W) | 0;
      for (const [dc, dr, cost] of dirs) {
        const nc = cc + dc;
        const nr = cr + dr;
        if (nc < 0 || nr < 0 || nc >= W || nr >= this.rows) continue;
        const ni = nr * W + nc;
        if (this.blocked[ni] && ni !== goalI) continue;
        // не срезать углы по диагонали
        if (dc !== 0 && dr !== 0) {
          if (this.blocked[cr * W + nc] || this.blocked[nr * W + cc]) continue;
        }
        const ng = g[cur] + cost;
        if (ng < g[ni]) {
          g[ni] = ng;
          came[ni] = cur;
          heap.push(ni, ng + h(ni));
        }
      }
    }
    if (!found) return null;

    const cells: P2[] = [];
    for (let i = goalI; i !== -1 && i !== startI; i = came[i]) {
      cells.push(this.cellCenter(i % W, (i / W) | 0));
    }
    cells.reverse();
    if (cells.length === 0) cells.push(goal);
    else cells[cells.length - 1] = goal;
    if (start !== from) cells.unshift(start);

    // сглаживание: оставляем только точки, без которых нет прямой видимости
    const out: P2[] = [];
    let anchor = from;
    let i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.lineOfSight(anchor, cells[j])) j--;
      out.push(cells[j]);
      anchor = cells[j];
      i = j + 1;
    }
    return out;
  }
}

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, key: number) {
    const a = this.ids;
    const k = this.keys;
    a.push(id);
    k.push(key);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [a[p], a[i]] = [a[i], a[p]];
      [k[p], k[i]] = [k[i], k[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.ids;
    const k = this.keys;
    const top = a[0];
    const lastId = a.pop()!;
    const lastK = k.pop()!;
    if (a.length > 0) {
      a[0] = lastId;
      k[0] = lastK;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && k[l] < k[m]) m = l;
        if (r < a.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        [k[m], k[i]] = [k[i], k[m]];
        i = m;
      }
    }
    return top;
  }
}
