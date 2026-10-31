// Run from the project root: node tools/check-performance.cjs [baseline.js]
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');

function load(path) {
  const source = fs.readFileSync(path, 'utf8');
  const code = source.slice(source.indexOf('  function repelCenters()'), source.indexOf('  function render()'));
  return new Function('shapes', 'Body', 'mode', `${code}\nreturn repelCenters;`);
}

function fixture(count, width, height, clustered, seed = 1) {
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: count }, (_, id) => {
    const position = { x: width * (clustered ? .4 + random() * .2 : random()), y: height * (clustered ? .4 + random() * .2 : random()) };
    const w = width < 600 ? width * .36 : 100 + random() * 200;
    const h = w * (.4 + random() * .6);
    const angle = random() * Math.PI;
    const vertices = Array.from({ length: 24 }, (_, i) => {
      const t = i / 24 * Math.PI * 2;
      const x = Math.cos(t) * w / 2;
      const y = Math.sin(t) * h / 2;
      return { x: position.x + x * Math.cos(angle) - y * Math.sin(angle), y: position.y + x * Math.sin(angle) + y * Math.cos(angle) };
    });
    const radius = Math.sqrt(Math.max(...vertices.map(v => (v.x - position.x) ** 2 + (v.y - position.y) ** 2)));
    return { radius, body: { id, mass: 1 + random() * 10, position, vertices, velocity: { x: random() - .5, y: random() - .5 } } };
  });
}

const current = load('js/app.js');
const baseline = process.argv[2] ? load(process.argv[2]) : null;
let comparisons = 0;
if (baseline) {
  for (const count of [12, 15, 30]) for (const mode of ['repel', 'gravity', 'bounce']) for (let seed = 1; seed <= 20; seed++) {
    const shapes = fixture(count, 1440, 900, seed % 2 === 0, seed);
    const run = factory => {
      const forces = Array.from({ length: count }, () => ({ x: 0, y: 0 }));
      factory(shapes, { applyForce(body, _, force) { forces[body.id].x += force.x; forces[body.id].y += force.y; } }, mode)();
      return forces;
    };
    const before = run(baseline);
    const after = run(current);
    before.forEach((force, i) => {
      assert(Math.abs(force.x - after[i].x) < 1e-10);
      assert(Math.abs(force.y - after[i].y) < 1e-10);
    });
    comparisons++;
  }
}

function measure(factory, shapes) {
  const fn = factory(shapes, { applyForce() {} }, 'repel');
  for (let i = 0; i < 1000; i++) fn();
  const samples = [];
  for (let sample = 0; sample < 60; sample++) {
    const start = performance.now();
    for (let i = 0; i < 100; i++) fn();
    samples.push((performance.now() - start) / 100);
  }
  samples.sort((a, b) => a - b);
  return { median_ms: +samples[30].toFixed(4), p95_ms: +samples[57].toFixed(4) };
}

const results = [];
for (const [name, count, width, height] of [['mobile', 12, 390, 844], ['desktop', 15, 1440, 900], ['maximum', 30, 1440, 900]]) {
  for (const clustered of [false, true]) {
    const shapes = fixture(count, width, height, clustered);
    const before = baseline ? measure(baseline, shapes) : null;
    const after = measure(current, shapes);
    results.push({ name, count, clustered, before, after });
  }
}
console.log(JSON.stringify({ scope: 'CPU center-repulsion only; synthetic 24-vertex shapes; excludes Matter.update, DOM, GPU, FPS', node: process.version, force_parity_cases: comparisons, results }, null, 2));
