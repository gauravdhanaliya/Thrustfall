// Keyboard + mouse and dual-stick touch controls, sampled into the same input
// object the simulation and bots use.

const EDGE_KEYS = { KeyG: 'grenade', KeyQ: 'swap', KeyR: 'reload', KeyE: 'interact' };

export class HumanInput {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false, active: false };
    this.edges = { grenade: false, swap: false, reload: false, interact: false };
    this.touchMode = matchMedia('(pointer: coarse)').matches;
    this.sticks = { left: null, right: null };
    this.stickR = 56;
    this.buttons = [];
    this.lastAim = 0;
    this.showScores = false;
    this.onPause = null;
    this.lastWheel = 0;
    this.w = innerWidth;
    this.h = innerHeight;

    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (e.code === 'Escape' || e.code === 'KeyP') { if (!e.repeat) this.onPause?.(); return; }
      if (e.code === 'Tab') this.showScores = true;
      if (EDGE_KEYS[e.code] && !e.repeat) this.edges[EDGE_KEYS[e.code]] = true;
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => {
      if (e.code === 'Tab') this.showScores = false;
      this.keys.delete(e.code);
    });
    addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; this.showScores = false; });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const now = performance.now();
      if (now - this.lastWheel > 200) { this.edges.swap = true; this.lastWheel = now; }
    }, { passive: false });

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') {
        this.touchMode = false;
        this.mouse.active = true;
        this.mouse.x = e.clientX; this.mouse.y = e.clientY;
        if (e.button === 0) this.mouse.down = true;
        if (e.button === 2) this.edges.grenade = true;
        return;
      }
      e.preventDefault();
      this.touchMode = true;
      const x = e.clientX, y = e.clientY;
      const b = this.buttons.find((b) => Math.hypot(b.x - x, b.y - y) < b.r * 1.2);
      if (b) {
        b.pressed = 0.15;
        if (b.id === 'pause') this.onPause?.();
        else if (b.id === 'scores') this.showScores = !this.showScores;
        else this.edges[b.id] = true;
        return;
      }
      const st = { id: e.pointerId, ox: x, oy: y, x, y };
      if (x < this.w * 0.45) { if (!this.sticks.left) this.sticks.left = st; }
      else if (!this.sticks.right) this.sticks.right = st;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        this.mouse.active = true;
        this.mouse.x = e.clientX; this.mouse.y = e.clientY;
        return;
      }
      for (const st of [this.sticks.left, this.sticks.right]) {
        if (!st || st.id !== e.pointerId) continue;
        st.x = e.clientX; st.y = e.clientY;
        // floating stick: drag the base along when the thumb overshoots
        const dx = st.x - st.ox, dy = st.y - st.oy, d = Math.hypot(dx, dy);
        if (d > this.stickR) { st.ox = st.x - (dx / d) * this.stickR; st.oy = st.y - (dy / d) * this.stickR; }
      }
    });
    const release = (e) => {
      if (e.pointerType === 'mouse') { if (e.button === 0) this.mouse.down = false; return; }
      if (this.sticks.left?.id === e.pointerId) this.sticks.left = null;
      if (this.sticks.right?.id === e.pointerId) this.sticks.right = null;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }

  layout(w, h) {
    this.w = w; this.h = h;
    const r = Math.max(24, Math.min(34, h * 0.065));
    this.stickR = Math.max(44, Math.min(70, h * 0.13));
    const top = 12 + (170 * 70) / 150 + 30 + r; // below the minimap
    this.buttons = [
      { id: 'reload', label: 'RELOAD', x: w - 12 - r, y: top, r },
      { id: 'swap', label: 'SWAP', x: w - 12 - r * 3.4, y: top, r },
      { id: 'grenade', label: 'NADE', x: w - 12 - r, y: top + r * 2.5, r },
      { id: 'interact', label: 'TAKE', x: w - 12 - r * 3.4, y: top + r * 2.5, r },
      { id: 'pause', label: 'II', x: w / 2 + 112, y: 35, r: 18 },
      { id: 'scores', label: 'TAB', x: w / 2 - 112, y: 35, r: 18 },
    ];
  }

  stick(st) {
    let x = (st.x - st.ox) / this.stickR, y = (st.y - st.oy) / this.stickR;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y, m: Math.min(1, m) };
  }

  sample(player, cam, dt) {
    for (const b of this.buttons) if (b.pressed > 0) b.pressed -= dt;
    const k = this.keys;
    let move = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let jet = k.has('KeyW') || k.has('ArrowUp') || k.has('Space');
    let fire = this.mouse.down;
    if (this.sticks.left) {
      const v = this.stick(this.sticks.left);
      if (Math.abs(v.x) > 0.2) move = v.x;
      if (v.y < -0.4) jet = true;
    }
    if (this.sticks.right) {
      const v = this.stick(this.sticks.right);
      if (v.m > 0.2) this.lastAim = Math.atan2(v.y, v.x);
      if (v.m > 0.65) fire = true;
    } else if (!this.touchMode && this.mouse.active && player) {
      const w = cam.screenToWorld(this.mouse.x, this.mouse.y);
      this.lastAim = Math.atan2(w.y - (player.y + 10), w.x - (player.x + player.w / 2));
    }
    const inp = { move, jet, aim: this.lastAim, fire, ...this.edges };
    for (const e in this.edges) this.edges[e] = false;
    return inp;
  }

  reset() {
    this.keys.clear();
    this.mouse.down = false;
    this.sticks.left = this.sticks.right = null;
    for (const e in this.edges) this.edges[e] = false;
  }
}
