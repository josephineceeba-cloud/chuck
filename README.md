# CLUCKED: Cursed Domains — 3D browser prototype

A small playable Three.js prototype with cute procedural 3D chicken fighters, an arena, basic attacks, AI opponent, special attack, dodge, and Domain Expansion effects.

## Run it
Because the game uses JavaScript modules, run it through a local server instead of opening `index.html` directly.

### Option A: Python

1. Install Python 3 if needed.
2. Open a terminal in this folder.
3. Run: `python -m http.server 8000`
4. Open `http://localhost:8000` in your browser.

### Option B: VS Code
Install the Live Server extension, right-click `index.html`, and choose **Open with Live Server**.

## Controls

- A / D: Move
- W: Jump
- J: Light attack
- K: Heavy attack
- L: Special attack
- Space: Dodge
- Q: Domain Expansion (requires 100% energy)
- Shift: Sprint
- Restart button: reset the match

## Deploy to Vercel

This app is a static site, so it can be deployed on Vercel without a build step.

1. Push this folder to a GitHub repository.
2. In Vercel, click New Project and import the repository.
3. Keep the default settings:
   - Framework Preset: None
   - Build Command: leave blank
   - Output Directory: .
4. Deploy.

Vercel will serve the root HTML file and static assets automatically.

## Notes

- Three.js is loaded from jsDelivr, so an internet connection is required.
- This is an initial playable prototype, not a finished commercial game.
- The current prototype uses procedural models and simplified combat. Advanced rigged animations, true domain clashes, character selection, and local two-player controls are not yet implemented.
