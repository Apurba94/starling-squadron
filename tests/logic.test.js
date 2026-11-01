import assert from "node:assert/strict";
import test from "node:test";
import { BOSSES, Flight, H, SHIPS, STAGES, UPGRADES, W, flyStage, makeWaves, pilot, upgradeCost } from "../src/logic.js";

const idle = (f, s = 1, x = f.px, y = f.py) => { for (let i = 0; i < s * 60 && f.state === "playing"; i++) f.step(1 / 60, x, y); return f; };
const empty = (stage = 0, up = {}) => { const f = new Flight(stage, up); f.waves = []; f.bossAt = 1e9; return f; };

test("each stage has its own repeatable waves, all inside the screen", () => {
  assert.deepEqual(makeWaves(2), makeWaves(2));
  for (let s = 0; s < STAGES; s++) {
    const { list, end } = makeWaves(s);
    assert.ok(list.length > 20, `stage ${s}`);
    assert.ok(end > 30 && end < 90, `stage ${s} lasts ${end}`);
    for (let i = 0; i < list.length; i++) {
      assert.ok(SHIPS[list[i].kind]);
      assert.ok(list[i].x > 0 && list[i].x < W);
      if (i) assert.ok(list[i].t >= list[i - 1].t);
    }
  }
  assert.equal(BOSSES.length, STAGES);
});

test("later stages have tougher kinds of enemy", () => {
  const kinds = (s) => new Set(makeWaves(s).list.map((w) => w.kind));
  assert.equal(kinds(0).has("tank"), false);
  assert.ok(kinds(5).has("tank") || kinds(5).has("spinner"));
});

test("the ship follows the thumb at a limited speed and stays on screen", () => {
  const f = empty();
  f.step(1 / 60, 0, 0);
  assert.ok(Math.hypot(f.px - W / 2, f.py - (H - 110)) <= 640 / 60 + 1e-6);
  idle(f, 2, -500, 9999);
  assert.equal(f.px, 14);
  assert.equal(f.py, H - 24);
});

test("guns fire on their own, and upgrades add bullets", () => {
  const a = empty(), b = empty(0, { guns: 4, wing: 2 });
  a.step(1 / 60, a.px, a.py);
  b.step(1 / 60, b.px, b.py);
  assert.ok(a.shots.length >= 1);
  assert.ok(b.shots.length >= a.shots.length + 3);
  assert.ok(b.shots[0].dmg > a.shots[0].dmg);
});

test("shots destroy enemies, which score and drop something", () => {
  const f = empty();
  f.spawn({ kind: "dart", x: f.px, phase: 0 });
  f.enemies[0].y = f.py - 200;
  idle(f, 0.8);
  assert.equal(f.enemies.length, 0);
  assert.equal(f.kills, 1);
  assert.equal(f.score >= SHIPS.dart.score, true);
  assert.equal(f.drops.length + f.coins > 0, true);
});

test("a hit costs a shield, gives a moment of safety and clears bullets nearby", () => {
  const f = empty();
  f.bullets.push({ x: f.px, y: f.py, vx: 0, vy: 0, r: 5 }, { x: f.px + 30, y: f.py, vx: 0, vy: 0, r: 5 });
  f.step(1 / 60, f.px, f.py);
  assert.equal(f.shield, f.maxShield - 1);
  assert.ok(f.safe > 0);
  assert.equal(f.bullets.length, 0);
  f.hitPlayer();
  assert.equal(f.shield, f.maxShield - 1);
});

test("a bullet beside the ship does not hit: only the core counts", () => {
  const f = empty();
  f.bullets.push({ x: f.px + 14, y: f.py, vx: 0, vy: 0, r: 5 });
  f.step(1 / 60, f.px, f.py);
  assert.equal(f.shield, f.maxShield);
});

test("losing all shields ends the flight", () => {
  const f = empty();
  f.shield = 1;
  f.hitPlayer();
  assert.equal(f.state, "lost");
});

test("armour adds shield segments, and hits take away power", () => {
  assert.equal(empty(0, { armor: 2 }).maxShield, 5);
  const f = empty();
  f.power = 2;
  f.hitPlayer();
  assert.equal(f.power, 1);
});

