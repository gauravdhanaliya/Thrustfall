// Headless sanity check: runs a bots-only match and verifies nothing breaks.
// Usage: node tools/smoke.mjs [seconds] [mode]
import { World } from '../web/src/sim.js';
import { BotBrain } from '../web/src/bot.js';
import { STEP } from '../web/src/config.js';

const seconds = Number(process.argv[2] || 180);
const mode = process.argv[3] || 'ffa';
const seed = Number(process.argv[4] || 12345);
const world = new World({ mode, seed, killLimit: 999, timeLimit: seconds + 10 });
const bots = [];
for (let i = 0; i < 8; i++) bots.push(new BotBrain(world, world.addPlayer({ name: `bot${i}`, isBot: true, team: mode === 'team' ? i % 2 : i }), 'normal'));

const counts = {};
for (let t = 0; t < seconds / STEP; t++) {
  const inputs = new Map(bots.map((b) => [b.p.id, b.think(STEP)]));
  world.step(STEP, inputs);
  for (const e of world.events) counts[e.type] = (counts[e.type] || 0) + 1;
  world.events.length = 0;
  for (const p of world.players)
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || (p.alive && world.map.rectSolid(p.x, p.y, p.w, p.h)))
      throw new Error(`bad state for ${p.name} at tick ${t}: ${p.x},${p.y}`);
}
console.log(`spawns=${world.map.spawns.length} pickupSpots=${world.map.pickupSpots.length}`);
console.log('events', counts);
console.log(world.players.map((p) => `${p.name} K${p.kills} D${p.deaths}`).join(' | '));
if (!counts.kill) throw new Error('no kills happened — bots are not fighting');
console.log('OK');
