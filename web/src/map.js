import { TILE, MAP_W, MAP_H, T } from './config.js';

// Small seeded PRNG so a map can be regenerated from its seed (useful for multiplayer).
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class GameMap {
  constructor(seed) {
    this.w = MAP_W;
    this.h = MAP_H;
    this.pw = MAP_W * TILE;
    this.ph = MAP_H * TILE;
    this.tiles = new Uint8Array(MAP_W * MAP_H);
    this.rand = rng(seed);
    this.generate();
    this.spawns = this.pickSpots(20, 140);
    this.pickupSpots = this.pickSpots(12, 220);
  }

  get(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return T.ROCK;
    return this.tiles[ty * this.w + tx];
  }

  set(tx, ty, v) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
    this.tiles[ty * this.w + tx] = v;
  }

  solidAt(px, py) {
    return this.get(Math.floor(px / TILE), Math.floor(py / TILE)) !== T.EMPTY;
  }

  rectSolid(x, y, w, h) {
    const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.001) / TILE);
    const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.get(tx, ty) !== T.EMPTY) return true;
    return false;
  }

  raycast(x0, y0, x1, y1) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8);
    for (let i = 1; i < n; i++) {
      const f = i / n;
      if (this.solidAt(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f)) return false;
    }
    return true;
  }

  blob(cx, cy, rad, type, from) {
    for (let y = Math.floor(cy - rad); y <= cy + rad; y++)
      for (let x = Math.floor(cx - rad); x <= cx + rad; x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad && this.get(x, y) === from) this.set(x, y, type);
  }

  generate() {
    const r = this.rand, W = this.w, H = this.h;
    const ph = [r() * 10, r() * 10, r() * 10];
    this.surface = [];
    for (let x = 0; x < W; x++) {
      const s = H * 0.64 + Math.sin(x * 0.045 + ph[0]) * 6 + Math.sin(x * 0.11 + ph[1]) * 3 + Math.sin(x * 0.27 + ph[2]) * 1.2;
      this.surface[x] = Math.round(s);
      for (let y = this.surface[x]; y < H; y++) this.set(x, y, T.DIRT);
    }

    // indestructible boulders buried in the ground
    for (let i = 0; i < 10; i++) {
      const x = 3 + r() * (W - 6);
      this.blob(x, this.surface[x | 0] + 6 + r() * 12, 1.5 + r() * 2, T.ROCK, T.DIRT);
    }

    // tunnels
    for (let i = 0; i < 6; i++) {
      let cx = 8 + r() * (W - 16), cy = this.surface[cx | 0] + 5 + r() * 10, a = r() * Math.PI * 2;
      const len = 25 + r() * 30;
      for (let s = 0; s < len; s++) {
        this.blob(cx, cy, 1.8 + r() * 1.2, T.EMPTY, T.DIRT);
        a += (r() - 0.5) * 0.7;
        cx = Math.min(W - 5, Math.max(4, cx + Math.cos(a) * 1.4));
        cy = Math.min(H - 6, Math.max(10, cy + Math.sin(a) * 0.6));
      }
    }

    // floating platforms
    for (let i = 0; i < 18; i++) {
      const w = 5 + Math.floor(r() * 10);
      const x0 = 3 + Math.floor(r() * (W - w - 6));
      let minS = H;
      for (let x = x0; x < x0 + w; x++) minS = Math.min(minS, this.surface[x]);
      const top = minS - 7 - Math.floor(r() * 26);
      if (top < 5) continue;
      const metal = r() < 0.35;
      for (let x = x0; x < x0 + w; x++) {
        this.set(x, top, metal ? T.METAL : T.DIRT);
        if (!metal) {
          this.set(x, top + 1, T.DIRT);
          if (x > x0 && x < x0 + w - 1 && r() < 0.6) this.set(x, top + 2, T.DIRT);
        }
      }
    }

    // towers with metal caps
    for (let i = 0; i < 4; i++) {
      const x0 = 10 + Math.floor(r() * (W - 20)), h = 6 + Math.floor(r() * 8);
      const base = Math.max(this.surface[x0], this.surface[x0 + 1], this.surface[x0 + 2]);
      for (let x = x0; x < x0 + 3; x++) for (let y = base - h; y <= base; y++) this.set(x, y, T.DIRT);
      for (let x = x0 - 1; x < x0 + 4; x++) this.set(x, base - h, T.METAL);
    }

    // world bounds
    for (let x = 0; x < W; x++) {
      this.set(x, 0, T.ROCK);
      for (let y = H - 3; y < H; y++) this.set(x, y, T.ROCK);
    }
    for (let y = 0; y < H; y++) for (const x of [0, 1, W - 2, W - 1]) this.set(x, y, T.ROCK);
  }

  // Standing spots (foot position) spread at least minDist apart.
  pickSpots(n, minDist) {
    const cands = [];
    for (let x = 3; x < this.w - 3; x++)
      for (let y = 4; y < this.h - 3; y++)
        if (this.get(x, y) !== T.EMPTY && this.get(x, y - 1) === T.EMPTY && this.get(x, y - 2) === T.EMPTY && this.get(x, y - 3) === T.EMPTY)
          cands.push({ x: x * TILE + TILE / 2, y: y * TILE });
    for (let i = cands.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [cands[i], cands[j]] = [cands[j], cands[i]];
    }
    const out = [];
    for (const c of cands) {
      if (out.length >= n) break;
      if (out.every((o) => Math.hypot(o.x - c.x, o.y - c.y) >= minDist)) out.push(c);
    }
    return out;
  }

  // Removes dirt in a radius. Returns the changed tile box, or null.
  explode(cx, cy, radius) {
    const tx0 = Math.floor((cx - radius) / TILE), tx1 = Math.floor((cx + radius) / TILE);
    const ty0 = Math.floor((cy - radius) / TILE), ty1 = Math.floor((cy + radius) / TILE);
    let changed = false;
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const dx = (tx + 0.5) * TILE - cx, dy = (ty + 0.5) * TILE - cy;
        if (dx * dx + dy * dy <= radius * radius && this.get(tx, ty) === T.DIRT) {
          this.set(tx, ty, T.EMPTY);
          changed = true;
        }
      }
    return changed ? { tx0, ty0, tx1, ty1 } : null;
  }
}
