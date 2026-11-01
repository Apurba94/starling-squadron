// Starling Squadron screens: relative thumb steering, the stage view and the hangar.
import { Game, LevelSelect, Result, Scene, Title, backdrop, bar, compose, dot, panel, text } from "./gamekit.js";
import { Flight, H, SHIPS, STAGES, UPGRADES, W, upgradeCost } from "./logic.js";

export const game = new Game({ id: "starling-squadron", title: "Starling Squadron", theme: { accent: "#60a5fa", onAccent: "#04162f", bg: "#050a18", bg2: "#10224a", panel: "#16294f" }, defaults: { coins: 0, cleared: 0, best: [], up: { guns: 0, armor: 0, magnet: 0, wing: 0 } } });
const data = game.store.data;

const HELP = [
  ["Flying", "Drag anywhere on the screen and your ship moves with your thumb, so your thumb never covers it. Your guns fire by themselves."],
  ["Small target", "Only the bright dot at the centre of your ship can be hit, so you can slip through gaps that look too small."],
  ["Shields", "Each hit removes a shield segment and clears nearby bullets. Blue drops restore shields, and gold ones boost your guns until you are hit."],
  ["The hangar", "Coins you collect buy upgrades that last forever. If a boss stops you, come back stronger."],
];

function ship(c, x, y, color, s = 1) {
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x, y - 18 * s);
  c.lineTo(x + 16 * s, y + 13 * s);
  c.lineTo(x + 5 * s, y + 7 * s);
  c.lineTo(x, y + 12 * s);
  c.lineTo(x - 5 * s, y + 7 * s);
  c.lineTo(x - 16 * s, y + 13 * s);
  c.closePath();
  c.fill();
}

function art(c, g, t) {
  backdrop(c, g, t * 8);
  for (let i = 0; i < 5; i++) {
    const row = Math.abs(i - 2);
    ship(c, 195 + (i - 2) * 46, 340 + row * 34 + Math.sin(t * 2 + i) * 4, i === 2 ? "#fff" : "#60a5fa", i === 2 ? 1.2 : 0.8);
  }
}

const title = () => new Title(game, { tag: `${data.coins} coins`, art, help: HELP, play: () => game.go(stages()), buttons: [["Hangar", () => game.go(new Hangar(game))]] });
const stages = () => new LevelSelect(game, {
  title: "Stages",
  count: STAGES,
  unlocked: (i) => i <= data.cleared,
  stars: (i) => (i < data.cleared ? 3 : 0),
  pick: (i) => game.go(new Stage(game, i)),
  back: () => game.go(title()),
});

class Hangar extends Scene {
  enter() { this.layout(); }
  layout() {
    const g = this.g;
    this.ui.clear();
    Object.keys(UPGRADES).forEach((id, i) => {
      const u = UPGRADES[id], lvl = data.up[id] || 0, cost = upgradeCost(id, lvl);
      const b = this.ui.button(24, 124 + i * 96, 342, 86, u.name, () => {
        if (lvl >= u.max || data.coins < cost) { g.sound.play("bad"); return; }
        data.coins -= cost;
        data.up[id] = lvl + 1;
        g.store.save();
        g.sound.play("power");
        this.layout();
      }, {
        draw: (c) => {
          text(c, u.name, b.x + 16, b.y + 22, { size: 17, align: "left", weight: 800 });
          text(c, u.text, b.x + 16, b.y + 44, { size: 12, align: "left", color: g.theme.muted });
          for (let k = 0; k < u.max; k++) panel(c, b.x + 16 + k * 34, b.y + 60, 28, 8, k < lvl ? g.theme.accent : "rgba(255,255,255,.12)", 4);
          text(c, lvl >= u.max ? "Maxed" : `${cost} coins`, b.x + b.w - 14, b.y + 24, { size: 14, align: "right", color: data.coins >= cost ? g.theme.gold : g.theme.muted, weight: 700 });
        },
      });
    });
    this.ui.button(55, g.H - 70, 280, 50, "Back", () => g.go(title()));
  }
  draw(c) {
    const g = this.g;
    backdrop(c, g, this.t * 4);
    text(c, "Hangar", g.W / 2, 60, { size: 30, weight: 800 });
    text(c, `${data.coins} coins`, g.W / 2, 96, { size: 17, color: g.theme.gold, weight: 700 });
  }
}

