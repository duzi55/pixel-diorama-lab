'use strict';
/* ---------- Template: copy this file to add your own city ----------
 *
 * 1. Copy it to js/cities/<yourcity>.js and rename the TPL_ prefixes to your own (e.g. LB_ for Lisbon).
 * 2. Add <script src="js/cities/<yourcity>.js"></script> to index.html, after the other cities and before js/bake.js.
 * 3. Open http://127.0.0.1:5302/?city=<Your City>&t=noon and draw.
 *
 * The scene is a small island seen from above at an angle. World units: x runs left-right, y runs back-front
 * (negative y is further away), z is height. The island spans roughly x -12..12 and y -8..8.
 * Everything the weather does (rain, puddles, snow on roofs, fog, night, lit windows, lamp pools) comes for free:
 * you only build the place. One rule for a good city: someone should recognise it in under two seconds,
 * so build one landmark big and clear, and keep the rest quiet.
 *
 * Useful helpers (see js/cities/shared.js and js/scene.js):
 *   onIsland, islandInside   the island's outline
 *   slabs, asphalt           paving and road surfaces
 *   block(x0, y0, x1, y1, h, color, options)   a building with windows that light up at night
 *   box, sphere, capsule, cylinder, plot        raw shapes from js/engine.js
 *   streetLamp, growSeasonTree, growPalm        lamps and trees
 *   vehicle + traffic                          cars that drive along a lane
 */
const TPL = { X: 12, Y: 7.4 }; // half-width and half-depth of the island

// the ground: return a colour for every point on the island, or 0 for empty sky
function templateGround(x, y, ix, iy, i) {
  if (!onIsland(x, y, ix, iy, TPL.X, TPL.Y)) return 0;
  if (y > -1 && y < 1.8) return asphalt(x, y, ix, iy); // a street across the middle
  if (y > 4.6) { kinds[i] = KIND_GRASS; return rgb(...GRASS[clamp(Math.floor((noise(x * .9, y * .9) + (hash(ix, iy) - .5) * .5) * 4.2), 0, 3)]); }
  return slabs(x, y, ix, iy, [196, 186, 170], 1.1);
}

// the still scene: buildings, the landmark, lamps and trees. It is drawn once, then the weather plays over it.
function templateBuild() {
  // a row of buildings along the back of the street; each id range gives its windows their own lights
  const row = [[-11, -7, 4.2, [214, 186, 150]], [-6.8, -3, 5.4, [196, 112, 88]], [-2.8, 1.4, 3.8, [226, 220, 206]], [1.6, 5.6, 4.6, [150, 168, 186]]];
  row.forEach(([x0, x1, h, color], k) => block(x0, -6.4, x1, -2, h, color, { id: 40 + k * 12, seed: 900 + k }));
  // the landmark goes here: make it the tallest, clearest thing in the picture
  box(7.4, -6.4, 0, 10.4, -3.4, 7.5, [232, 226, 212], 990);
  for (const x of [-5, 4.4]) streetLamp({ x, y: 2.3, z: 3.3 }, 0);
  growSeasonTree(-2, 5.8, .6, look.season, 980);
}

// moving things drawn every frame: here one tram going back and forth along the street
const TPL_TRAFFIC = [{ y: .4, speed: 2.2, len: 4, offset: 0, draw: (x, y) => vehicle(x, y, 4, 1.4, 2, [236, 196, 70]) }];

const TEMPLATE_LAYOUT = {
  scale: 10,           // pixels per world unit: smaller fits a bigger place
  lift: 40,            // moves the island up the poster
  ground: templateGround, build: templateBuild, extra: () => traffic(TPL_TRAFFIC, TPL.X),
  lamps: [{ x: -5, y: 2.3, z: 3.3, base: 0 }, { x: 4.4, y: 2.3, z: 3.3, base: 0 }], // where the light pools fall at night
  cafe: null, chimney: null,               // optional: a lit café window and a smoking chimney
  snowman: { x: 1, y: 5.6 },               // built when snow lies on the ground
  kid: { x: -6, y: 3 }, sitter: null, cup: null,
  pigeons: [[2, 5.2, 0], [2.6, 5.6, 1.7]],
  tree: { x: -2, y: 5.8 },                 // where the wind tears the leaves from
  inside: islandInside(TPL.X, TPL.Y),      // where rain and snow land
  // the crowd walks these lines; share is the part of the crowd on each one
  paths: [{ pts: [[-11, 2.8], [11, 2.8]], lanes: 1.2, share: .7 }, { pts: [[-9, 5.2], [9, 5.2]], lanes: 1, share: .3 }],
};

// name and country show on the poster; native is the small name top right; at is [latitude, longitude].
// Any searched place within 60 km of these coordinates gets this scene.
registerCity('template', { name: 'Template', country: 'Nowhere', at: [0, 0], native: 'Your city', layout: TEMPLATE_LAYOUT });
