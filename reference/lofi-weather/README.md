# Lo-Fi Weather

The weather in any city, right now, drawn as a pixel poster.

Type a city. The page fetches its current weather and draws it over a small isometric scene: rain pools in the
low spots and mirrors the sky, snow settles on roofs, windows light up after dark, fog rolls in, the wind
tears leaves off the trees. Eight cities have their own hand-drawn scene; every other place gets a shared town square.

Save the poster as an image or a six-second video, or embed it live on your own site.

**Live:** https://amirmushichge.github.io/lofi-weather/

## Run it

No build step and no dependencies. You need Node 18 or newer, only to serve the files.

```bash
node serve.mjs
```

Then open http://127.0.0.1:5302.

## Embed it

Open the page, choose a city and a format, then **Share → Copy embed code**. You get an iframe like this:

```html
<iframe src="https://amirmushichge.github.io/lofi-weather/?city=Tokyo&format=square&embed=1"
        title="Lo-Fi Weather: Tokyo" loading="lazy"
        style="width:100%;max-width:540px;aspect-ratio:1080/1080;border:0"></iframe>
```

An embed always shows the live sky.

## URL parameters

| Parameter | Values | |
|---|---|---|
| `city` | `Mostar`, `London`, `Reykjavík`, `New York`, `Tokyo`, `Dubai`, `Singapore`, `Sydney` | a hand-drawn city |
| `name`, `lat`, `lon`, `country` | e.g. `name=Paris&lat=48.85&lon=2.35` | any other place |
| `format` | `poster` (4:5), `square` (1:1), `story` (9:16), `banner` (16:9) | |
| `w` | `clear`, `heat`, `cloudy`, `overcast`, `fog`, `drizzle`, `rain`, `downpour`, `storm`, `snow`, `blizzard` | preview a sky |
| `t` | `dawn`, `noon`, `dusk`, `night` | preview a time of day |
| `embed` | `1` | the poster alone, without controls |

## How it is built

Everything is plain JavaScript drawn into a 360 × 280 canvas by a small software renderer. There is no WebGL and no library.

```
index.html            the poster and the controls
css/lofi-weather.css  poster layout for all four formats, and the controls
js/engine.js          the renderer: camera, depth buffer, colour ramps, shadows, edges
js/scene.js           the shared town square, props, and the city registry
js/cities/            one file per city, plus shared.js (common pieces) and _template.js
js/bake.js            draws the still scene once per city and season
js/weather.js         Open-Meteo data, the readout, city search
js/life.js            people, pigeons, smoke, rain, snow, wind
js/draw.js            every frame: weather grading, sky, clouds, lights, poster colours
js/share.js           formats, image and video export, embed code, links
js/main.js            start-up and the frame loop
```

## Add your city

1. Copy `js/cities/_template.js` to `js/cities/<yourcity>.js`. It is a working scene with comments on every field.
2. Add it to `index.html`, after the other cities and before `js/bake.js`.
3. Open `/?city=<Your City>&t=noon` and build.

The weather, the lights and the crowd come for free. Your job is the place. One rule: someone should recognise the
city in under two seconds, so build one landmark big and clear and keep the rest quiet.

## Data and credits

Weather and geocoding come from [Open-Meteo](https://open-meteo.com/) under CC BY 4.0. Keep the credit on the poster.
Open-Meteo's free API is for non-commercial use; a commercial project needs one of their paid plans.

Some landmarks, such as the Sydney Opera House, have rules about using their image commercially. Check those rules
before you sell a poster that shows one.

## Licence

[MIT](LICENSE), code and city scenes alike. Use it, change it, sell what you make with it; keep the copyright notice.
The weather data and real landmarks keep their own terms, above.

Made by [Amir Mushich](https://x.com/AmirMushich).
