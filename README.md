# Hand Tree

A generative fractal tree you control with your hands, in real time, through your webcam.

- **Right hand** controls tree complexity (1 finger gives a tiny sapling, 5 gives a full bushy crown).
- **Left hand** picks the colour theme: Spring, Autumn, Night, Sakura, or Rainbow.

The whole thing runs in the browser. No server, no cloud, no AI generating the art. The tree itself is just plain recursive geometry. The only smart piece is a hand tracking model finding 21 points on each hand. Everything else is regular p5.js drawing.

## Demo

Open [`index.html`](index.html) in a modern browser (Chrome, Edge, or Safari) and let it use your camera. That's it.

If the ML libraries don't load on your machine, [`index-simple.html`](index-simple.html) is a keyboard only fallback. Keys 1 to 5 set the tree complexity, no camera needed.

## Controls

| Hand | What it does | Mapping |
| --- | --- | --- |
| Right (in the right half of the camera) | Tree complexity | 1 simplest, 5 maximum |
| Left (in the left half of the camera) | Colour theme | 1 Spring, 2 Autumn, 3 Night, 4 Sakura, 5 Rainbow |
| Either hand in the middle strip | Ignored, so a hand drifting between zones doesn't trigger anything | n/a |

There's also a small manual fallback inside `index.html` if hand tracking gets unreliable. Press keys 1 to 5 to set the tree level by hand, or A to switch back to auto.

## How it works

1. The webcam feeds frames to **ml5.js's HandPose** model, running locally via TensorFlow.js.
2. For every detected hand the model returns 21 landmarks (knuckles, joints, fingertips, wrist).
3. The camera frame is split into a **left zone**, a **right zone**, and a small **dead zone** in the middle. Each hand is routed to a zone purely by its wrist x position.
4. Each zone has its own controller. They never share state. There is no "total fingers" calculation anywhere. Right-hand fingers can only affect the tree, and left-hand fingers can only affect the theme.
5. Finger counts are noisy, so each zone keeps a 30 frame rolling buffer and only commits a new value once at least 22 frames agree. This little majority-vote step is what stops the painting from flickering when your hand is held still.
6. The tree itself is drawn by a recursive function that takes the smoothed complexity (a number from 0 to 1) and uses it to decide recursion depth, branch angle, and length scaling.

## Tech stack

- [p5.js](https://p5js.org/) v1.9.4 for the drawing.
- [ml5.js](https://ml5js.org/) v1 for hand tracking. It wraps MediaPipe Hands and TensorFlow.js.
- Plain HTML, CSS, and a single `sketch.js` of about 660 lines. No build step, no bundler.

## File layout

```text
.
├── index.html            (main app: camera, hand tracking, tree)
├── sketch.js             (the p5.js sketch with all the controller logic)
├── index-simple.html     (keyboard only fallback page)
└── sketch-simple.js      (the keyboard only p5.js sketch)
```

## Tips

- Keep your thumb tucked into your palm when you don't mean it to count. The detection is forgiving but a fully splayed thumb will register as a raised finger.
- The HUD at the bottom of the screen shows the raw and confirmed finger counts for each zone, so when something looks wrong you can see exactly what the camera is reading.
- The corner preview labels each detected hand with its zone (L, R, or a dot for the dead zone) and a live raw count, like `R 3`. Useful for sanity checking.

## License

MIT.
