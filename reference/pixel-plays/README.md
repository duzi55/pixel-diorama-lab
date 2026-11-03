# Pixel Plays

Small browser games shown as isometric pixel dioramas. Every game is one page of plain JavaScript with its own software rasteriser: no build step, no dependencies, no sprites or image assets.

**Play: https://pixel-plays-ruby.vercel.app/**

Concept by [abhi](https://x.com/awwbhi2). Game by [AmirMushich](https://x.com/AmirMushich). Visual reference for the style: shawn.'s [Small plays](https://x.com/zzzzshawn/status/2111546123546661289); no assets or subjects were copied.

## Games
| Game | What you do | Input |
|------|-------------|-------|
| [Balote](balote/) | Bocce against a bot, first to 5 | Drag back and release; arrows + space |
| [Stari Most](stari-most/) | Five dives off the old bridge, flip and enter the water vertically | Hold and release |
| [Rooftop Laundry](laundry/) | Get the washing into the basket before the storm | Drag; space |
| [Tie-Break](tie-break/) | Clay-court tie-break against a bot, the moment you hit decides where the ball lands | Tap; space |
| [Mini Ramp](mini-ramp/) | 60 seconds on a skateboard ramp, pump for height and grab in the air | Hold and release; space |

## Run
Requires [Node.js](https://nodejs.org/); nothing to install.

```bash
node serve.mjs
```

Then open http://127.0.0.1:5300/. Any static file server works, and the site deploys as plain static files.

## Add a game
Create `<id>/index.html`, load `../shell.js`, call `PixelPlays.mount({ id, rules })`, set `window.PP_SCENE`, load `../engine.js`, then add the game to `GAMES` in `shell.js`. The page needs a `#mute` button. Put its background track at `<id>/<id>.mp3`.

- `shell.js` provides the game menu, the Rules popup, the credits and the background music.
- `engine.js` provides the camera, depth buffer, colour ramps, shadows, edges, figures, trees and wind as globals.
- A game supplies its own `groundColor`, `bake`, `update` and `draw`.

## Visual rules
- One small place floating on pure white, with no UI chrome around it.
- Low-resolution canvas (360x280), nearest-neighbour upscale, integer device-pixel scale.
- Fixed 30-degree orthographic camera; a ragged dithered edge dissolving into white.
- Real-time rasteriser with a depth buffer, four shade levels and Bayer dither.
- Long, hard cast shadows falling screen-right. One readable physical action per game.
- Hue-shifted colour ramps: shadows drift to violet, lights to warm yellow.
- Depth-buffer edges: darker where an object sits in front, a warm rim on upper-left edges.
- Large flat surfaces use closely spaced tones; wide steps make the dither read as a checkerboard.
- Characters stay sharp: flat bands with no dither, a dark silhouette on their own pixels, patterns at least 3px wide.
- Ambient motion only in plants: grass and leaves sway in whole pixels at 8 fps, and stop under `prefers-reduced-motion`.

## License
The code is under the [MIT License](LICENSE). The music is not: see [MUSIC.md](MUSIC.md).
