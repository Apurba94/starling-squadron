// Starling Squadron rules: a vertical shooter with scripted stages and bosses. No drawing here, so it can be tested.
import { Rng, TAU, clamp, dist } from "./gamekit.js";

export const W = 390, H = 720, STAGES = 8;
export const HIT_R = 7;
export const SHIPS = {
  dart: { hp: 8, r: 15, speed: 140, score: 50, color: "#f87171", fire: 0 },
  gunner: { hp: 18, r: 17, speed: 70, score: 100, color: "#fb923c", fire: 1.5 },
  swinger: { hp: 12, r: 15, speed: 110, score: 80, color: "#a3e635", fire: 2.2 },
  tank: { hp: 60, r: 26, speed: 42, score: 300, color: "#94a3b8", fire: 1.1 },
  spinner: { hp: 34, r: 20, speed: 50, score: 220, color: "#e879f9", fire: 0.55 },
};
export const BOSSES = [
  { name: "Hawkmoth", hp: 340, color: "#f97316", phases: ["fan", "aimed"] },
  { name: "Ironbill", hp: 640, color: "#94a3b8", phases: ["aimed", "walls"] },
  { name: "Mirror Kite", hp: 900, color: "#38bdf8", phases: ["spiral", "fan"] },
  { name: "Thornwing", hp: 1120, color: "#84cc16", phases: ["fan", "walls", "aimed"] },
  { name: "Grey Shrike", hp: 1320, color: "#cbd5e1", phases: ["spiral", "aimed"] },
  { name: "Twin Harrier", hp: 1560, color: "#f472b6", phases: ["fan", "spiral", "walls"] },
  { name: "Stormcrow", hp: 1860, color: "#818cf8", phases: ["walls", "spiral", "aimed"] },
  { name: "The Last Kestrel", hp: 2300, color: "#fbbf24", phases: ["fan", "spiral", "walls", "aimed"] },
];
export const UPGRADES = {
  guns: { name: "Guns", text: "More bullets and damage", cost: 120, max: 5 },
  armor: { name: "Armour", text: "+1 shield segment", cost: 100, max: 4 },
  magnet: { name: "Magnet", text: "Pull coins from further away", cost: 60, max: 3 },
  wing: { name: "Wingmates", text: "Extra guns beside you", cost: 200, max: 2 },
};
export const upgradeCost = (id, lvl) => UPGRADES[id].cost * (lvl + 1);

/** Timed groups of enemies for a stage, generated from a seed. */
export function makeWaves(stage) {
  const rng = new Rng(8080 + stage * 17);
  const out = [];
  let t = 1.5;
  const count = 14 + stage * 2;
  const pool = ["dart", "dart", "swinger", "gunner", "tank", "spinner"].slice(0, 3 + Math.min(3, stage));
  for (let i = 0; i < count; i++) {
    const kind = rng.pick(pool);
    const n = kind === "tank" || kind === "spinner" ? 1 + (stage > 4 ? 1 : 0) : rng.int(3, 5);
    const pattern = rng.pick(["line", "vee", "side"]);
    const x = rng.range(70, W - 70);
    for (let k = 0; k < n; k++) {
      out.push({ t: t + (pattern === "line" ? k * 0.35 : pattern === "side" ? k * 0.25 : Math.abs(k - (n - 1) / 2) * 0.22), kind, x: pattern === "side" ? (k % 2 ? 50 : W - 50) : pattern === "vee" ? clamp(x + (k - (n - 1) / 2) * 46, 30, W - 30) : x, phase: k });
    }
    t += rng.range(2.4, 3.4) - stage * 0.1;
  }
  out.sort((a, b) => a.t - b.t);
  return { list: out, end: t + 2 };
}

