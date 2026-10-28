// Game simulation. World.step(dt, inputs) advances everything from per-player
// input objects and emits events for the renderer and audio. It never touches the
// DOM, so a multiplayer server can run it unchanged and broadcast state + events.

import { TILE, PHYS, PLAYER, WEAPONS, GRENADE, MATCH } from './config.js';
import { GameMap } from './map.js';

export const NULL_INPUT = Object.freeze({ move: 0, jet: false, aim: 0, fire: false, grenade: false, swap: false, reload: false, interact: false });

const SPOT_KINDS = ['shotgun', 'health', 'sniper', 'rocket', 'grenade', 'smg', 'shotgun', 'health', 'rocket', 'sniper', 'grenade', 'smg'];
const PICKUP_RESPAWN = 14;

const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function makeWeapon(key, ammo) {
  const d = WEAPONS[key];
  return { key, mag: ammo ? ammo.mag : d.mag, reserve: ammo ? ammo.reserve : d.reserve };
}

// Axis-separated AABB vs tile movement, with a one-tile step-up when walking.
export function moveBody(b, dt, map) {
  const wasGround = b.onGround;
  b.onGround = false;
  const nx = b.x + b.vx * dt;
  if (map.rectSolid(nx, b.y, b.w, b.h)) {
    const footTop = Math.round((b.y + b.h) / TILE) * TILE;
    const sy = footTop - TILE - b.h - 0.01;
    if (wasGround && b.vy >= 0 && !map.rectSolid(nx, sy, b.w, b.h)) {
      b.x = nx;
      b.y = sy;
    } else {
      b.x = b.vx > 0 ? Math.floor((nx + b.w) / TILE) * TILE - b.w - 0.01 : (Math.floor(nx / TILE) + 1) * TILE + 0.01;
      b.vx = 0;
    }
  } else b.x = nx;

  const ny = b.y + b.vy * dt;
  if (map.rectSolid(b.x, ny, b.w, b.h)) {
    if (b.vy > 0) {
      b.y = Math.floor((ny + b.h) / TILE) * TILE - b.h - 0.01;
      b.onGround = true;
    } else b.y = (Math.floor(ny / TILE) + 1) * TILE + 0.01;
    b.vy = 0;
  } else b.y = ny;
}

export class World {
  constructor({ mode = 'ffa', seed = (Math.random() * 1e9) | 0, killLimit = MATCH.killLimit, timeLimit = MATCH.timeLimit } = {}) {
    this.mode = mode;
    this.seed = seed;
    this.map = new GameMap(seed);
    this.killLimit = killLimit;
    this.time = timeLimit;
    this.players = [];
    this.bullets = [];
    this.grenades = [];
    this.pickups = [];
    this.events = [];
    this.over = false;
    this.winner = null;
    this.nextId = 1;
    this.spots = this.map.pickupSpots.map((s, i) => ({ x: s.x, y: s.y, kind: SPOT_KINDS[i % SPOT_KINDS.length], timer: 1 + i * 0.3, pickup: null }));
  }

  emit(e) { this.events.push(e); }
  byId(id) { return this.players.find((p) => p.id === id) || null; }
  enemies(a, b) { return a !== b && (this.mode !== 'team' || a.team !== b.team); }
  teamScore(t) { return this.players.reduce((s, p) => s + (p.team === t ? p.kills : 0), 0); }

  addPlayer({ name, isBot = false, team = 0, color = '#fff' }) {
    const p = {
      id: this.nextId++, name, isBot, team, color,
      w: PLAYER.w, h: PLAYER.h, x: 0, y: 0, vx: 0, vy: 0,
      hp: 0, alive: false, respawnTimer: 0, shield: 0,
      fuel: 1, aim: 0, facing: 1, onGround: false, jetting: false, walk: 0,
      inv: [], cur: 0, fireCd: 0, reloadT: 0, grenades: 0,
      kills: 0, deaths: 0, killedBy: null,
    };
    this.players.push(p);
    return p;
  }

  step(dt, inputs) {
    if (this.over) return;
    this.time = Math.max(0, this.time - dt);
    for (const p of this.players) this.updatePlayer(p, inputs.get(p.id) || NULL_INPUT, dt);
    this.updateBullets(dt);
    this.updateGrenades(dt);
    this.updatePickups(dt);
    this.checkEnd();
  }

