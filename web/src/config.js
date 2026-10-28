// Shared tuning for the simulation, bots and renderer. No DOM access here so the
// same module can run on a future authoritative multiplayer server.

export const TILE = 16;
export const MAP_W = 150;
export const MAP_H = 70;
export const STEP = 1 / 60;

export const T = { EMPTY: 0, DIRT: 1, ROCK: 2, METAL: 3 };

export const PHYS = {
  gravity: 1500,
  maxFall: 780,
  maxRise: 430,
  runSpeed: 200,
  groundAccel: 2000,
  airAccel: 1100,
  jetForce: 3000,
  fuelDrain: 0.5,
  fuelRegenGround: 0.6,
  fuelRegenAir: 0.12,
};

export const PLAYER = { w: 14, h: 26, hp: 100, respawn: 3, spawnShield: 1.5, grenades: 3, maxGrenades: 5 };

// spread = max random angle offset (radians) per pellet; kick = self knockback
export const WEAPONS = {
  pistol:  { name: 'Sidearm',   dmg: 20, rate: 0.26,  mag: 12, reserve: Infinity, reload: 0.9, speed: 1100, spread: 0.025, pellets: 1, range: 650,  len: 10, kick: 0,   color: '#ffe9a3' },
  smg:     { name: 'Stinger',   dmg: 10, rate: 0.075, mag: 30, reserve: 120, reload: 1.4, speed: 1150, spread: 0.07,  pellets: 1, range: 600,  len: 16, kick: 0,   color: '#ffd36b' },
  shotgun: { name: 'Breacher',  dmg: 11, rate: 0.75,  mag: 6,  reserve: 24,  reload: 1.8, speed: 950,  spread: 0.2,   pellets: 8, range: 320,  len: 20, kick: 90,  color: '#ffb36b' },
  sniper:  { name: 'Longshot',  dmg: 85, rate: 1.1,   mag: 5,  reserve: 15,  reload: 2.2, speed: 2600, spread: 0,     pellets: 1, range: 1600, len: 26, kick: 60,  color: '#9fe7ff' },
  rocket:  { name: 'Thumper',   dmg: 0,  rate: 1.0,   mag: 1,  reserve: 6,   reload: 1.6, speed: 560,  spread: 0.01,  pellets: 1, range: 1400, len: 24, kick: 150, color: '#ff8a5c',
             explosive: { radius: 70, dmg: 95, force: 520 } },
};

export const GRENADE = { fuse: 1.8, radius: 76, dmg: 100, force: 560, throwSpeed: 640 };

export const MATCH = { killLimit: 20, timeLimit: 300 };

export const PLAYER_COLORS = ['#4aa3ff', '#ff5a5a', '#ffd23f', '#7ae582', '#c77dff', '#ff9f43', '#2ee6d6', '#ff6fb5', '#a0a8ff', '#f4f1de', '#b5e48c', '#f28482'];
export const TEAM_COLORS = ['#4aa3ff', '#ff5a5a'];
export const TEAM_NAMES = ['Blue', 'Red'];
export const BOT_NAMES = ['Rivet', 'Sprocket', 'Cinder', 'Volt', 'Gizmo', 'Flint', 'Nova', 'Piston', 'Zapp', 'Tango', 'Hex', 'Dynamo'];
