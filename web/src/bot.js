// Bot AI. A brain only reads world state and returns the same input object a
// human produces, so bots and remote players go through identical code paths.

import { WEAPONS, TILE, T } from './config.js';

const SKILL = {
  easy:   { react: 0.6,  turn: 4,  jitter: 0.14, lead: 0.3 },
  normal: { react: 0.35, turn: 7,  jitter: 0.07, lead: 0.7 },
  hard:   { react: 0.18, turn: 12, jitter: 0.03, lead: 1 },
};
const RANK = { smg: 1, shotgun: 2, sniper: 2.5, rocket: 3 };

const angDiff = (a, b) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export class BotBrain {
  constructor(world, player, difficulty = 'normal') {
    this.world = world;
    this.p = player;
    this.skill = SKILL[difficulty] || SKILL.normal;
    this.target = null;
    this.los = false;
    this.seen = 0;
    this.retarget = 0;
    this.wander = null;
    this.aim = 0;
    this.noise = 0;
    this.noiseT = 0;
    this.strafe = 1;
    this.strafeT = 0;
    this.side = Math.random() < 0.5 ? -1 : 1;
    this.stuckT = 0;
    this.lastX = 0;
    this.unstick = 0;
    this.hop = 0;
    this.refuel = false;
    this.nadeCd = 2 + Math.random() * 3;
    this.path = null;
    this.goal = { x: 0, y: 0 };
    this.repath = 0;
  }

  think(dt) {
    const p = this.p, w = this.world, map = w.map;
    const inp = { move: 0, jet: false, aim: this.aim, fire: false, grenade: false, swap: false, reload: false, interact: false };
    if (!p.alive) {
      this.target = null;
      return inp;
    }
    const cx = p.x + p.w / 2, cy = p.y + 10, foot = p.y + p.h;

    this.retarget -= dt;
    if (this.retarget <= 0) {
      this.retarget = 0.3;
      this.pickTarget(cx, cy);
    }
    const t = this.target && this.target.alive ? this.target : null;
    if (!t) this.los = false;
    this.seen = t && this.los ? this.seen + dt : 0;

    // where to go
    const health = p.hp < 45 ? this.nearestPickup((k) => k === 'health') : null;
    const gun = !p.inv[1] ? this.nearestPickup((k) => !!WEAPONS[k]) : null;
    let dest, chasing = false;
    if (health) dest = health;
    else if (gun && !(t && this.los)) dest = gun;
    else if (t) {
      dest = { x: t.x + t.w / 2, y: t.y + t.h };
      chasing = true;
    } else {
      if (!this.wander || Math.hypot(this.wander.x - cx, this.wander.y - foot) < 40) this.wander = this.randomSpot();
      dest = this.wander;
    }
    const dx = dest.x - cx, dy = dest.y - foot;
    const def = WEAPONS[p.inv[p.cur].key];

    // movement
    if (chasing && this.los) {
      const d = Math.hypot(dx, dy);
      const pref = Math.min(380, Math.max(110, def.range * 0.45));
      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        this.strafe = Math.random() < 0.5 ? -1 : 1;
        this.strafeT = 0.6 + Math.random() * 1.2;
      }
      if (d > pref * 1.3) inp.move = Math.sign(dx);
      else if (d < pref * 0.6) inp.move = -Math.sign(dx);
      else inp.move = this.strafe * 0.7;
    }

    let jet = false;
    if (chasing && this.los) {
      jet = dy < -20;
    } else {
      // follow a grid path; jetpacks make every open cell reachable
      this.repath -= dt;
      if (this.repath <= 0 || !this.path || Math.hypot(dest.x - this.goal.x, dest.y - this.goal.y) > 48) {
        this.path = this.findPath(cx, p.y + p.h - 1, dest.x, dest.y - 1);
        this.goal = { x: dest.x, y: dest.y };
        this.repath = 0.5;
      }
      const wp = this.path && this.waypoint(cx, p.y + p.h / 2);
      if (wp) {
        const wx = wp.x - cx, wy = wp.y - (p.y + p.h / 2);
        inp.move = Math.abs(wx) > 3 ? Math.sign(wx) : 0;
        jet = wy < -4 || (wy < 10 && p.vy > 120 && !p.onGround);
      } else {
        inp.move = Math.abs(dx) > 12 ? Math.sign(dx) : 0;
        jet = dy < -20;
        if (dy < -40 && Math.abs(dx) < 40 && map.solidAt(cx, p.y - 4)) inp.move = this.side; // ceiling above: go around
      }
    }
    const dir = Math.sign(inp.move) || p.facing;
    const blocked = inp.move !== 0 && this.blocked(dir);
    if (blocked) jet = true;
    if (dy > 40 && !blocked && !this.path) jet = false;

    this.stuckT += dt;
    if (this.stuckT > 1.2) {
      if (inp.move && Math.abs(p.x - this.lastX) < 12) {
        this.unstick = 0.7;
        this.side = -this.side;
        this.wander = this.randomSpot();
        this.path = null;
      }
      this.lastX = p.x;
      this.stuckT = 0;
    }
    if (this.unstick > 0) {
      this.unstick -= dt;
      jet = true;
    }
    if (chasing && this.los && Math.random() < dt * 0.6) this.hop = 0.4;
    if (this.hop > 0) {
      this.hop -= dt;
      jet = true;
    }
    if (p.fuel < 0.05) this.refuel = true;
    if (this.refuel && p.fuel > 0.45) this.refuel = false;
    if (this.refuel && p.vy < 500) jet = false;
    inp.jet = jet;

    // aim
    this.noiseT -= dt;
    if (this.noiseT <= 0) {
      this.noiseT = 0.25;
      this.noise = (Math.random() * 2 - 1) * this.skill.jitter;
    }
    let desired = this.aim, dist = Infinity, tx = 0, ty = 0;
    if (t) {
      tx = t.x + t.w / 2;
      ty = t.y + t.h * 0.4;
      dist = Math.hypot(tx - cx, ty - cy);
      const lead = (dist / def.speed) * this.skill.lead;
      desired = Math.atan2(ty + t.vy * lead * 0.5 - cy, tx + t.vx * lead - cx) + this.noise;
    } else if (inp.move) desired = inp.move > 0 ? 0 : Math.PI;
    const turn = this.skill.turn * dt;
    this.aim += Math.max(-turn, Math.min(turn, angDiff(this.aim, desired)));
    inp.aim = this.aim;

    // shooting
    const tooClose = def.explosive && dist < 90;
    if (t && this.los && this.seen > this.skill.react && dist < def.range && !tooClose && Math.abs(angDiff(this.aim, desired)) < 0.2) inp.fire = true;

    // weapon management
    const prim = p.inv[1];
    if (prim && p.cur === 0 && prim.mag + prim.reserve > 0 && p.reloadT <= 0) inp.swap = true;
    if (prim && p.cur === 1 && tooClose) inp.swap = true;
    if (!t && p.reloadT <= 0) {
      const cw = p.inv[p.cur];
      if (cw.mag < WEAPONS[cw.key].mag * 0.5 && cw.reserve > 0) inp.reload = true;
    }
    const swapFor = w.nearbySwap(p);
    if (swapFor && prim && RANK[swapFor.kind] > RANK[prim.key]) inp.interact = true;

    // grenades
    this.nadeCd -= dt;
    if (t && p.grenades > 0 && this.nadeCd <= 0) {
      if (dist < 300 && (!this.los || Math.random() < 0.3)) {
        inp.grenade = true;
        inp.aim = Math.atan2(ty - cy - dist * 0.6, tx - cx);
        this.nadeCd = 4 + Math.random() * 4;
      } else this.nadeCd = 0.5;
    }
    return inp;
  }

  pickTarget(cx, cy) {
    let best = null, bestScore = Infinity, bestLos = false;
    for (const o of this.world.players) {
      if (!o.alive || !this.world.enemies(this.p, o)) continue;
      const ox = o.x + o.w / 2, oy = o.y + o.h / 2;
      const d = Math.hypot(ox - cx, oy - cy);
      const los = d < 1100 && this.world.map.raycast(cx, cy, ox, oy);
      const s = d + (los ? 0 : 500) - (o === this.target ? 120 : 0);
      if (s < bestScore) {
        bestScore = s;
        best = o;
        bestLos = los;
      }
    }
    this.target = best;
    this.los = bestLos;
  }

  // BFS over cells where a body fits (cell and the one above it empty).
  findPath(fx, fy, gx, gy) {
    const map = this.world.map, W = map.w, H = map.h;
    const fits = (x, y) => map.get(x, y) === T.EMPTY && map.get(x, y - 1) === T.EMPTY;
    const near = (x, y) => {
      for (let r = 0; r <= 3; r++)
        for (let oy = -r; oy <= r; oy++)
          for (let ox = -r; ox <= r; ox++) if (fits(x + ox, y + oy)) return (y + oy) * W + x + ox;
      return -1;
    };
    const start = near(Math.floor(fx / TILE), Math.floor(fy / TILE));
    const goal = near(Math.floor(gx / TILE), Math.floor(gy / TILE));
    if (start < 0 || goal < 0) return null;
    const prev = new Int32Array(W * H).fill(-1);
    const queue = new Int32Array(W * H);
    let head = 0, tail = 0;
    queue[tail++] = start;
    prev[start] = start;
    while (head < tail) {
      const c = queue[head++];
      if (c === goal) break;
      const x = c % W, y = (c / W) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y - 1], [x, y + 1]]) {
        const n = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || prev[n] >= 0 || !fits(nx, ny)) continue;
        prev[n] = c;
        queue[tail++] = n;
      }
    }
    if (prev[goal] < 0) return null;
    const path = [];
    for (let c = goal; c !== start; c = prev[c]) path.push({ x: (c % W) * TILE + TILE / 2, y: ((c / W) | 0) * TILE });
    return path.reverse();
  }

  // Furthest upcoming path node in direct sight, after dropping nodes already reached.
  waypoint(bx, by) {
    const path = this.path, map = this.world.map;
    let nearest = 0, nd = Infinity;
    for (let i = 0; i < Math.min(path.length, 12); i++) {
      const d = Math.hypot(path[i].x - bx, path[i].y - by);
      if (d < nd) { nd = d; nearest = i; }
    }
    path.splice(0, nd < 12 ? nearest + 1 : nearest);
    if (!path.length) return null;
    for (let i = Math.min(path.length - 1, 6); i > 0; i--) if (map.raycast(bx, by, path[i].x, path[i].y)) return path[i];
    return path[0];
  }

  blocked(dir) {
    const p = this.p, map = this.world.map;
    const fx = dir > 0 ? p.x + p.w + 3 : p.x - 3;
    return map.solidAt(fx, p.y + p.h - TILE - 4) || map.solidAt(fx, p.y + 4);
  }

  nearestPickup(filter) {
    const p = this.p;
    let best = null, bd = 700;
    for (const k of this.world.pickups) {
      if (!filter(k.kind)) continue;
      const d = Math.hypot(k.x - (p.x + p.w / 2), k.y - (p.y + p.h));
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  }

  randomSpot() {
    const s = this.world.map.spawns;
    return s[Math.floor(Math.random() * s.length)];
  }
}
