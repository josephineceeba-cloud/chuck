# CLUCKED: Cursed Domains — 3D browser fighter

A playable Three.js fighting game: cute procedural 3D chicken fighters, a best-of-three match against an AI opponent (Easy / Normal / Hard), combos, blocking, dodging, a projectile special, and Domain Expansions that fill the arena with effects.

## Run it

The game uses JavaScript modules, so serve it over HTTP instead of opening `index.html` directly.

- **Python:** `python3 -m http.server 8000` (or `npm start`), then open `http://localhost:8000`
- **VS Code:** install Live Server, right-click `index.html`, choose **Open with Live Server**

Three.js r169 is bundled in `vendor/three.module.js`, so the game works offline and does not depend on a CDN. (CDNs are only used as a fallback if the bundled file is missing.)

If the 3D engine can't start (for example WebGL is disabled), the Start button turns into **RETRY LOADING** and a message explains what went wrong.

## Controls

| Key | Action |
| --- | --- |
| A / D | Move (hold Shift to sprint) |
| W | Jump |
| S | Block (chip damage only, no stun) |
| J | Light attack (peck) |
| K | Heavy attack |
| L | Special (projectile) |
| Space | Dodge (brief invulnerability) |
| Q | Domain Expansion (needs a full purple meter) |
| P / Esc | Pause |
| M | Mute |

Touch devices get on-screen buttons automatically.

## How a match works

- Best of three rounds, 99 seconds per round. Lower HP wins when time runs out.
- Landing and blocking hits fills the Domain meter. At 100% press **Q** to expand your domain: for a few seconds your hits do extra damage, your opponent is slowed, can't charge their meter, and takes unblockable damage over time.
- Combos chain light and heavy attacks, with damage scaling so they can't be endless.
- The pause menu opens automatically if you switch tabs or windows.

## Tests

`npm test` runs the rules engine (`src/game.js`) headlessly in Node: combat, blocking, combos, dodges, domains, round flow and AI-vs-bot matches at every difficulty.

## Deploy to Vercel

Static site, no build step: import the repo in Vercel with Framework Preset **None**, empty Build Command, and Output Directory `.`.

## Project layout

- `src/game.js` — pure game rules and AI (no DOM, no Three.js)
- `src/view.js` — Three.js scene, fighters, effects, camera
- `src/main.js` — wiring: loading, menus, HUD, game loop
- `src/input.js`, `src/audio.js` — keyboard/touch input and synthesized sound
- `vendor/three.module.js` — bundled Three.js r169 (MIT)
