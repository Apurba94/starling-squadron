# Starling Squadron

A vertical shooter designed around one thumb. Drag anywhere and your ship moves with you, so your thumb never covers it. The guns fire by
themselves, and only the bright core of your ship can be hit, which lets you slip through gaps that look far too small.

**[Play it now](https://apurba94.github.io/starling-squadron/)** in your phone's browser, then use "Add to Home Screen" to install it. After
the first visit it works offline.

* 8 stages of generated enemy waves, each ending with a boss.
* Bosses that change bullet patterns as they weaken: fans, spirals, aimed bursts and walls with a gap.
* Shield segments, gun power-ups and a brief moment of safety after each hit.
* A hangar of permanent upgrades paid for with the coins you collect.

No ads, no accounts, no tracking and no network use after the first load.

## Run from source

```bash
npx serve .
npm test
```

Plain JavaScript with no dependencies. `src/logic.js` holds the rules, and `src/main.js` holds the screens.

## How it is tested

The tests cover damage, shields, pickups and each boss pattern, and check that a bullet wall always leaves a gap. A simple pilot then plays
real stages: it has to clear stage one without upgrades and every stage with full upgrades, and must fail the last stage with none. That
shows that the upgrade curve works. It does not show how the game feels under a real thumb.

## License

MIT