  spawn(p) {
    const alive = this.players.filter((o) => o.alive);
    const foes = alive.filter((o) => this.enemies(o, p));
    const scored = this.map.spawns.map((s) => ({
      s,
      d: (foes.length ? Math.min(...foes.map((o) => Math.hypot(o.x - s.x, o.y - s.y))) : Math.random() * 1000) -
        (alive.some((o) => Math.hypot(o.x + o.w / 2 - s.x, o.y + o.h - s.y) < 40) ? 5000 : 0),
    }));
    scored.sort((a, b) => b.d - a.d);
    const s = scored.length ? scored[Math.floor(Math.random() * Math.min(4, scored.length))].s : { x: this.map.pw / 2, y: TILE * 4 };
    Object.assign(p, {
      x: s.x - p.w / 2, y: s.y - p.h - 0.01, vx: 0, vy: 0,
      hp: PLAYER.hp, alive: true, shield: PLAYER.spawnShield, fuel: 1,
      grenades: PLAYER.grenades, inv: [makeWeapon('pistol'), makeWeapon('smg', { mag: 30, reserve: 60 })], cur: 1,
      reloadT: 0, fireCd: 0.3, onGround: false,
    });
    this.emit({ type: 'spawn', id: p.id, x: p.x + p.w / 2, y: p.y + p.h / 2 });
  }

