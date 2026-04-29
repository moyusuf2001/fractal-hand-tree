// =============================================================================
// Hand Tree — Two Independent Zone Controllers (clean rewrite)
//
//   LEFT  ZONE CONTROLLER  →  THEME ONLY
//   RIGHT ZONE CONTROLLER  →  TREE  ONLY
//
// The two controllers DO NOT share state. Their finger counts are NEVER added,
// summed, combined, averaged, or otherwise mixed. There is no `totalFingers`,
// `combinedFingerCount`, `fingerCountSum`, or `left + right` anywhere in this
// file. Each zone produces its own raw and confirmed values, and those values
// flow into exactly one downstream consumer.
//
// Zone assignment (palmCenterX is the wrist x in video pixel coords):
//     palmCenterX  <  video.width * 0.45     →   LEFT_ZONE
//     palmCenterX  >  video.width * 0.55     →   RIGHT_ZONE
//     otherwise                              →   CENTER_DEAD_ZONE  (ignored)
//
// `flipHorizontal: true` is set on ml5.handPose, so the user's right hand
// physically appears in the right half of the video frame.
// =============================================================================


// ─── Hand tracking ────────────────────────────────────────────────────────────
let handPose;
let video;
let hands = [];
let didLogKeypointShape = false;


// ─── Zone thresholds (fractions of video.width) ───────────────────────────────
const LEFT_ZONE_MAX_FRAC  = 0.45;   // palmX < this  → LEFT_ZONE
const RIGHT_ZONE_MIN_FRAC = 0.55;   // palmX > this  → RIGHT_ZONE
                                    // between them → CENTER_DEAD_ZONE (ignored)


// ─── LEFT ZONE CONTROLLER (theme only) ────────────────────────────────────────
let rawLeftZoneFingerCount       = 0;   // single-frame reading, HUD only
let confirmedLeftZoneFingerCount = 0;   // 0 = "no left hand"   (→ Spring)
let leftZoneVoteHistory          = [];
let leftZoneAbsentFrames         = 0;
let leftZonePalmXDebug           = -1;  // HUD only

const LEFT_HIST_SIZE   = 30;
const LEFT_NEEDED      = 22;     // 22 of 30 frames must agree (≈73%) — strict
const ABSENT_RESET_FR  = 90;     // ~1.5 s before clearing history


// ─── RIGHT ZONE CONTROLLER (tree only) ────────────────────────────────────────
let rawRightZoneFingerCount       = 0;
let confirmedRightZoneFingerCount = 1;   // default tree complexity
let rightZoneVoteHistory          = [];
let rightZoneAbsentFrames         = 0;
let rightZonePalmXDebug           = -1;

const RIGHT_HIST_SIZE = 32;
const RIGHT_NEEDED    = 21;      // 21 of 32 frames must agree (stricter)


// ─── Visual smoothing (tree shape only — never used for theme) ────────────────
let smoothedTreeComplexity = 0;
let growth                 = 0;


// ─── Theme palette ────────────────────────────────────────────────────────────
const THEMES = [
  // 0  unused (so index 1 = Spring without off-by-one)
  { bg:[210,38,9],  trunk:[130,28,38], tip:[38,72,96],  leaf:[90,55,92,50],  light:false },
  // 1  Spring
  { bg:[185,22,92], trunk:[105,55,30], tip:[88,65,78],  leaf:[100,62,72,60], light:true  },
  // 2  Autumn
  { bg:[22,32,10],  trunk:[26,62,42],  tip:[12,80,88],  leaf:[15,82,88,60],  light:false },
  // 3  Night
  { bg:[245,55,5],  trunk:[210,45,25], tip:[188,72,90], leaf:[185,68,88,55], light:false },
  // 4  Sakura
  { bg:[330,14,97], trunk:[340,32,48], tip:[352,55,92], leaf:[350,48,95,65], light:true  },
  // 5  Rainbow
  { bg:[260,42,7],  trunk:[0,0,0],     tip:[0,0,0],     leaf:[0,0,0,0],      light:false },
];
const THEME_NAMES = ['—', 'Spring', 'Autumn', 'Night', 'Sakura', 'Rainbow'];