class Stage extends Scene {
  constructor(g, index) { super(g); this.index = index; }
  /** The game field is 720 tall; shorter or taller phones scale it to fit. */
  get k() { return this.g.H / H; }
  enter() {
    const g = this.g;
    this.f = new Flight(this.index, data.up, Date.now() % 100000);
    this.tx = this.f.px;
    this.ty = this.f.py;
    this.drag = null;
    this.paused = false;
    g.sound.music(compose(this.index + 71, 124, 110));
    this.pause = this.ui.button(g.W - 66, 8, 58, 32, "Pause", () => this.toggle(), { size: 12 });
    this.quit = this.ui.button(95, 320, 200, 50, "Abandon", () => { g.sound.stopMusic(); g.go(stages()); }, { hidden: true, style: "danger" });
  }
  toggle() { this.paused = !this.paused; this.pause.label = this.paused ? "Play" : "Pause"; this.quit.hidden = !this.paused; }
  hidden() { if (!this.paused) this.toggle(); }
  down(p) { this.drag = { x: p.x, y: p.y }; }
  move(p) {
    if (!this.drag) return;
    const speed = 1.35;
    this.tx += (p.x - this.drag.x) * speed;
    this.ty += ((p.y - this.drag.y) * speed) / this.k;
    this.tx = Math.max(14, Math.min(W - 14, this.tx));
    this.ty = Math.max(40, Math.min(H - 24, this.ty));
    this.drag = { x: p.x, y: p.y };
  }
  up() { this.drag = null; }
  update(dt) {
    if (this.paused) return;
    const f = this.f, g = this.g, k = this.k;
    f.step(dt, this.tx, this.ty);
    for (const e of f.events) {
      if (e.kind === "kill") { g.fx.burst(e.x, e.y * k, e.color, e.big ? 26 : 12, 150); g.sound.play("hit"); }
      if (e.kind === "hurt") { g.shake(0.3); g.buzz(60); g.sound.play("bad"); }
      if (e.kind === "boss") { g.sound.play("power"); this.banner = { text: e.name, t: 2.4 }; }
      if (e.kind === "pickup") { g.sound.play(e.type === "coin" ? "coin" : "ok"); if (e.type === "power") this.banner = { text: "Guns up", t: 0.9 }; }
      if (e.kind === "shot" && this.t % 0.42 < dt) g.sound.tone(760, 0.04, { type: "square", vol: 0.025 });
      if (e.kind === "dead" || e.kind === "bossDown") { g.fx.burst(e.x, e.y * k, "#fbbf24", 60, 240, 1); g.sound.play("boom"); g.shake(0.5); }
    }
    f.events.length = 0;
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    if (f.state !== "playing") this.finish();
  }
  finish() {
    const g = this.g, f = this.f, i = this.index;
    g.sound.stopMusic();
    data.coins += f.coins;
    if (f.state === "won") data.cleared = Math.max(data.cleared, i + 1);
    if (f.score > (data.best[i] || 0)) data.best[i] = f.score;
    g.store.save();
    const won = f.state === "won";
    const buttons = [];
    if (won && i + 1 < STAGES) buttons.push(["Next stage", () => g.go(new Stage(g, i + 1)), "primary"]);
    buttons.push(["Fly again", () => g.go(new Stage(g, i)), won ? "ghost" : "primary"], ["Hangar", () => g.go(new Hangar(g))], ["Menu", () => g.go(title())]);
    g.go(new Result(g, { title: won ? (i === STAGES - 1 ? "Squadron home" : "Stage clear") : "Shot down", good: won, lines: [`Score ${f.score}`, `+${f.coins} coins, ${data.coins} in total`, `${f.kills} enemies destroyed`], buttons }));
  }
  draw(c) {
    const g = this.g, f = this.f, k = this.k;
    backdrop(c, g, this.t * 24);
    c.save();
    c.scale(1, k);
    for (const p of f.drops) dot(c, p.x, p.y, p.kind === "coin" ? 5 : 9, p.kind === "coin" ? "#fbbf24" : p.kind === "power" ? "#fb923c" : "#38bdf8");
    for (const e of f.enemies) {
      const d = SHIPS[e.kind];
      c.save();
      c.translate(e.x, e.y);
      c.rotate(Math.PI);
      ship(c, 0, 0, d.color, e.r / 15);
      c.restore();
      if (e.hp < e.max) bar(c, e.x - 15, e.y - e.r - 8, 30, 3, e.hp / e.max, "#4ade80", "rgba(0,0,0,.5)");
    }
    const b = f.boss;
    if (b) {
      c.save();
      c.translate(b.x, b.y);
      c.rotate(Math.PI);
      ship(c, 0, 0, b.color, 3);
      c.restore();
    }
    c.fillStyle = "#bfdbfe";
    for (const s of f.shots) c.fillRect(s.x - 1.5, s.y - 8, 3, 14);
    for (const q of f.bullets) { dot(c, q.x, q.y, q.r + 1, "#ef4444"); dot(c, q.x, q.y, q.r - 2, "#fee2e2"); }
    if (f.safe <= 0 || Math.floor(this.t * 12) % 2) {
      ship(c, f.px, f.py, "#e0f2fe");
      for (let i = 0; i < (f.up.wing || 0); i++) { const s = i % 2 ? 1 : -1; ship(c, f.px + s * (34 + i * 8), f.py + 8, "#60a5fa", 0.5); }
      dot(c, f.px, f.py, 3.5, "#ef4444");
    }
    c.restore();
    text(c, String(f.score), 14, 22, { size: 18, align: "left", weight: 800 });
    for (let i = 0; i < f.maxShield; i++) panel(c, 14 + i * 22, 38, 18, 7, i < f.shield ? g.theme.accent : "rgba(255,255,255,.14)", 3);
    if (b) {
      text(c, b.name, g.W / 2, 16, { size: 12, weight: 700 });
      bar(c, 90, 26, 210, 8, b.hp / b.max, b.color);
    } else {
      text(c, `Stage ${this.index + 1}`, g.W / 2, 16, { size: 12, color: g.theme.muted });
      bar(c, 120, 26, 150, 5, f.t / f.bossAt, g.theme.accent);
    }
    if (this.banner) text(c, this.banner.text, g.W / 2, g.H * 0.34, { size: 26, weight: 900, color: g.theme.gold });
    if (this.t < 3 && !this.drag) text(c, "Drag anywhere to fly", g.W / 2, g.H * 0.6, { size: 16, color: g.theme.ink });
    if (this.paused) {
      c.fillStyle = "rgba(0,0,0,.6)";
      c.fillRect(0, 0, g.W, g.H);
      text(c, "Paused", g.W / 2, 260, { size: 32, weight: 800 });
    }
  }
}

game.start(title());
