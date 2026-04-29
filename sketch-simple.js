let complexity = 0;
let targetC    = 0;
let growth     = 0;
let level      = 1;


function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);
  targetC = map(level, 1, 5, 0, 1);
}


function draw() {
  background(210, 38, 9);
  complexity = lerp(complexity, targetC, 0.08);
  growth = lerp(growth, 1, 0.025);

  push();
  translate(width / 2, height - 28);
  rotate(sin(frameCount * 0.018) * 0.04);
  const trunk = min(width, height) * 0.2 * growth;
  drawBranch(trunk, 0, complexity);
  pop();

  noStroke();
  fill(0, 0, 100, 30);
  textSize(15);
  text('Level ' + level + ' / 5  —  keys 1-5', 18, height - 36);
}


function drawBranch(len, depth, c) {
  const maxDepth = floor(lerp(6, 14, c));
  const minLen   = lerp(11, 3.5, c);

  if (len < minLen) {
    if (growth > 0.88) {
      noStroke();
      fill(lerp(115, 32, depth / max(1, maxDepth)), 55, 92, 50);
      ellipse(0, 0, 3.5, 3.5);
      noFill();
    }
    return;
  }

  const md = max(1, maxDepth);
  const hue = lerp(130, 28, depth / md) + c * 10;
  stroke(hue % 360, lerp(28, 72, depth / md), lerp(38, 96, depth / md), 94);
  strokeWeight(lerp(5, 0.45, depth / md));
  strokeCap(ROUND);
  strokeJoin(ROUND);

  line(0, 0, 0, -len);
  translate(0, -len);

  if (depth >= maxDepth) {
    translate(0, len);
    return;
  }

  const angle = radians(lerp(20, 52, c));
  const lenScale = lerp(0.76, 0.62, c);
  const childLen = len * lenScale;

  push();
  rotate(-angle);
  drawBranch(childLen, depth + 1, c);
  pop();

  push();
  rotate(angle);
  drawBranch(childLen, depth + 1, c);
  pop();

  if (c > 0.55) {
    push();
    rotate(sin(depth * 1.4 + frameCount * 0.03) * radians(6));
    drawBranch(childLen * lerp(0.48, 0.68, c), depth + 1, c);
    pop();
  }

  translate(0, len);
}


function keyPressed() {
  if (key >= '1' && key <= '5') {
    level = parseInt(key, 10);
    targetC = map(level, 1, 5, 0, 1);
  }
}


function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