// =============================================================================
// PRELOAD / SETUP
// =============================================================================
function preload() {
  if (typeof ml5 === 'undefined' || typeof ml5.handPose !== 'function') return;
  handPose = ml5.handPose({ maxHands: 2, flipHorizontal: true });
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);
  textFont('Helvetica Neue, Arial, sans-serif');

  video = createCapture(VIDEO);
  video.size(320, 240);
  video.hide();

  setStatus('Starting camera…');

  if (!handPose) {
    setStatus('ml5 HandPose unavailable — use Manual mode or index-simple.html.');
    return;
  }

  handPose.ready
    .then(() => {
      setStatus('LEFT zone = theme   ·   RIGHT zone = tree   (1–5 fingers each)');
      handPose.detectStart(video, gotHands);
    })
    .catch((err) => {
      console.error(err);
      setStatus('Model load failed — use Manual / keys 1–5.');
    });
}

function gotHands(results) {
  if (Array.isArray(results))                       hands = results;
  else if (results && Array.isArray(results.hands)) hands = results.hands;
  else                                              hands = [];
}


// =============================================================================
// DRAW
// =============================================================================
function draw() {
  // 1. Pick which hand (if any) belongs to each zone, then run each zone
  //    controller in complete isolation. The two functions never share data.
  const { leftZoneHand, rightZoneHand } = assignHandsToZones();

  const mode = window.__handTreeMode || 'auto';

  // RIGHT ZONE CONTROLLER → tree only
  if (mode === 'manual') {
    confirmedRightZoneFingerCount = constrain(window.__manualLevel || 1, 1, 5);
    rawRightZoneFingerCount       = confirmedRightZoneFingerCount;
  } else {
    updateRightZoneController(rightZoneHand);
  }

  // LEFT ZONE CONTROLLER → theme only (runs even in manual mode)
  updateLeftZoneController(leftZoneHand);

  // 2. Derived view values (single source of truth for each)
  const themeIndex      = themeIndexFromLeftZone();             // ← LEFT only
  const treeComplexity  = confirmedRightZoneFingerCount;        // ← RIGHT only

  // 3. Background & tree drawing
  const th = THEMES[themeIndex];
  background(th.bg[0], th.bg[1], th.bg[2]);

  smoothedTreeComplexity = lerp(
    smoothedTreeComplexity,
    map(constrain(treeComplexity, 1, 5), 1, 5, 0, 1),
    0.07
  );
  growth = lerp(growth, 1, 0.025);

  push();
  translate(width / 2, height - 28);
  rotate(sin(frameCount * 0.018) * 0.04);
  drawBranch(min(width, height) * 0.2 * growth, 0, smoothedTreeComplexity, themeIndex);
  pop();

  // 4. Diagnostics
  drawVideoPreview();
  drawOnScreenHelp(mode, themeIndex, treeComplexity);
  maybeLogState(themeIndex, treeComplexity);
}


// =============================================================================
// ZONE ASSIGNMENT
// For each detected hand, classify by palmCenterX. Returns at most one hand
// per zone (the one closest to that zone's outer edge if there are two).
// Hands in the centre dead zone are dropped — they update no controller.
// =============================================================================
function assignHandsToZones() {
  const leftMax  = video.width * LEFT_ZONE_MAX_FRAC;
  const rightMin = video.width * RIGHT_ZONE_MIN_FRAC;

  let leftZoneHand  = null, leftBestX  =  Infinity;  // pick smallest x in left zone
  let rightZoneHand = null, rightBestX = -Infinity;  // pick largest  x in right zone

  for (const hand of hands) {
    const palmCenterX = getPalmCenterX(hand);
    if (palmCenterX === null) continue;

    if (palmCenterX < leftMax) {
      if (palmCenterX < leftBestX) { leftZoneHand = hand; leftBestX = palmCenterX; }
    } else if (palmCenterX > rightMin) {
      if (palmCenterX > rightBestX) { rightZoneHand = hand; rightBestX = palmCenterX; }
    }
    // else: CENTER_DEAD_ZONE → ignored entirely (no controller update)
  }

  leftZonePalmXDebug  = leftZoneHand  ? floor(leftBestX)  : -1;
  rightZonePalmXDebug = rightZoneHand ? floor(rightBestX) : -1;

  return { leftZoneHand, rightZoneHand };
}