  updatePlayer(p, inp, dt) {
    if (!p.alive) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) this.spawn(p);
      return;
    }
    p.shield = Math.max(0, p.shield - dt);
    p.aim = inp.aim;
    p.facing = Math.cos(p.aim) >= 0 ? 1 : -1;

    const move = clamp(inp.move, -1, 1);
    p.vx = approach(p.vx, move * PHYS.runSpeed, (p.onGround ? PHYS.groundAccel : PHYS.airAccel) * dt);
    p.jetting = !!inp.jet && p.fuel > 0;
    if (p.jetting) {
      p.vy -= PHYS.jetForce * dt;
      p.fuel = Math.max(0, p.fuel - PHYS.fuelDrain * dt);
    } else p.fuel = Math.min(1, p.fuel + (p.onGround ? PHYS.fuelRegenGround : PHYS.fuelRegenAir) * dt);
    p.vy = clamp(p.vy + PHYS.gravity * dt, -PHYS.maxRise, PHYS.maxFall);
    moveBody(p, dt, this.map);
    if (p.onGround) p.walk += Math.abs(p.vx) * dt;

    this.updateWeapons(p, inp, dt);
    if (inp.grenade) this.throwGrenade(p);
    if (p.alive) this.tryPickup(p, !!inp.interact);
  }

  updateWeapons(p, inp, dt) {
    p.fireCd -= dt;
    if (inp.swap && p.inv.length > 1) {
      p.cur = 1 - p.cur;
      p.reloadT = 0;
      p.fireCd = Math.max(p.fireCd, 0.2);
      this.emit({ type: 'swap', id: p.id });
    }
    const w = p.inv[p.cur], def = WEAPONS[w.key];
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) {
        const take = Math.min(def.mag - w.mag, w.reserve);
        w.mag += take;
        w.reserve -= take;
      }
    }
    if (inp.reload) this.startReload(p);
    if (inp.fire && p.fireCd <= 0 && p.reloadT <= 0) {
      if (w.mag > 0) this.fire(p, w, def);
      else if (!this.startReload(p)) {
        p.fireCd = 0.3;
        if (p.cur === 1) {
          // primary fully spent: drop it and fall back to the sidearm
          p.inv.pop();
          p.cur = 0;
          this.emit({ type: 'swap', id: p.id });
        } else this.emit({ type: 'empty', id: p.id, x: p.x + p.w / 2, y: p.y });
      }
    }
  }

  startReload(p) {
    const w = p.inv[p.cur], def = WEAPONS[w.key];
    if (p.reloadT > 0 || w.mag >= def.mag || w.reserve <= 0) return false;
    p.reloadT = def.reload;
    this.emit({ type: 'reload', id: p.id, x: p.x + p.w / 2, y: p.y });
    return true;
  }

  fire(p, w, def) {
    w.mag--;
    p.fireCd = def.rate;
    const ca = Math.cos(p.aim), sa = Math.sin(p.aim);
    const mx = p.x + p.w / 2 + ca * (def.len + 6), my = p.y + 10 + sa * (def.len + 6);
    for (let i = 0; i < def.pellets; i++) {
      const a = p.aim + (Math.random() * 2 - 1) * def.spread;
      const sp = def.speed * (def.pellets > 1 ? 0.85 + Math.random() * 0.3 : 1);
      this.bullets.push({
        x: mx, y: my, px: mx, py: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        owner: p.id, team: p.team, key: w.key, dmg: def.dmg, life: def.range / def.speed, explosive: def.explosive || null,
      });
    }
    if (def.kick) {
      p.vx -= ca * def.kick;
      p.vy -= sa * def.kick;
    }
    this.emit({ type: 'shot', id: p.id, key: w.key, x: mx, y: my, aim: p.aim });
    if (w.mag === 0) this.startReload(p);
  }

  throwGrenade(p) {
    if (p.grenades <= 0) return;
    p.grenades--;
    const ca = Math.cos(p.aim), sa = Math.sin(p.aim);
    this.grenades.push({
      x: p.x + p.w / 2 + ca * 10, y: p.y + 10 + sa * 10,
      vx: ca * GRENADE.throwSpeed + p.vx * 0.5, vy: sa * GRENADE.throwSpeed + p.vy * 0.3 - 80,
      fuse: GRENADE.fuse, owner: p.id, rot: 0,
    });
    this.emit({ type: 'throw', id: p.id, x: p.x + p.w / 2, y: p.y + 10 });
  }

  playerAt(x, y, b) {
    for (const p of this.players) {
      if (!p.alive || p.id === b.owner) continue;
      if (this.mode === 'team' && p.team === b.team) continue;
      if (x >= p.x - 2 && x <= p.x + p.w + 2 && y >= p.y - 4 && y <= p.y + p.h) return p;
    }
    return null;
  }

  updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.px = b.x;
      b.py = b.y;
      b.life -= dt;
      const steps = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 5));
      const sx = (b.vx * dt) / steps, sy = (b.vy * dt) / steps;
      let dead = false;
      for (let s = 0; s < steps && !dead; s++) {
        b.x += sx;
        b.y += sy;
        if (this.map.solidAt(b.x, b.y)) {
          if (b.explosive) this.explode(b.x - sx, b.y - sy, b.explosive, b.owner, b.key);
          else this.emit({ type: 'impact', x: b.x - sx, y: b.y - sy, key: b.key });
          dead = true;
        } else {
          const hit = this.playerAt(b.x, b.y, b);
          if (hit) {
            if (b.explosive) this.explode(b.x, b.y, b.explosive, b.owner, b.key);
            else {
              const head = b.y < hit.y + 6;
              hit.vx += b.vx * 0.02;
              this.emit({ type: 'hit', id: hit.id, by: b.owner, x: b.x, y: b.y, head });
              this.damage(hit, b.dmg * (head ? 1.5 : 1), this.byId(b.owner), b.key, head);
            }
            dead = true;
          }
        }
      }
      if (!dead && b.life <= 0) {
        if (b.explosive) this.explode(b.x, b.y, b.explosive, b.owner, b.key);
        dead = true;
      }
      if (dead) this.bullets.splice(i, 1);
    }
  }

  updateGrenades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;
      if (g.fuse <= 0) {
        this.grenades.splice(i, 1);
        this.explode(g.x, g.y, GRENADE, g.owner, 'grenade');
        continue;
      }
      g.vy = Math.min(g.vy + PHYS.gravity * 0.9 * dt, 900);
      const nx = g.x + g.vx * dt;
      if (this.map.solidAt(nx, g.y)) {
        if (Math.abs(g.vx) > 120) this.emit({ type: 'bounce', x: g.x, y: g.y });
        g.vx *= -0.45;
        g.vy *= 0.85;
      } else g.x = nx;
      const ny = g.y + g.vy * dt;
      if (this.map.solidAt(g.x, ny)) {
        if (Math.abs(g.vy) > 120) this.emit({ type: 'bounce', x: g.x, y: g.y });
        g.vy *= -0.45;
        g.vx *= 0.8;
        if (Math.abs(g.vy) < 40) g.vy = 0;
      } else g.y = ny;
      g.rot += g.vx * dt * 0.08;
    }
  }

  explode(x, y, cfg, ownerId, key) {
    const changed = this.map.explode(x, y, cfg.radius * 0.75);
    this.emit({ type: 'explosion', x, y, r: cfg.radius, changed });
    const owner = this.byId(ownerId);
    for (const p of this.players) {
      if (!p.alive) continue;
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      const d = Math.hypot(cx - x, cy - y);
      if (d >= cfg.radius) continue;
      const f = 1 - d / cfg.radius;
      const friendly = this.mode === 'team' && owner && owner !== p && owner.team === p.team;
      if (friendly) continue;
      const nx = (cx - x) / (d || 1), ny = (cy - y) / (d || 1);
      p.vx += nx * cfg.force * f;
      p.vy += ny * cfg.force * f - 120 * f;
      this.damage(p, cfg.dmg * f * (p.id === ownerId ? 0.5 : 1), owner, key, false);
    }
  }

  damage(p, amt, attacker, key, head) {
    if (!p.alive || p.shield > 0 || amt <= 0) return;
    p.hp -= amt;
    this.emit({ type: 'damage', id: p.id, by: attacker ? attacker.id : null, amt });
    if (p.hp <= 0) this.kill(p, attacker, key, head);
  }

  kill(p, attacker, key, head) {
    p.alive = false;
    p.hp = 0;
    p.jetting = false;
    p.respawnTimer = PLAYER.respawn;
    p.deaths++;
    p.killedBy = attacker && attacker !== p ? attacker.id : null;
    if (attacker && attacker !== p) attacker.kills++;
    else p.kills = Math.max(0, p.kills - 1);
    const prim = p.inv[1];
    if (prim && prim.mag + prim.reserve > 0) {
      const k = this.addPickup(prim.key, p.x + p.w / 2, p.y + p.h, { mag: prim.mag, reserve: prim.reserve }, null, 15);
      k.vx = p.vx * 0.5;
      k.vy = -200;
    }
    this.emit({ type: 'kill', victim: p.id, killer: attacker ? attacker.id : null, key, head, x: p.x + p.w / 2, y: p.y + p.h / 2 });
  }

  addPickup(kind, x, y, ammo = null, spot = null, ttl) {
    const k = { kind, x, y, vx: 0, vy: 0, ammo, spot, ttl };
    this.pickups.push(k);
    return k;
  }

  updatePickups(dt) {
    for (const s of this.spots) {
      if (s.pickup) continue;
      s.timer -= dt;
      if (s.timer <= 0) s.pickup = this.addPickup(s.kind, s.x, s.y, null, s);
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      k.vy = Math.min(k.vy + PHYS.gravity * dt, 600);
      const nx = k.x + k.vx * dt;
      if (!this.map.solidAt(nx, k.y - 4)) k.x = nx;
      else k.vx = 0;
      const ny = k.y + k.vy * dt;
      if (this.map.solidAt(k.x, ny)) {
        k.vy = 0;
        k.vx *= 0.8;
        k.y = Math.floor(ny / TILE) * TILE;
      } else k.y = ny;
      if (k.ttl !== undefined) {
        k.ttl -= dt;
        if (k.ttl <= 0) this.pickups.splice(i, 1);
      }
    }
  }

  touching(p, k) {
    return Math.abs(k.x - (p.x + p.w / 2)) <= 16 && k.y >= p.y && k.y - 14 <= p.y + p.h + 2;
  }

  // A weapon pickup the player is standing on that needs an explicit swap.
  nearbySwap(p) {
    const prim = p.inv[1];
    if (!p.alive || !prim) return null;
    return this.pickups.find((k) => WEAPONS[k.kind] && k.kind !== prim.key && this.touching(p, k)) || null;
  }

  tryPickup(p, explicit) {
    for (let i = 0; i < this.pickups.length; i++) {
      const k = this.pickups[i];
      if (!this.touching(p, k)) continue;
      let took = false;
      if (k.kind === 'health') {
        if (p.hp < PLAYER.hp) { p.hp = Math.min(PLAYER.hp, p.hp + 50); took = true; }
      } else if (k.kind === 'grenade') {
        if (p.grenades < PLAYER.maxGrenades) { p.grenades = Math.min(PLAYER.maxGrenades, p.grenades + 2); took = true; }
      } else {
        const def = WEAPONS[k.kind], prim = p.inv[1];
        if (prim && prim.key === k.kind) {
          if (prim.reserve < def.reserve) { prim.reserve = Math.min(def.reserve, prim.reserve + def.mag * 2); took = true; }
        } else if (!prim || explicit) {
          if (prim) {
            const d = this.addPickup(prim.key, p.x + p.w / 2, p.y + p.h, { mag: prim.mag, reserve: prim.reserve }, null, 15);
            d.vy = -150;
          }
          p.inv[1] = makeWeapon(k.kind, k.ammo);
          p.cur = 1;
          p.reloadT = 0;
          took = true;
        }
      }
      if (took) {
        this.pickups.splice(i, 1);
        if (k.spot) { k.spot.pickup = null; k.spot.timer = PICKUP_RESPAWN; }
        this.emit({ type: 'pickup', id: p.id, kind: k.kind, x: k.x, y: k.y });
        return;
      }
    }
  }

  checkEnd() {
    let done = this.time <= 0;
    if (this.mode === 'team') {
      const a = this.teamScore(0), b = this.teamScore(1);
      if (a >= this.killLimit || b >= this.killLimit) done = true;
      if (done) this.winner = a === b ? { draw: true } : { team: a > b ? 0 : 1 };
    } else {
      const top = [...this.players].sort((a, b) => b.kills - a.kills);
      if (top.length && top[0].kills >= this.killLimit) done = true;
      if (done) this.winner = top.length > 1 && top[1].kills === top[0].kills ? { draw: true } : { player: top[0]?.id };
    }
    if (done) {
      this.over = true;
      this.emit({ type: 'over', winner: this.winner });
    }
  }
}
