// Canvas renderer. All art is drawn procedurally; nothing here mutates the world.

import { TILE, T, WEAPONS, TEAM_COLORS, TEAM_NAMES, PLAYER } from './config.js';

const hash = (x, y) => ((Math.imul(x, 374761393) + Math.imul(y, 668265263)) ^ 0x5bd1e995) >>> 0;
const DIRT = ['#7b3f2c', '#743a29', '#82452f'];
const KILL_ICON = { pistol: 'Sidearm', smg: 'Stinger', shotgun: 'Breacher', sniper: 'Longshot', rocket: 'Thumper', grenade: 'Grenade' };

export class Camera {
  constructor() {
    this.x = 0; this.y = 0; this.zoom = 1;
    this.sw = 800; this.sh = 600; this.vw = 800; this.vh = 600;
  }
  setScreen(sw, sh) {
    this.sw = sw; this.sh = sh;
    this.zoom = Math.max(sh / 560, sw / 1400);
    this.vw = sw / this.zoom; this.vh = sh / this.zoom;
  }
  screenToWorld(sx, sy) { return { x: sx / this.zoom + this.x, y: sy / this.zoom + this.y }; }
  follow(p, input, map, dt, snap = false) {
    if (!p) return;
    let tx = p.x + p.w / 2, ty = p.y + p.h / 2;
    if (p.alive && input) {
      if (input.touchMode) { tx += Math.cos(p.aim) * 90; ty += Math.sin(p.aim) * 60; }
      else if (input.mouse.active) {
        tx += ((input.mouse.x - this.sw / 2) / this.zoom) * 0.3;
        ty += ((input.mouse.y - this.sh / 2) / this.zoom) * 0.3;
      }
    }
    const gx = tx - this.vw / 2, gy = ty - this.vh / 2;
    const k = snap ? 1 : 1 - Math.exp(-dt * 8);
    this.x += (gx - this.x) * k;
    this.y += (gy - this.y) * k;
    this.x = map.pw > this.vw ? Math.max(0, Math.min(map.pw - this.vw, this.x)) : (map.pw - this.vw) / 2;
    this.y = map.ph > this.vh ? Math.max(0, Math.min(map.ph - this.vh, this.y)) : (map.ph - this.vh) / 2;
  }
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.time = 0;
    this.particles = [];
    this.feed = [];
    this.shake = 0;
    this.hitMarker = 0;
    this.dmgFlash = 0;
    this.stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random() * 0.5, s: Math.random() * 1.4 + 0.3, t: Math.random() * 6 }));
  }

  setWorld(world) {
    this.world = world;
    const m = world.map;
    this.terrain = document.createElement('canvas');
    this.terrain.width = m.pw;
    this.terrain.height = m.ph;
    this.tctx = this.terrain.getContext('2d');
    this.mini = document.createElement('canvas');
    this.mini.width = m.w;
    this.mini.height = m.h;
    this.mctx = this.mini.getContext('2d');
    this.particles = [];
    this.feed = [];
    this.drawTiles(0, 0, m.w - 1, m.h - 1);
  }

  drawTiles(tx0, ty0, tx1, ty1) {
    const m = this.world.map, c = this.tctx, mc = this.mctx;
    tx0 = Math.max(0, tx0 - 1); ty0 = Math.max(0, ty0 - 1);
    tx1 = Math.min(m.w - 1, tx1 + 1); ty1 = Math.min(m.h - 1, ty1 + 1);
    c.clearRect(tx0 * TILE, ty0 * TILE - 2, (tx1 - tx0 + 1) * TILE, (ty1 - ty0 + 1) * TILE + 2);
    mc.clearRect(tx0, ty0, tx1 - tx0 + 1, ty1 - ty0 + 1);
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = m.get(tx, ty);
        if (t === T.EMPTY) continue;
        const x = tx * TILE, y = ty * TILE, h = hash(tx, ty);
        const above = m.get(tx, ty - 1) === T.EMPTY, below = m.get(tx, ty + 1) === T.EMPTY;
        const left = m.get(tx - 1, ty) === T.EMPTY, right = m.get(tx + 1, ty) === T.EMPTY;
        if (t === T.DIRT) {
          c.fillStyle = DIRT[h % 3];
          c.fillRect(x, y, TILE, TILE);
          if (h % 4 === 0) { c.fillStyle = '#5e2d20'; c.fillRect(x + ((h >> 3) % 12), y + ((h >> 7) % 12), 3, 2); }
          if (h % 7 === 0) { c.fillStyle = '#99583c'; c.fillRect(x + ((h >> 5) % 13), y + ((h >> 9) % 13), 2, 2); }
          if (left) { c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x, y, 2, TILE); }
          if (right) { c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x + TILE - 2, y, 2, TILE); }
          if (below) { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x, y + TILE - 3, TILE, 3); }
          if (above) {
            c.fillStyle = '#3fbf8f'; c.fillRect(x, y, TILE, 4);
            c.fillStyle = '#2b8f6b'; c.fillRect(x, y + 4, TILE, 2);
            c.fillStyle = '#5fe0ad'; c.fillRect(x + (h % 13), y - 2, 2, 2); c.fillRect(x + ((h >> 4) % 13), y - 1, 1, 1);
          }
          mc.fillStyle = above ? '#3fbf8f' : '#8a4b35';
        } else if (t === T.ROCK) {
          c.fillStyle = '#3d3f52'; c.fillRect(x, y, TILE, TILE);
          c.fillStyle = '#34364a'; c.fillRect(x + ((h >> 2) % 10), y + ((h >> 6) % 10), 5, 4);
          if (above) { c.fillStyle = '#5a5d75'; c.fillRect(x, y, TILE, 2); }
          if (h % 5 === 0) { c.fillStyle = '#2a2c3b'; c.fillRect(x + 4, y + 7, 7, 1); }
          mc.fillStyle = '#4a4c62';
        } else {
          c.fillStyle = '#9aa6b8'; c.fillRect(x, y, TILE, TILE);
          c.fillStyle = '#6c7689'; c.fillRect(x, y + TILE - 4, TILE, 4);
          c.fillStyle = '#c9d3e0'; c.fillRect(x, y, TILE, 2);
          c.fillStyle = '#4c5466'; c.fillRect(x + 3, y + 6, 2, 2); c.fillRect(x + 11, y + 6, 2, 2);
          mc.fillStyle = '#b8c2d0';
        }
        mc.fillRect(tx, ty, 1, 1);
      }
  }

  // ---- events → effects -------------------------------------------------

  consume(events, localId) {
    const w = this.world;
    for (const e of events) {
      switch (e.type) {
        case 'shot': {
          const def = WEAPONS[e.key];
          this.add({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.05, size: def.pellets > 1 ? 14 : 9, color: '#fff3c4', glow: true });
          if (!def.explosive) this.add({ x: e.x - Math.cos(e.aim) * def.len, y: e.y - Math.sin(e.aim) * def.len, vx: -Math.cos(e.aim) * 40 + (Math.random() - 0.5) * 60, vy: -120 - Math.random() * 60, g: 900, life: 0.8, size: 2, color: '#e0b04a', collide: true });
          if (e.id === localId) this.shake = Math.max(this.shake, def.pellets > 1 || def.explosive ? 5 : 1.5);
          break;
        }
        case 'impact':
          this.burst(e.x, e.y, 4, ['#ffd27a', '#fff'], 160, 0.25, true);
          this.burst(e.x, e.y, 2, ['#9a6a50'], 60, 0.5, false, 500);
          break;
        case 'hit':
          this.burst(e.x, e.y, e.head ? 10 : 6, ['#ffcf4a', '#ff8a3c', '#fff'], 200, 0.3, true);
          if (e.by === localId) this.hitMarker = e.head ? 0.25 : 0.15;
          break;
        case 'damage':
          if (e.id === localId) this.dmgFlash = Math.min(0.6, this.dmgFlash + e.amt / 120);
          break;
        case 'explosion': {
          this.add({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.12, size: e.r * 1.6, color: '#fff1c2', glow: true });
          this.burst(e.x, e.y, 26, ['#ffcf4a', '#ff8a3c', '#ff5a2c'], 380, 0.5, true, 300);
          for (let i = 0; i < 14; i++)
            this.add({ x: e.x + (Math.random() - 0.5) * e.r * 0.6, y: e.y + (Math.random() - 0.5) * e.r * 0.6, vx: (Math.random() - 0.5) * 80, vy: -30 - Math.random() * 60, life: 1 + Math.random(), size: 10 + Math.random() * 14, grow: 22, color: '#3c3346', alpha: 0.6 });
          if (e.changed) {
            this.burst(e.x, e.y, 16, DIRT, 300, 1.2, false, 900, true);
            this.drawTiles(e.changed.tx0, e.changed.ty0, e.changed.tx1, e.changed.ty1);
          }
          const lp = w.byId(localId);
          if (lp) this.shake = Math.max(this.shake, 14 * Math.max(0, 1 - Math.hypot(lp.x - e.x, lp.y - e.y) / 600));
          break;
        }
        case 'kill': {
          const v = w.byId(e.victim), k = w.byId(e.killer);
          this.feed.unshift({ killer: k, victim: v, key: e.key, head: e.head, t: 5, local: e.killer === localId || e.victim === localId });
          this.feed.length = Math.min(this.feed.length, 5);
          this.burst(e.x, e.y, 14, ['#5a6070', '#8a92a6', v.color], 320, 1.4, false, 900, true);
          this.burst(e.x, e.y, 10, ['#ffcf4a', '#fff'], 260, 0.35, true);
          break;
        }
        case 'spawn':
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            this.add({ x: e.x, y: e.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life: 0.4, size: 3, color: '#8ff7ff', glow: true });
          }
          break;
        case 'pickup':
          this.burst(e.x, e.y - 8, 8, ['#a8ffcf', '#fff'], 120, 0.4, true);
          break;
      }
    }
  }

  add(p) {
    p.max = p.life;
    if (this.particles.length < 900) this.particles.push(p);
  }

  burst(x, y, n, colors, speed, life, glow, g = 0, collide = false) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (g ? speed * 0.4 : 0), g, life: life * (0.5 + Math.random() * 0.5), size: glow ? 2 + Math.random() * 2 : 3 + Math.random() * 3, color: colors[i % colors.length], glow, collide });
    }
  }

  updateParticles(dt) {
    const map = this.world.map;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy += (p.g || 0) * dt;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      if (p.collide && map.solidAt(nx, ny)) { p.vy *= -0.3; p.vx *= 0.5; }
      else { p.x = nx; p.y = ny; }
      if (p.grow) p.size += p.grow * dt;
      if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; }
    }
  }

  // ---- frame --------------------------------------------------------------

  draw(cam, local, input, showScores, dt) {
    const c = this.ctx, w = this.world, m = w.map, dpr = this.dpr;
    const W = cam.sw, H = cam.sh;
    this.time += dt;
    this.hitMarker = Math.max(0, this.hitMarker - dt);
    this.dmgFlash = Math.max(0, this.dmgFlash - dt * 0.8);
    for (const f of this.feed) f.t -= dt;
    this.feed = this.feed.filter((f) => f.t > 0);

    for (const p of w.players)
      if (p.alive && p.jetting && Math.random() < 0.9) {
        const nx = p.x + p.w / 2 - p.facing * 7, ny = p.y + 20;
        this.add({ x: nx, y: ny, vx: (Math.random() - 0.5) * 40 + p.vx * 0.3, vy: 160 + Math.random() * 80, life: 0.18 + Math.random() * 0.1, size: 4 + Math.random() * 2, color: Math.random() < 0.5 ? '#ffb347' : '#7fe9ff', glow: true });
      }
    for (const b of w.bullets)
      if (b.explosive) this.add({ x: b.x, y: b.y, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, life: 0.5, size: 5, grow: 14, color: '#5d5566', alpha: 0.5 });
    this.updateParticles(dt);

    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawBackground(c, cam, W, H);

    let sx = 0, sy = 0;
    if (this.shake > 0) {
      sx = (Math.random() - 0.5) * this.shake;
      sy = (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 40);
    }
    const z = cam.zoom * dpr;
    c.setTransform(z, 0, 0, z, -(cam.x + sx) * z, -(cam.y + sy) * z);

    const vx0 = Math.max(0, Math.floor(cam.x - 4)), vy0 = Math.max(0, Math.floor(cam.y - 4));
    const vw = Math.min(m.pw - vx0, Math.ceil(cam.vw) + 8), vh = Math.min(m.ph - vy0, Math.ceil(cam.vh) + 8);
    c.imageSmoothingEnabled = false;
    if (vw > 0 && vh > 0) c.drawImage(this.terrain, vx0, vy0, vw, vh, vx0, vy0, vw, vh);
    c.imageSmoothingEnabled = true;

    for (const k of w.pickups) this.drawPickup(c, k);
    for (const g of w.grenades) this.drawGrenade(c, g);
    for (const p of w.players) if (p.alive) this.drawPlayer(c, p, local && p.id === local.id, local);
    this.drawBullets(c);
    this.drawParticles(c);

    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (local) this.drawHUD(c, cam, W, H, local, input, showScores);
  }

  drawBackground(c, cam, W, H) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#151433'); g.addColorStop(0.45, '#3b2559'); g.addColorStop(0.75, '#8a3f6b'); g.addColorStop(1, '#f0875a');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    for (const s of this.stars) {
      c.globalAlpha = 0.35 + 0.35 * Math.sin(this.time * 1.5 + s.t);
      c.fillStyle = '#fff';
      c.fillRect(((s.x * W - cam.x * 0.02) % W + W) % W, s.y * H, s.s, s.s);
    }
    c.globalAlpha = 1;
    const sunX = W * 0.72 - cam.x * 0.03, sunY = H * 0.32 - cam.y * 0.03, sr = H * 0.09;
    const sg = c.createRadialGradient(sunX, sunY, sr * 0.5, sunX, sunY, sr * 3);
    sg.addColorStop(0, 'rgba(255,200,140,0.5)'); sg.addColorStop(1, 'rgba(255,200,140,0)');
    c.fillStyle = sg; c.fillRect(sunX - sr * 3, sunY - sr * 3, sr * 6, sr * 6);
    c.fillStyle = '#ffd9a0'; c.beginPath(); c.arc(sunX, sunY, sr, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e8b3d8'; c.beginPath(); c.arc(W * 0.25 - cam.x * 0.015, H * 0.18, H * 0.03, 0, Math.PI * 2); c.fill();

    const layers = [
      { f: 0.08, base: 0.6, amp: 0.13, color: '#4a2e66', seed: 1 },
      { f: 0.18, base: 0.72, amp: 0.1, color: '#33224f', seed: 4 },
      { f: 0.32, base: 0.86, amp: 0.08, color: '#21183a', seed: 9 },
    ];
    for (const L of layers) {
      const off = cam.x * L.f * cam.zoom, base = H * L.base + (300 - cam.y) * L.f * cam.zoom;
      c.fillStyle = L.color;
      c.beginPath();
      c.moveTo(0, H);
      for (let x = 0; x <= W + 8; x += 8) {
        const wx = (x + off) / cam.zoom;
        const h = Math.sin(wx * 0.004 + L.seed) * 1 + Math.sin(wx * 0.011 + L.seed * 2) * 0.45 + Math.abs(Math.sin(wx * 0.027 + L.seed * 3)) * 0.25;
        c.lineTo(x, base - h * H * L.amp);
      }
      c.lineTo(W, H);
      c.fill();
    }
  }

  drawGun(c, key) {
    c.fillStyle = '#2b2f3a';
    switch (key) {
      case 'pistol': c.fillRect(2, -2, 10, 4); c.fillRect(3, 0, 3, 5); break;
      case 'smg': c.fillRect(2, -2.5, 16, 5); c.fillRect(6, 1, 3, 6); c.fillStyle = '#4a5060'; c.fillRect(11, 2, 3, 5); break;
      case 'shotgun': c.fillRect(2, -2, 20, 4); c.fillStyle = '#7a5130'; c.fillRect(0, -2, 8, 5); c.fillStyle = '#4a5060'; c.fillRect(10, 1.5, 8, 2); break;
      case 'sniper': c.fillRect(0, -1.5, 28, 3); c.fillStyle = '#1a1d24'; c.fillRect(8, -5, 9, 3); c.fillStyle = '#9fe7ff'; c.fillRect(16, -4.5, 1, 2); break;
      case 'rocket': c.fillStyle = '#4d5a3a'; c.fillRect(-4, -4, 26, 8); c.fillStyle = '#3a4430'; c.fillRect(4, 3, 3, 5); c.fillStyle = '#ff8a5c'; c.fillRect(22, -3, 3, 6); break;
    }
  }

  drawPlayer(c, p, isLocal, local) {
    const cx = p.x + p.w / 2, f = p.facing;
    c.save();
    c.translate(cx, p.y);
    if (p.shield > 0 && Math.floor(this.time * 12) % 2) c.globalAlpha = 0.45;
    const dark = '#23262f';
    // jetpack
    c.fillStyle = '#5b6273';
    c.fillRect(-f * 10 - 3, 8, 6, 12);
    c.fillStyle = '#3a404d';
    c.fillRect(-f * 10 - 2, 20, 4, 3);
    // legs
    c.strokeStyle = dark;
    c.lineWidth = 4;
    c.lineCap = 'round';
    const ph = p.walk * 0.09;
    for (let i = 0; i < 2; i++) {
      const a = p.onGround ? Math.sin(ph + i * Math.PI) * 0.6 : (i ? 0.5 : -0.25) * f;
      c.beginPath(); c.moveTo(0, 18); c.lineTo(Math.sin(a) * 8, 18 + Math.cos(a) * 8); c.stroke();
    }
    // torso
    c.fillStyle = p.color;
    c.beginPath(); c.roundRect(-6, 7, 12, 12, 3); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(-6, 15, 12, 4);
    // head
    c.fillStyle = p.color;
    c.beginPath(); c.roundRect(-6, -4, 12, 10, 4); c.fill();
    c.fillStyle = '#0d1b2a';
    c.beginPath(); c.roundRect(f > 0 ? -1 : -6, -1, 7, 4, 2); c.fill();
    c.fillStyle = '#7ff7ff'; c.fillRect(f > 0 ? 1 : -4, 0, 3, 1);
    c.fillStyle = dark; c.fillRect(-1, -7, 2, 3);
    c.fillStyle = '#ff5a5a'; c.fillRect(-1, -8, 2, 2);
    // arm + gun
    c.translate(0, 10);
    c.rotate(p.aim);
    if (Math.cos(p.aim) < 0) c.scale(1, -1);
    this.drawGun(c, p.inv[p.cur].key);
    c.strokeStyle = p.color; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(5, 1); c.stroke();
    c.restore();

    if (!isLocal) {
      c.font = '600 8px system-ui, sans-serif';
      c.textAlign = 'center';
      const friend = local && local.id !== p.id && !this.world.enemies(local, p);
      c.fillStyle = friend ? '#a8e6ff' : '#fff';
      c.fillText(p.name, cx, p.y - 14);
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(cx - 12, p.y - 12, 24, 3);
      c.fillStyle = p.hp > 50 ? '#6be585' : p.hp > 25 ? '#ffd23f' : '#ff5a5a';
      c.fillRect(cx - 12, p.y - 12, (24 * p.hp) / PLAYER.hp, 3);
    }
  }

  drawBullets(c) {
    for (const b of this.world.bullets) {
      const def = WEAPONS[b.key];
      if (b.explosive) {
        c.save(); c.translate(b.x, b.y); c.rotate(Math.atan2(b.vy, b.vx));
        c.fillStyle = '#c8ccd6'; c.fillRect(-8, -2.5, 12, 5);
        c.fillStyle = '#ff8a5c'; c.fillRect(4, -2.5, 3, 5);
        c.fillStyle = '#ffd27a'; c.beginPath(); c.arc(-9, 0, 3 + Math.random() * 2, 0, Math.PI * 2); c.fill();
        c.restore();
        continue;
      }
      const tl = b.key === 'sniper' ? 0.03 : 0.014;
      c.strokeStyle = def.color;
      c.lineWidth = b.key === 'sniper' ? 2.2 : 1.6;
      c.beginPath(); c.moveTo(b.x - b.vx * tl, b.y - b.vy * tl); c.lineTo(b.x, b.y); c.stroke();
    }
  }

  drawGrenade(c, g) {
    c.save(); c.translate(g.x, g.y); c.rotate(g.rot);
    c.fillStyle = '#3e5c3a'; c.beginPath(); c.arc(0, 0, 4, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2b2f3a'; c.fillRect(-1.5, -6, 3, 3);
    c.restore();
    if (Math.sin(this.time * (8 + (1.8 - g.fuse) * 20)) > 0) {
      c.fillStyle = '#ff3b3b'; c.beginPath(); c.arc(g.x, g.y - 1, 1.6, 0, Math.PI * 2); c.fill();
    }
  }

  drawPickup(c, k) {
    const bob = Math.sin(this.time * 3 + k.x) * 1.5;
    c.save();
    c.translate(k.x, k.y - 8 + bob);
    c.fillStyle = 'rgba(160,255,210,0.16)'; c.beginPath(); c.arc(0, 0, 13, 0, Math.PI * 2); c.fill();
    if (k.kind === 'health') {
      c.fillStyle = '#f4f1de'; c.beginPath(); c.roundRect(-7, -6, 14, 12, 2); c.fill();
      c.fillStyle = '#e63946'; c.fillRect(-1.5, -4, 3, 8); c.fillRect(-4, -1.5, 8, 3);
    } else if (k.kind === 'grenade') {
      c.fillStyle = '#2f3a2b'; c.beginPath(); c.roundRect(-8, -6, 16, 12, 2); c.fill();
      c.fillStyle = '#6e9a5c'; c.beginPath(); c.arc(-2, 0, 3, 0, Math.PI * 2); c.arc(4, 0, 3, 0, Math.PI * 2); c.fill();
    } else {
      const def = WEAPONS[k.kind];
      c.fillStyle = '#1b1e27'; c.strokeStyle = def.color; c.lineWidth = 1;
      c.beginPath(); c.roundRect(-15, -6, 30, 12, 3); c.fill(); c.stroke();
      c.translate(-12, 0); c.scale(0.8, 0.8);
      this.drawGun(c, k.kind);
    }
    c.restore();
  }

  drawParticles(c) {
    for (const pass of [false, true]) {
      c.globalCompositeOperation = pass ? 'lighter' : 'source-over';
      for (const p of this.particles) {
        if (!!p.glow !== pass) continue;
        c.globalAlpha = Math.max(0, (p.life / p.max) * (p.alpha ?? 1));
        c.fillStyle = p.color;
        if (p.glow || p.grow) { c.beginPath(); c.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2); c.fill(); }
        else c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }

  // ---- HUD ------------------------------------------------------------------

  panel(c, x, y, w, h) {
    c.fillStyle = 'rgba(12,10,28,0.55)';
    c.beginPath(); c.roundRect(x, y, w, h, 8); c.fill();
  }

  bar(c, x, y, w, h, f, color) {
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.roundRect(x, y, w, h, h / 2); c.fill();
    if (f > 0) { c.fillStyle = color; c.beginPath(); c.roundRect(x, y, Math.max(h, w * f), h, h / 2); c.fill(); }
  }

  drawHUD(c, cam, W, H, p, input, showScores) {
    const w = this.world, touch = input.touchMode;
    c.textBaseline = 'middle';

    // vitals
    this.panel(c, 12, 12, 220, 54);
    c.font = '700 12px system-ui, sans-serif'; c.textAlign = 'left'; c.fillStyle = '#fff';
    c.fillText(`${Math.ceil(p.hp)}`, 22, 27);
    this.bar(c, 52, 21, 170, 12, p.hp / PLAYER.hp, p.hp > 50 ? '#6be585' : p.hp > 25 ? '#ffd23f' : '#ff5a5a');
    c.fillStyle = '#9fdcff'; c.fillText('JET', 22, 50);
    this.bar(c, 52, 45, 170, 10, p.fuel, p.fuel > 0.2 ? '#58c7ff' : '#ff8a5c');

    // weapon
    const wpn = p.inv[p.cur], def = WEAPONS[wpn.key];
    const wy = touch ? 74 : H - 70;
    this.panel(c, 12, wy, 220, 58);
    c.fillStyle = def.color; c.font = '700 13px system-ui, sans-serif';
    c.fillText(def.name.toUpperCase(), 22, wy + 17);
    c.fillStyle = '#fff'; c.font = '800 20px system-ui, sans-serif';
    c.fillText(`${wpn.mag}`, 22, wy + 40);
    const mw = c.measureText(`${wpn.mag}`).width;
    c.font = '600 13px system-ui, sans-serif'; c.fillStyle = '#b9b3d6';
    c.fillText(`/ ${wpn.reserve === Infinity ? '∞' : wpn.reserve}`, 26 + mw, wy + 42);
    c.textAlign = 'right'; c.fillStyle = '#b5e48c';
    c.fillText(`● × ${p.grenades}`, 222, wy + 17);
    if (p.inv.length > 1) { c.fillStyle = '#8e88b0'; c.fillText(`${touch ? 'SWAP' : 'Q'}: ${WEAPONS[p.inv[1 - p.cur].key].name}`, 222, wy + 42); }
    if (p.reloadT > 0) this.bar(c, 22, wy + 52, 200, 3, 1 - p.reloadT / def.reload, '#ffd36b');

    // timer + score
    const mm = Math.floor(w.time / 60), ss = Math.floor(w.time % 60);
    c.textAlign = 'center';
    this.panel(c, W / 2 - 90, 12, 180, 46);
    c.fillStyle = '#fff'; c.font = '800 16px system-ui, sans-serif';
    c.fillText(`${mm}:${String(ss).padStart(2, '0')}`, W / 2, 26);
    c.font = '700 12px system-ui, sans-serif';
    if (w.mode === 'team') {
      c.fillStyle = TEAM_COLORS[0]; c.fillText(`${TEAM_NAMES[0]} ${w.teamScore(0)}`, W / 2 - 40, 46);
      c.fillStyle = TEAM_COLORS[1]; c.fillText(`${w.teamScore(1)} ${TEAM_NAMES[1]}`, W / 2 + 40, 46);
    } else {
      const lead = Math.max(...w.players.map((o) => o.kills));
      c.fillStyle = '#d8d2f5'; c.fillText(`You ${p.kills}  ·  Lead ${lead}  ·  to ${w.killLimit}`, W / 2, 46);
    }

    this.drawMinimap(c, W, p);

    // kill feed
    c.font = '600 12px system-ui, sans-serif';
    this.feed.forEach((f, i) => {
      const y = 112 + i * 22;
      const text = `${f.killer && f.killer !== f.victim ? f.killer.name : '✷'}  [${KILL_ICON[f.key] || f.key}${f.head ? ' ⊕' : ''}]  ${f.victim.name}`;
      const tw = c.measureText(text).width;
      c.globalAlpha = Math.min(1, f.t);
      this.panel(c, W - tw - 28, y - 9, tw + 16, 19);
      c.textAlign = 'right'; c.fillStyle = f.local ? '#ffd36b' : '#fff';
      c.fillText(text, W - 20, y + 1);
      c.globalAlpha = 1;
    });

    // swap prompt
    const near = w.nearbySwap(p);
    if (near) {
      c.textAlign = 'center'; c.font = '700 14px system-ui, sans-serif';
      const msg = `${touch ? 'Tap TAKE' : 'Press E'} to swap for ${WEAPONS[near.kind].name}`;
      const tw = c.measureText(msg).width;
      this.panel(c, W / 2 - tw / 2 - 12, H * 0.68 - 14, tw + 24, 28);
      c.fillStyle = '#a8ffcf'; c.fillText(msg, W / 2, H * 0.68);
    }

    // death
    if (!p.alive) {
      c.textAlign = 'center';
      c.fillStyle = 'rgba(10,6,20,0.35)'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#fff'; c.font = '800 28px system-ui, sans-serif';
      const by = w.byId(p.killedBy);
      c.fillText(by ? `Taken down by ${by.name}` : 'Self-destructed', W / 2, H * 0.42);
      c.font = '600 16px system-ui, sans-serif'; c.fillStyle = '#c9c2ef';
      c.fillText(`Redeploying in ${Math.max(0, p.respawnTimer).toFixed(1)}s`, W / 2, H * 0.42 + 34);
    }

    // crosshair
    if (p.alive) {
      let x, y;
      if (!touch && input.mouse.active) { x = input.mouse.x; y = input.mouse.y; }
      else {
        x = (p.x + p.w / 2 + Math.cos(p.aim) * 110 - cam.x) * cam.zoom;
        y = (p.y + 10 + Math.sin(p.aim) * 110 - cam.y) * cam.zoom;
      }
      c.strokeStyle = this.hitMarker > 0 ? '#ff5a5a' : 'rgba(255,255,255,0.9)';
      c.lineWidth = 2;
      const g = 4 + def.spread * 40, l = 7;
      c.beginPath();
      c.moveTo(x - g - l, y); c.lineTo(x - g, y); c.moveTo(x + g, y); c.lineTo(x + g + l, y);
      c.moveTo(x, y - g - l); c.lineTo(x, y - g); c.moveTo(x, y + g); c.lineTo(x, y + g + l);
      if (this.hitMarker > 0) { c.moveTo(x - 6, y - 6); c.lineTo(x + 6, y + 6); c.moveTo(x + 6, y - 6); c.lineTo(x - 6, y + 6); }
      c.stroke();
    }

    if (this.dmgFlash > 0) {
      const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(255,40,60,0)'); g.addColorStop(1, `rgba(255,40,60,${this.dmgFlash})`);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }

    if (touch) this.drawTouch(c, input);
    if (showScores) this.drawScores(c, W, H);
  }

  drawMinimap(c, W, local) {
    const m = this.world.map, mw = 170, mh = (mw * m.h) / m.w, x = W - mw - 12, y = 12;
    this.panel(c, x - 4, y - 4, mw + 8, mh + 8);
    c.imageSmoothingEnabled = false;
    c.drawImage(this.mini, x, y, mw, mh);
    c.imageSmoothingEnabled = true;
    const s = mw / m.pw;
    for (const p of this.world.players) {
      if (!p.alive) continue;
      c.fillStyle = p.id === local.id ? '#fff' : p.color;
      c.beginPath(); c.arc(x + (p.x + p.w / 2) * s, y + (p.y + p.h / 2) * s, p.id === local.id ? 3 : 2.2, 0, Math.PI * 2); c.fill();
    }
  }

  drawTouch(c, input) {
    for (const st of [input.sticks.left, input.sticks.right]) {
      if (!st) continue;
      c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.arc(st.ox, st.oy, input.stickR, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.4)'; c.beginPath(); c.arc(st.x, st.y, input.stickR * 0.45, 0, Math.PI * 2); c.fill();
    }
    c.font = '700 11px system-ui, sans-serif'; c.textAlign = 'center';
    for (const b of input.buttons) {
      c.fillStyle = b.pressed > 0 ? 'rgba(255,255,255,0.4)' : 'rgba(20,16,40,0.45)';
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#fff'; c.fillText(b.label, b.x, b.y + 1);
    }
    if (!input.sticks.left && !input.sticks.right) {
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.font = '600 12px system-ui, sans-serif';
      c.fillText('drag: move / fly', input.w * 0.2, input.h - 30);
      c.fillText('drag: aim + fire', input.w * 0.75, input.h - 30);
    }
  }

  drawScores(c, W, H) {
    const w = this.world;
    const rows = [...w.players].sort((a, b) => (w.mode === 'team' ? a.team - b.team : 0) || b.kills - a.kills || a.deaths - b.deaths);
    const pw = Math.min(420, W - 40), ph = 56 + rows.length * 24, x = W / 2 - pw / 2, y = Math.max(70, H / 2 - ph / 2);
    c.fillStyle = 'rgba(12,10,28,0.85)'; c.beginPath(); c.roundRect(x, y, pw, ph, 10); c.fill();
    c.font = '800 14px system-ui, sans-serif'; c.fillStyle = '#fff'; c.textAlign = 'left';
    c.fillText('PILOT', x + 20, y + 24);
    c.textAlign = 'right'; c.fillText('K', x + pw - 70, y + 24); c.fillText('D', x + pw - 24, y + 24);
    c.font = '600 13px system-ui, sans-serif';
    rows.forEach((p, i) => {
      const ry = y + 50 + i * 24;
      c.fillStyle = p.color; c.fillRect(x + 20, ry - 6, 10, 12);
      c.textAlign = 'left'; c.fillStyle = p.isBot ? '#ddd8f5' : '#ffd36b';
      c.fillText(p.name, x + 38, ry);
      c.textAlign = 'right'; c.fillStyle = '#fff';
      c.fillText(p.kills, x + pw - 70, ry); c.fillText(p.deaths, x + pw - 24, ry);
    });
  }
}