// =============================================================================
// LEFT ZONE CONTROLLER  →  THEME ONLY
// Reads only `leftZoneHand`. Writes only:
//   rawLeftZoneFingerCount, confirmedLeftZoneFingerCount, leftZoneVoteHistory
// Theme is later derived solely from confirmedLeftZoneFingerCount.
// =============================================================================
function updateLeftZoneController(leftZoneHand) {
  if (!leftZoneHand) {
    rawLeftZoneFingerCount = 0;
    leftZoneAbsentFrames++;
    if (leftZoneAbsentFrames >= ABSENT_RESET_FR) {
      // Long absence → fall back to default (Spring), clear stale votes
      leftZoneVoteHistory          = [];
      confirmedLeftZoneFingerCount = 0;   // 0 → Spring via themeIndexFromLeftZone()
    }
    return;
  }

  leftZoneAbsentFrames   = 0;
  rawLeftZoneFingerCount = countRaisedFingers(
    leftZoneHand,
    confirmedLeftZoneFingerCount || 1
  );

  const winner = pushAndComputeMajority(
    leftZoneVoteHistory,
    rawLeftZoneFingerCount,
    LEFT_HIST_SIZE,
    LEFT_NEEDED,
    confirmedLeftZoneFingerCount
  );
  if (winner !== null) {
    confirmedLeftZoneFingerCount = constrain(winner, 1, 5);
  }
}


// =============================================================================
// RIGHT ZONE CONTROLLER  →  TREE ONLY
// Reads only `rightZoneHand`. Writes only:
//   rawRightZoneFingerCount, confirmedRightZoneFingerCount, rightZoneVoteHistory
// Tree complexity is later derived solely from confirmedRightZoneFingerCount.
// =============================================================================
function updateRightZoneController(rightZoneHand) {
  if (!rightZoneHand) {
    rawRightZoneFingerCount = 0;
    rightZoneAbsentFrames++;
    if (rightZoneAbsentFrames >= ABSENT_RESET_FR) {
      rightZoneVoteHistory = [];
      // confirmedRightZoneFingerCount is intentionally NOT reset:
      // the tree holds its last shape rather than collapsing.
    }
    return;
  }

  rightZoneAbsentFrames   = 0;
  rawRightZoneFingerCount = countRaisedFingers(
    rightZoneHand,
    confirmedRightZoneFingerCount
  );

  const winner = pushAndComputeMajority(
    rightZoneVoteHistory,
    rawRightZoneFingerCount,
    RIGHT_HIST_SIZE,
    RIGHT_NEEDED,
    confirmedRightZoneFingerCount
  );
  if (winner !== null) {
    confirmedRightZoneFingerCount = constrain(winner, 1, 5);
  }
}


// =============================================================================
// MAJORITY-VOTE DEBOUNCE (pure function — operates on whatever array you pass)
// Returns the new committed value, or null if no change.
// =============================================================================
function pushAndComputeMajority(history, raw, histSize, needed, current) {
  if (typeof raw !== 'number' || raw < 0 || raw > 5) return null;

  history.push(raw);
  if (history.length > histSize) history.shift();
  if (history.length < histSize) return null;

  const tally = {};
  for (const v of history) tally[v] = (tally[v] || 0) + 1;

  let topVal = current, topCount = 0;
  for (const [val, cnt] of Object.entries(tally)) {
    if (cnt > topCount) { topCount = cnt; topVal = Number(val); }
  }
  return (topVal !== current && topCount >= needed) ? topVal : null;
}


// =============================================================================
// THEME RESOLUTION  —  ONLY reads confirmedLeftZoneFingerCount.
// This function physically cannot see the right zone's data; that's by design.
// =============================================================================
function themeIndexFromLeftZone() {
  const n = confirmedLeftZoneFingerCount;
  if (n >= 1 && n <= 5) return n;   // 1=Spring 2=Autumn 3=Night 4=Sakura 5=Rainbow
  return 1;                          // default when no left hand
}


// =============================================================================
// PALM CENTER X — wrist landmark (most stable single point)
// =============================================================================
function getPalmCenterX(hand) {
  const w = getKeypoint(hand, 0);
  if (w) return w.x;
  const m = getKeypoint(hand, 9);   // fallback: middle MCP
  if (m) return m.x;
  return null;
}