export class Flight {
  constructor(stage, upgrades = {}, seed = 1) {
    this.stage = stage;
    this.up = upgrades;
    this.rng = new Rng(seed * 991 + stage);
    const w = makeWaves(stage);
    this.waves = w.list;
    this.bossAt = w.end;
    this.t = 0;
    this.next = 0;
    this.px = W / 2; this.py = H - 110;
    this.maxShield = 3 + (upgrades.armor || 0);
    this.shield = this.maxShield;
    this.safe = 0;
    this.power = 0;
    this.gunT = 0;
    this.enemies = [];
    this.shots = [];
    this.bullets = [];
    this.drops = [];
    this.events = [];
    this.score = 0;
    this.coins = 0;
    this.boss = null;
    this.state = "playing";
    this.kills = 0;
  }
  guns() { return (this.up.guns || 0) + this.power; }
  fire() {
    const lvl = this.guns(), dmg = 6 + (this.up.guns || 0) * 1.6;
    const shot = (x, vx) => this.shots.push({ x, y: this.py - 18, vx, vy: -720, dmg });
    const lanes = 1 + Math.floor(lvl / 2);
    for (let i = 0; i < lanes; i++) {
      const o = i - (lanes - 1) / 2;
      shot(this.px + o * 13, o * 50);
    }
    for (let i = 0; i < (this.up.wing || 0); i++) {
      const s = i % 2 ? 1 : -1;
      shot(this.px + s * (34 + i * 8), 0);
    }
    this.events.push({ kind: "shot" });
  }
  spawn(w) {
    const d = SHIPS[w.kind], scale = 1 + this.stage * 0.22;
    this.enemies.push({ kind: w.kind, x: w.x, y: -30, hp: d.hp * scale, max: d.hp * scale, r: d.r, t: 0, phase: w.phase, baseX: w.x, cool: 0.6 + this.rng.next() * d.fire, spin: 0 });
  }
  aimed(x, y, speed, spread = 0) {
    const a = Math.atan2(this.py - y, this.px - x) + spread;
    this.bullets.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 5 });
  }
  moveEnemy(e, dt) {
    const d = SHIPS[e.kind];
    e.t += dt;
    if (e.kind === "swinger") { e.y += d.speed * dt; e.x = e.baseX + Math.sin(e.t * 2.2 + e.phase) * 80; } else if ((e.kind === "gunner" || e.kind === "tank" || e.kind === "spinner") && e.y > 120 + e.phase * 22 && e.t < 7) { e.x = e.baseX + Math.sin(e.t) * 20; } else e.y += d.speed * dt * (e.t >= 7 ? 2.5 : 1);
    if (d.fire && e.y > 0) {
      e.cool -= dt;
      if (e.cool <= 0) {
        e.cool = d.fire * (1 - this.stage * 0.04);
        const v = 170 + this.stage * 14;
        if (e.kind === "spinner") { for (let i = 0; i < 8; i++) { const a = e.spin + (i * TAU) / 8; this.bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * v * 0.8, vy: Math.sin(a) * v * 0.8, r: 5 }); } e.spin += 0.35; } else if (e.kind === "tank") { for (const s of [-0.28, 0, 0.28]) this.aimed(e.x, e.y, v, s); } else this.aimed(e.x, e.y, v);
      }
    }
    if (e.y > H + 40) e.gone = true;
  }
  startBoss() {
    const b = BOSSES[this.stage];
    this.boss = { ...b, x: W / 2, y: -80, max: b.hp, hp: b.hp, t: 0, cool: 1.2, spin: 0, phase: 0, r: 46, wall: 0 };
    this.events.push({ kind: "boss", name: b.name });
  }
  bossFire(b) {
    const v = 180 + this.stage * 10;
    const mode = b.phases[Math.min(b.phases.length - 1, Math.floor((1 - b.hp / b.max) * b.phases.length))];
    b.mode = mode;
    if (mode === "fan") {
      b.cool = 1.1;
      const n = 9 + this.stage;
      for (let i = 0; i < n; i++) { const a = Math.PI / 2 + ((i - (n - 1) / 2) * 1.5) / n; this.bullets.push({ x: b.x, y: b.y + 24, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 6 }); }
    } else if (mode === "aimed") {
      b.cool = 0.5;
      for (const s of [-0.16, 0, 0.16]) this.aimed(b.x, b.y + 24, v * 1.25, s);
    } else if (mode === "spiral") {
      b.cool = 0.11;
      for (let i = 0; i < 2; i++) { const a = b.spin + i * Math.PI; this.bullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * v * 0.8, vy: Math.sin(a) * v * 0.8, r: 5 }); }
      b.spin += 0.37;
    } else {
      b.cool = 1.5;
      const gap = this.rng.int(1, 6);
      for (let i = 0; i < 8; i++) if (Math.abs(i - gap) > 1) this.bullets.push({ x: 26 + i * 48, y: b.y, vx: 0, vy: v * 0.95, r: 7 });
    }
  }
  stepBoss(dt) {
    const b = this.boss;
    if (!b) return;
    b.t += dt;
    if (b.y < 130) { b.y += 90 * dt; return; }
    b.x = W / 2 + Math.sin(b.t * 0.7) * 110;
    b.cool -= dt;
    if (b.cool <= 0) this.bossFire(b);
  }
  hitPlayer() {
    if (this.safe > 0) return;
    this.shield--;
    this.safe = 1.6;
    this.power = Math.max(0, this.power - 1);
    this.bullets = this.bullets.filter((b) => dist(b.x, b.y, this.px, this.py) > 90);
    this.events.push({ kind: "hurt", x: this.px, y: this.py });
    if (this.shield <= 0) { this.state = "lost"; this.events.push({ kind: "dead", x: this.px, y: this.py }); }
  }
  dropFrom(e) {
    const roll = this.rng.next();
    this.drops.push({ x: e.x, y: e.y, kind: roll < 0.08 ? "power" : roll < 0.12 ? "shield" : "coin" });
  }
  kill(e) {
    e.gone = true;
    this.kills++;
    this.score += SHIPS[e.kind].score;
    this.events.push({ kind: "kill", x: e.x, y: e.y, color: SHIPS[e.kind].color, big: e.kind === "tank" });
    this.dropFrom(e);
  }
  step(dt, tx, ty) {
    if (this.state !== "playing") return;
    this.t += dt;
    const mx = clamp(tx, 14, W - 14), my = clamp(ty, 40, H - 24);
    const dx = mx - this.px, dy = my - this.py, d = Math.hypot(dx, dy), max = 640 * dt;
    this.px += d > max ? (dx / d) * max : dx;
    this.py += d > max ? (dy / d) * max : dy;
    this.safe = Math.max(0, this.safe - dt);
    this.gunT -= dt;
    if (this.gunT <= 0) { this.gunT = 0.14; this.fire(); }
    while (this.next < this.waves.length && this.waves[this.next].t <= this.t) this.spawn(this.waves[this.next++]);
    if (!this.boss && this.t >= this.bossAt) this.startBoss();
    for (const e of this.enemies) this.moveEnemy(e, dt);
    this.stepBoss(dt);
    for (const s of this.shots) { s.x += s.vx * dt; s.y += s.vy * dt; }
    for (const b of this.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
    for (const s of this.shots) {
      for (const e of this.enemies) {
        if (e.gone || s.gone || dist(s.x, s.y, e.x, e.y) > e.r + 4) continue;
        s.gone = true;
        e.hp -= s.dmg;
        if (e.hp <= 0) this.kill(e);
      }
      const b = this.boss;
      if (b && !s.gone && b.y >= 100 && dist(s.x, s.y, b.x, b.y) < b.r) {
        s.gone = true;
        b.hp -= s.dmg;
        if (b.hp <= 0) { this.score += 2000 + this.stage * 500; this.coins += 40 + this.stage * 10; this.state = "won"; this.events.push({ kind: "bossDown", x: b.x, y: b.y }); return; }
      }
    }
    for (const b of this.bullets) if (dist(b.x, b.y, this.px, this.py) < b.r + HIT_R - 3) { this.hitPlayer(); b.gone = true; break; }
    for (const e of this.enemies) if (!e.gone && dist(e.x, e.y, this.px, this.py) < e.r + HIT_R - 3) { this.hitPlayer(); e.hp -= 30; if (e.hp <= 0) this.kill(e); }
    if (this.boss && dist(this.boss.x, this.boss.y, this.px, this.py) < this.boss.r) this.hitPlayer();
    const reach = 60 + (this.up.magnet || 0) * 55;
    for (const p of this.drops) {
      const near = dist(p.x, p.y, this.px, this.py);
      if (near < reach) { p.x += ((this.px - p.x) / near) * 320 * dt; p.y += ((this.py - p.y) / near) * 320 * dt; } else p.y += 110 * dt;
      if (near < 22) {
        p.gone = true;
        if (p.kind === "coin") { this.coins += 2 + this.stage; this.score += 10; }
        if (p.kind === "power") this.power = Math.min(4, this.power + 1);
        if (p.kind === "shield") this.shield = Math.min(this.maxShield, this.shield + 1);
        this.events.push({ kind: "pickup", type: p.kind, x: p.x, y: p.y });
      } else if (p.y > H + 20) p.gone = true;
    }
    const out = (o) => o.gone || o.y < -40 || o.y > H + 40 || o.x < -40 || o.x > W + 40;
    this.shots = this.shots.filter((o) => !out(o));
    this.bullets = this.bullets.filter((o) => !out(o));
    this.enemies = this.enemies.filter((o) => !o.gone);
    this.drops = this.drops.filter((o) => !o.gone);
    if (this.bullets.length > 500) this.bullets.splice(0, this.bullets.length - 500);
  }
}