test("the magnet pulls coins from further away", () => {
  const gather = (magnet) => {
    const f = empty(0, { magnet });
    f.drops.push({ x: f.px + 150, y: f.py, kind: "coin" });
    idle(f, 1.2);
    return f.coins;
  };
  assert.equal(gather(0), 0);
  assert.ok(gather(3) > 0);
});

test("shields and power are capped", () => {
  const f = empty();
  for (let i = 0; i < 8; i++) f.drops.push({ x: f.px, y: f.py, kind: "power" }, { x: f.px, y: f.py, kind: "shield" });
  idle(f, 0.2);
  assert.equal(f.power, 4);
  assert.equal(f.shield, f.maxShield);
});

test("each boss pattern fires, and bosses change pattern as they weaken", () => {
  const f = empty(7);
  f.startBoss();
  const b = f.boss;
  b.y = 130;
  for (const [hp, mode] of [[1, "fan"], [0.7, "spiral"], [0.4, "walls"], [0.1, "aimed"]]) {
    b.hp = b.max * hp;
    f.bullets.length = 0;
    f.bossFire(b);
    assert.equal(b.mode, mode);
    assert.ok(f.bullets.length > 0, mode);
    for (const q of f.bullets) assert.ok(Number.isFinite(q.vx) && Number.isFinite(q.vy));
  }
});

test("a wall of bullets always leaves a way through", () => {
  const f = empty(3);
  f.startBoss();
  for (let i = 0; i < 100; i++) {
    f.bullets.length = 0;
    f.boss.mode = "walls";
    f.boss.phases = ["walls"];
    f.bossFire(f.boss);
    const xs = f.bullets.map((b) => b.x).sort((a, b) => a - b);
    const gaps = xs.slice(1).map((x, k) => x - xs[k]);
    assert.ok(Math.max(...gaps, xs[0], W - xs.at(-1)) > 90);
  }
});

test("destroying the boss clears the stage and pays out", () => {
  const f = empty(1);
  f.startBoss();
  f.boss.y = 130;
  f.boss.hp = 1;
  f.boss.cool = 99;
  f.shots.push({ x: f.boss.x, y: f.boss.y, vx: 0, vy: 0, dmg: 5 });
  f.step(1 / 60, f.px, f.py);
  assert.equal(f.state, "won");
  assert.ok(f.coins >= 40);
});

test("enemies that stay too long leave the screen, so a stage cannot jam", () => {
  const f = empty();
  f.spawn({ kind: "gunner", x: 40, phase: 0 });
  f.px = 300; f.py = 650;
  f.enemies[0].cool = 1e9;
  idle(f, 30, 300, 650);
  assert.equal(f.enemies.length, 0);
});

test("the pilot steers away from danger", () => {
  const f = empty();
  f.px = 195;
  for (let i = 0; i < 12; i++) f.bullets.push({ x: 170 + i * 5, y: f.py - 40, vx: 0, vy: 200, r: 5 });
  const x = pilot(f);
  assert.ok(Math.abs(x - 195) > 30);
});

test("upgrade costs rise and every upgrade has a limit", () => {
  for (const [id, u] of Object.entries(UPGRADES)) {
    assert.ok(upgradeCost(id, 1) > upgradeCost(id, 0));
    assert.ok(u.max >= 2);
  }
});

test("a plain pilot can clear stage one without upgrades", () => {
  let wins = 0;
  for (let s = 1; s <= 6; s++) if (flyStage(0, {}, s).state === "won") wins++;
  assert.ok(wins >= 2, `won ${wins} of 6`);
});

test("with full upgrades every stage can be cleared, and without them the last cannot", () => {
  const full = { guns: 5, armor: 4, magnet: 3, wing: 2 };
  for (let s = 0; s < STAGES; s++) {
    let won = false;
    for (let seed = 1; seed <= 6 && !won; seed++) won = flyStage(s, full, seed).state === "won";
    assert.ok(won, `stage ${s + 1}`);
  }
  let bare = 0;
  for (let seed = 1; seed <= 6; seed++) if (flyStage(STAGES - 1, {}, seed).state === "won") bare++;
  assert.equal(bare, 0);
});