function getKeypoint(hand, i) {
  const k = hand.keypoints;
  if (k && k[i] && typeof k[i].x === 'number') return k[i];
  const Lm = hand.landmarks;
  if (Lm && Lm[i] && Lm[i].length >= 2) {
    const L  = Lm[i];
    const nx = L[0] <= 1 && L[1] <= 1;
    return {
      x: nx ? L[0] * video.width  : L[0],
      y: nx ? L[1] * video.height : L[1],
    };
  }
  return null;
}

function distXY(a, b) {
  return sqrt(sq(a.x - b.x) + sq(a.y - b.y));
}


// =============================================================================
// FINGER COUNTING — position-agnostic (relative landmark distances only)
// Operates on a single hand passed in; cannot see the other zone's hand.
//
// Tightened thresholds (April 2026): the previous 1.04 / 1.06 ratios were so
// permissive that a slightly-relaxed thumb or curled pinky could register as
// extended, producing intermittent +1 errors on the LEFT hand specifically.
// The new logic requires a clearly extended pose for each finger.
// =============================================================================
function countRaisedFingers(hand, missingFallback) {
  const pts = [];
  for (let i = 0; i < 21; i++) pts.push(getKeypoint(hand, i));

  if (pts.some((p) => p === null)) {
    if (!didLogKeypointShape) {
      console.warn('Hand keypoints missing or unexpected shape.', hand);
      didLogKeypointShape = true;
    }
    return missingFallback;
  }

  const wrist = pts[0];
  let n = 0;

  // ── Thumb (the usual culprit for false-positives) ───────────────────────
  // Three independent tests, ALL must agree:
  //   1. Tip is significantly farther from wrist than the IP joint.
  //   2. Tip is significantly farther from the index MCP than the IP joint
  //      (i.e. thumb is splayed away from the palm, not folded across it).
  //   3. Tip-to-pinky-MCP distance > IP-to-pinky-MCP distance — guards
  //      against a thumb that's curled toward the palm even though it's
  //      slightly out from the side.
  const thumbExtended =
    distXY(wrist,  pts[4]) > distXY(wrist,  pts[3])  * 1.20 &&
    distXY(pts[4], pts[5]) > distXY(pts[3], pts[5])  * 1.18 &&
    distXY(pts[4], pts[17]) > distXY(pts[3], pts[17]) * 1.05;
  if (thumbExtended) n++;

  // ── Index, middle, ring, pinky ──────────────────────────────────────────
  // Compare tip-to-wrist with the MCP (knuckle) instead of the PIP. Using
  // the MCP makes the extended-vs-curled ratio much larger (≈1.6 extended,
  // ≈0.9 curled) so a 1.30× threshold is both robust and forgiving of
  // partially-extended fingers that the user clearly intends to count.
  for (const [tipIdx, mcpIdx] of [[8, 5], [12, 9], [16, 13], [20, 17]]) {
    if (distXY(wrist, pts[tipIdx]) > distXY(wrist, pts[mcpIdx]) * 1.30) n++;
  }

  return n;
}


// =============================================================================
// FRACTAL TREE
// drawBranch receives ONLY (smoothed complexity from right zone, themeIndex
// from left zone). It cannot see either raw finger count.
// =============================================================================
function drawBranch(len, depth, complexity, themeIndex) {
  const maxDepth = min(floor(lerp(6, 9, complexity)), 9);
  const minLen   = lerp(11, 3.5, complexity);
  const md       = max(1, maxDepth);
  const t        = depth / md;

  if (len < minLen) {
    if (growth > 0.88) {
      noStroke();
      const lc = leafColor(t, themeIndex);
      fill(lc[0], lc[1], lc[2], lc[3]);
      ellipse(0, 0, 3.5, 3.5);
      noFill();
    }
    return;
  }

  const bc = branchColor(t, themeIndex);
  stroke(bc[0], bc[1], bc[2], 94);
  strokeWeight(lerp(5, 0.45, t));
  strokeCap(ROUND);
  strokeJoin(ROUND);

  line(0, 0, 0, -len);
  translate(0, -len);

  if (depth >= maxDepth) { translate(0, len); return; }

  const angle    = radians(lerp(20, 52, complexity));
  const lenScale = lerp(0.76, 0.62, complexity);
  const childLen = len * lenScale;

  push(); rotate(-angle); drawBranch(childLen, depth + 1, complexity, themeIndex); pop();
  push(); rotate( angle); drawBranch(childLen, depth + 1, complexity, themeIndex); pop();

  if (complexity > 0.55 && depth < maxDepth - 2) {
    push();
    rotate(sin(depth * 1.4 + frameCount * 0.03) * radians(6));
    drawBranch(childLen * lerp(0.48, 0.68, complexity), depth + 1, complexity, themeIndex);
    pop();
  }

  translate(0, len);
}