/** Slides towards the safest column, keeping below enemies. Used in the tests as a stand-in for a thumb. */
export function pilot(f) {
  let best = f.px, bestScore = -Infinity;
  for (let x = 20; x <= W - 20; x += 22) {
    let danger = 0;
    for (const b of f.bullets) {
      for (const look of [0.1, 0.25, 0.45]) {
        const bx = b.x + b.vx * look, by = b.y + b.vy * look;
        const d = dist(bx, by, x, f.py);
        if (d < 44) danger += (44 - d) * (1 / look);
      }
    }
    for (const e of f.enemies) if (e.y > f.py - 170 && Math.abs(e.x - x) < e.r + 30) danger += 500;
    const target = f.boss ? f.boss.x : f.enemies[0]?.x ?? f.px;
    const s = -danger * 4 - Math.abs(x - target) * 0.5 - Math.abs(x - f.px) * 0.25;
    if (s > bestScore) { bestScore = s; best = x; }
  }
  return best;
}

export function flyStage(stage, upgrades, seed = 1, limit = 240) {
  const f = new Flight(stage, upgrades, seed);
  for (let i = 0; i < limit * 60 && f.state === "playing"; i++) {
    f.step(1 / 60, pilot(f), H - 110);
    f.events.length = 0;
  }
  return f;
}
