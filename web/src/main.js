import { STEP, PLAYER_COLORS, TEAM_COLORS, TEAM_NAMES, BOT_NAMES } from './config.js';
import { World } from './sim.js';
import { BotBrain } from './bot.js';
import { HumanInput } from './input.js';
import { Renderer, Camera } from './render.js';
import { Sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const input = new HumanInput(canvas);
const renderer = new Renderer(canvas);
const cam = new Camera();
const sfx = new Sfx();

let game = null; // { world, local, bots, opts, demo, overAt }
let paused = false;
let acc = 0;
let last = performance.now();

const DEFAULTS = { name: 'Pilot', mode: 'ffa', bots: 5, difficulty: 'normal', killLimit: 20, muted: false };
function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('thrustfall.settings') || '{}') }; } catch { return { ...DEFAULTS }; }
}
function saveSettings(s) {
  try { localStorage.setItem('thrustfall.settings', JSON.stringify(s)); } catch {}
}

function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  renderer.dpr = dpr;
  cam.setScreen(innerWidth, innerHeight);
  input.layout(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();

function show(id) {
  for (const el of document.querySelectorAll('.overlay')) el.hidden = el.id !== id;
}

function startMatch(opts, demo = false) {
  const world = new World({ mode: opts.mode, killLimit: opts.killLimit });
  const team = opts.mode === 'team';
  const local = demo ? null : world.addPlayer({ name: opts.name || 'Pilot', team: 0, color: team ? TEAM_COLORS[0] : PLAYER_COLORS[0] });
  const bots = [];
  for (let i = 0; i < opts.bots; i++) {
    const t = team ? (i % 2 === 0 ? 1 : 0) : i + 1;
    const p = world.addPlayer({ name: BOT_NAMES[i % BOT_NAMES.length], isBot: true, team: t, color: team ? TEAM_COLORS[t] : PLAYER_COLORS[(i + 1) % PLAYER_COLORS.length] });
    bots.push(new BotBrain(world, p, opts.difficulty));
  }
  game = { world, local, bots, opts, demo, overAt: 0 };
  renderer.setWorld(world);
  input.reset();
  paused = false;
  acc = 0;
  stepWorld(); // spawns everyone
  cam.follow(focusPlayer(), null, world.map, 0, true);
  if (!demo) show(null);
}

function focusPlayer() {
  if (game.local) return game.local;
  return game.world.players.find((p) => p.alive) || game.world.players[0];
}

function stepWorld() {
  const { world, local, bots } = game;
  const inputs = new Map();
  if (local) inputs.set(local.id, input.sample(local, cam, STEP));
  for (const b of bots) inputs.set(b.p.id, b.think(STEP));
  world.step(STEP, inputs);
  const events = world.events;
  world.events = [];
  renderer.consume(events, local ? local.id : -1);
  if (!game.demo) sfx.handle(events, local);
}

function setPaused(v) {
  if (!game || game.demo || game.world.over) return;
  paused = v;
  input.reset();
  show(paused ? 'pause' : null);
}
input.onPause = () => setPaused(!paused);
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

function showResults() {
  const { world, local } = game;
  let title;
  if (world.winner?.draw) title = 'Draw!';
  else if (world.mode === 'team') title = world.winner.team === local.team ? 'Your team wins!' : `${TEAM_NAMES[world.winner.team]} team wins`;
  else title = world.winner.player === local.id ? 'Victory!' : `${world.byId(world.winner.player).name} wins`;
  $('result-title').textContent = title;
  const rows = [...world.players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  const tbody = $('result-rows');
  tbody.replaceChildren(...rows.map((p) => {
    const tr = document.createElement('tr');
    if (p === local) tr.className = 'me';
    for (const v of [p.name, p.kills, p.deaths]) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.append(td);
    }
    tr.firstChild.style.setProperty('--dot', p.color);
    return tr;
  }));
  $('result-sub').textContent = world.mode === 'team' ? `${TEAM_NAMES[0]} ${world.teamScore(0)} — ${world.teamScore(1)} ${TEAM_NAMES[1]}` : `First to ${world.killLimit} kills`;
  show('end');
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (game) {
    if (!paused && !game.world.over) {
      acc += dt;
      while (acc >= STEP) {
        stepWorld();
        acc -= STEP;
      }
    }
    if (game.world.over) {
      if (game.demo) startMatch(game.opts, true);
      else if (!game.overAt) game.overAt = now;
      else if (now - game.overAt > 1500 && $('end').hidden) showResults();
    }
    cam.follow(focusPlayer(), game.local ? input : null, game.world.map, dt);
    renderer.draw(cam, game.local, input, !!game.local && (input.showScores || (game.world.over && $('end').hidden)), dt);
    sfx.setJet(!!game.local && !paused && game.local.alive && game.local.jetting && !game.world.over);
  }
  requestAnimationFrame(frame);
}

// ---- menu wiring --------------------------------------------------------------

const settings = loadSettings();
$('name').value = settings.name;
$('mode').value = settings.mode;
$('bots').value = settings.bots;
$('bots-out').textContent = settings.bots;
$('difficulty').value = settings.difficulty;
$('limit').value = settings.killLimit;
$('mute').checked = settings.muted;
sfx.setMuted(settings.muted);
$('bots').addEventListener('input', () => ($('bots-out').textContent = $('bots').value));
$('mute').addEventListener('change', () => { settings.muted = $('mute').checked; sfx.setMuted(settings.muted); saveSettings(settings); });

function readSettings() {
  Object.assign(settings, {
    name: $('name').value.trim().slice(0, 14) || 'Pilot',
    mode: $('mode').value,
    bots: Number($('bots').value),
    difficulty: $('difficulty').value,
    killLimit: Number($('limit').value),
  });
  saveSettings(settings);
  return { ...settings };
}

async function enterGame() {
  sfx.unlock();
  if (matchMedia('(pointer: coarse)').matches) {
    try { await document.documentElement.requestFullscreen?.(); } catch {}
    try { await screen.orientation?.lock?.('landscape'); } catch {}
  }
  startMatch(readSettings());
}

$('menu-form').addEventListener('submit', (e) => { e.preventDefault(); enterGame(); });
$('resume').addEventListener('click', () => setPaused(false));
$('restart').addEventListener('click', () => startMatch(game.opts));
$('again').addEventListener('click', () => startMatch(game.opts));
for (const id of ['quit', 'to-menu']) $(id).addEventListener('click', () => { startMatch({ ...settings, mode: 'ffa', bots: 7 }, true); show('menu'); });
addEventListener('pointerdown', () => sfx.unlock(), { once: true });

// attract mode behind the menu
startMatch({ ...settings, mode: 'ffa', bots: 7, difficulty: 'normal' }, true);
show('menu');
requestAnimationFrame(frame);