// =============================================================================
// COLOR HELPERS — pure functions of (depth-fraction, themeIndex). No state.
// =============================================================================
function branchColor(t, themeIndex) {
  if (themeIndex === 5) {
    return [(t * 300 + frameCount * 0.25) % 360, 78, lerp(58, 95, t)];
  }
  const th = THEMES[themeIndex];
  return [
    lerp(th.trunk[0], th.tip[0], t) % 360,
    lerp(th.trunk[1], th.tip[1], t),
    lerp(th.trunk[2], th.tip[2], t),
  ];
}

function leafColor(t, themeIndex) {
  if (themeIndex === 5) {
    return [(t * 300 + frameCount * 0.4 + 40) % 360, 72, 95, 60];
  }
  return THEMES[themeIndex].leaf;
}

function hudFill(alpha, themeIndex) {
  THEMES[themeIndex].light ? fill(0, 0, 8, alpha) : fill(0, 0, 100, alpha);
}


// =============================================================================
// VIDEO PREVIEW with zone shading
// Green dots = right zone (tree), orange dots = left zone (theme), white = ignored
// =============================================================================
function drawVideoPreview() {
  const vw = 240;
  const vh = (video.height / video.width) * vw;
  const px = width - vw - 16;
  const py = 16;
  const sx = vw / video.width;
  const sy = vh / video.height;

  push();
  translate(px + vw, py);
  scale(-1, 1);
  noStroke();
  fill(0, 0, 10);
  rect(0, 0, vw, vh);
  image(video, 0, 0, vw, vh);

  // Dead-zone shading (between LEFT_ZONE_MAX_FRAC and RIGHT_ZONE_MIN_FRAC)
  const dzStart = vw * LEFT_ZONE_MAX_FRAC;
  const dzEnd   = vw * RIGHT_ZONE_MIN_FRAC;
  noStroke();
  fill(0, 0, 100, 6);
  rect(dzStart, 0, dzEnd - dzStart, vh);

  stroke(0, 0, 100, 24);
  strokeWeight(1);
  line(dzStart, 0, dzStart, vh);
  line(dzEnd,   0, dzEnd,   vh);

  noFill();
  stroke(0, 0, 100, 22);
  rect(0, 0, vw, vh);
  pop();

  // Role-coded landmark dots + per-hand live raw count
  const leftMax  = video.width * LEFT_ZONE_MAX_FRAC;
  const rightMin = video.width * RIGHT_ZONE_MIN_FRAC;

  for (let h = 0; h < min(hands.length, 2); h++) {
    if (!hands[h] || !hands[h].keypoints) continue;
    const palmX = getPalmCenterX(hands[h]);
    const palm  = getKeypoint(hands[h], 0);

    let dotHue, zoneLabel;
    if (palmX !== null && palmX > rightMin) {
      dotHue = 140; zoneLabel = 'R';   // green  = right (tree)
    } else if (palmX !== null && palmX < leftMax) {
      dotHue = 28;  zoneLabel = 'L';   // orange = left  (theme)
    } else {
      dotHue = 0;   zoneLabel = '·';   // white  = dead zone (ignored)
    }

    // Per-frame raw count for this specific detected hand (independent of
    // any vote/debouncing). Lets you visually confirm what each hand is
    // contributing this frame.
    const handRaw = countRaisedFingers(hands[h], -1);

    push();
    translate(px + vw, py);
    scale(-1, 1);
    for (const p of hands[h].keypoints) {
      if (!p || typeof p.x !== 'number') continue;
      stroke(dotHue, dotHue === 0 ? 0 : 70, 90, 55);
      strokeWeight(1.5);
      point(p.x * sx, p.y * sy);
    }
    pop();

    // Label (drawn unmirrored so digits read normally). Anchor near the
    // wrist position, but in screen space.
    if (palm) {
      const labelX = px + vw - palm.x * sx;   // mirrored back to screen space
      const labelY = py + palm.y * sy + 14;
      noStroke();
      fill(0, 0, 0, 70);
      rect(labelX - 22, labelY - 11, 44, 18, 4);
      fill(dotHue, dotHue === 0 ? 0 : 70, 100, 95);
      textAlign(CENTER, CENTER);
      textSize(11);
      text(zoneLabel + ' ' + (handRaw >= 0 ? handRaw : '?'), labelX, labelY - 2);
    }
  }
  textAlign(LEFT, BASELINE);   // restore default for downstream HUD text
}


