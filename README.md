# Hand Tree

A generative fractal tree you control with your hands, live, through your webcam.

- **Right hand** → tree complexity (1 finger = a tiny sapling, 5 = a full bushy crown)
- **Left hand** → colour theme (Spring, Autumn, Night, Sakura, or Rainbow)

Everything runs in the browser. No server, no cloud, no AI generating the art — the tree itself is just plain recursive geometry. The only "smart" piece is a hand-tracking model that finds 21 landmarks on each hand; the rest is straight p5.js drawing.

## Demo

Open [`index.html`](index.html) in a modern browser (Chrome / Edge / Safari) and grant camera access. That's it.

If your machine can't load the ML libraries for some reason, [`index-simple.html`](index-simple.html) is a keyboard-only fallback (keys 1–5 set the tree complexity, no camera needed).

## Controls

| Hand | What it does | Mapping |
| --- | --- | --- |
| Right (in the right half of the camera) | Tree complexity | 1 = simplest → 5 = maximum |
| Left  (in the left half of the camera)  | Colour theme    | 1 Spring · 2 Autumn · 3 Night · 4 Sakura · 5 Rainbow |
| Either hand drifting into the centre strip | _Ignored_ — prevents accidental zone-switches | — |

There's also a small **manual fallback** (keys `1`–`5`) in `index.html` if hand tracking is being uncooperative; press `A` to return to auto.

## How it works (short version)

1. The webcam feeds frames to **ml5.js's HandPose** model (running locally via TensorFlow.js).
2. For every detected hand, the model returns 21 landmarks (knuckles, joints, fingertips, wrist).
3. The screen is split into a **left zone**, a **right zone**, and a small **dead zone** in the middle. Each detected hand is routed to a zone purely by its wrist x-position.
4. Each zone has its own controller. They never share state — there is no "total fingers" calculation anywhere. Right-hand fingers can _only_ affect the tree, left-hand fingers can _only_ affect the theme.
5. Finger counts are noisy, so each zone keeps a 30-frame rolling buffer and only commits a new value when at least 22 frames agree (a small majority-vote debounce). This is what stops the painting from flickering when your hand is held still.
6. The tree is drawn by a recursive function that takes the smoothed complexity (0–1) as input and decides recursion depth, branch angle, and length scaling.

## Tech stack

- [p5.js](https://p5js.org/) v1.9.4 — drawing
- [ml5.js](https://ml5js.org/) v1 — HandPose model wrapper around MediaPipe Hands / TensorFlow.js
- Plain HTML, CSS, and one ~660-line `sketch.js`. No build step.

## File layout

```text
.
├── index.html            # main app (camera + hand tracking + tree)
├── sketch.js             # p5.js sketch with all the controller logic
├── index-simple.html     # keyboard-only fallback page
└── sketch-simple.js      # the keyboard-only p5.js sketch
```

## Tips

- Keep your thumb tucked against your palm when you don't mean it to count — the detection is forgiving but a fully splayed thumb will register as a finger.
- The HUD at the bottom of the screen shows the raw and confirmed finger counts for each zone, so when something looks wrong you can see exactly what the camera is reading.
- The corner preview labels each detected hand with its zone (`L`/`R`/`·`) and live raw count, e.g. `R 3`. Useful for sanity-checking.

## License

MIT.