// =============================================================================
// ON-SCREEN HUD — exposes all 6 required values
// =============================================================================
function drawOnScreenHelp(mode, themeIndex, treeComplexity) {
  noStroke();
  textSize(13);

  const themeName = THEME_NAMES[themeIndex];

  if (mode === 'manual') {
    hudFill(30, themeIndex);
    text('Mode: Manual · currentTreeComplexity = ' + treeComplexity, 18, height - 92);
    hudFill(58, themeIndex);
    text('currentTheme: ' + themeName +
         '   ·   left zone: ' + (leftZonePalmXDebug >= 0
            ? rawLeftZoneFingerCount + ' raw / ' + confirmedLeftZoneFingerCount + ' confirmed'
            : 'no hand'),
      18, height - 72);
    hudFill(18, themeIndex);
    text('Keys: 1–5 manual   ·   A auto', 18, height - 32);
    return;
  }

  hudFill(20, themeIndex);
  text('LEFT  ZONE (theme): ' +
       (leftZonePalmXDebug >= 0
          ? 'x=' + leftZonePalmXDebug +
            '   rawLeftZoneFingerCount=' + rawLeftZoneFingerCount +
            '   confirmedLeftZoneFingerCount=' + confirmedLeftZoneFingerCount
          : 'no hand'),
    18, height - 92);

  text('RIGHT ZONE (tree):  ' +
       (rightZonePalmXDebug >= 0
          ? 'x=' + rightZonePalmXDebug +
            '   rawRightZoneFingerCount=' + rawRightZoneFingerCount +
            '   confirmedRightZoneFingerCount=' + confirmedRightZoneFingerCount
          : 'no hand'),
    18, height - 72);

  hudFill(78, themeIndex);
  text('currentTheme = ' + themeName +
       '   ·   currentTreeComplexity = ' + treeComplexity,
    18, height - 32);
}


// =============================================================================
// CONSOLE LOGGING — only when any of the six tracked values changes,
// so the console stays readable while still proving the two zones are
// independent. (Logging every frame at 60 fps would itself cause lag.)
// =============================================================================
let lastLoggedSnapshot = '';
function maybeLogState(themeIndex, treeComplexity) {
  const snapshot = {
    rawLeftZoneFingerCount,
    confirmedLeftZoneFingerCount,
    rawRightZoneFingerCount,
    confirmedRightZoneFingerCount,
    currentTheme:          THEME_NAMES[themeIndex],
    currentTreeComplexity: treeComplexity,
  };
  const key = JSON.stringify(snapshot);
  if (key !== lastLoggedSnapshot) {
    lastLoggedSnapshot = key;
    console.log(snapshot);
  }
}


// =============================================================================
// UTILITIES
// =============================================================================
function setStatus(msg) {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
}

function keyPressed() {
  if (key >= '1' && key <= '5') {
    window.__manualLevel = parseInt(key, 10);
    const sel = document.getElementById('manual-level');
    if (sel) sel.value = key;
    window.__handTreeMode = 'manual';
    document.querySelectorAll('input[name="mode"]').forEach(
      (el) => (el.checked = el.value === 'manual')
    );
    const wrap = document.getElementById('manual-wrap');
    if (wrap) wrap.classList.add('visible');
  }
  if (key === 'a' || key === 'A') {
    window.__handTreeMode = 'auto';
    document.querySelectorAll('input[name="mode"]').forEach(
      (el) => (el.checked = el.value === 'auto')
    );
    const wrap = document.getElementById('manual-wrap');
    if (wrap) wrap.classList.remove('visible');
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
