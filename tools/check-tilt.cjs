// Run from the project root: node tools/check-tilt.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { direction } = require('../js/tilt.js');
const source = fs.readFileSync(require.resolve('../js/tilt.js'), 'utf8');
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
const close = (a, b) => assert(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

function setup(permission = 'granted') {
  const window = new EventTarget();
  window.screen = { orientation: new EventTarget() };
  window.screen.orientation.angle = 0;
  window.document = new EventTarget();
  window.document.hidden = false;
  window.isSecureContext = true;
  window.DeviceOrientationEvent = class {};
  window.DeviceOrientationEvent.requestPermission = async () => permission;
  const timers = new Map();
  let id = 0;
  vm.runInNewContext(source, { window, setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout(key) { timers.delete(key); } });
  const states = [];
  const tilt = new window.FloatTilt.Tilt(state => states.push(state));
  const sample = (beta, gamma) => {
    const event = new Event('deviceorientation');
    Object.assign(event, { beta, gamma });
    window.dispatchEvent(event);
  };
  return { window, tilt, states, sample, timers };
}

(async () => {
  check('small sensor jitter stays neutral', () => {
    const value = direction(40.5, .2, { beta: 40, gamma: 0 }, 0);
    close(value.x, 0); close(value.y, 0);
  });
  check('right/down tilt signs and all four screen orientations', () => {
    const origin = { beta: 0, gamma: 0 };
    for (const [angle, x, y] of [[0, 1, 0], [90, 0, -1], [180, -1, 0], [270, 0, 1]]) {
      const v = direction(0, 35, origin, angle); close(v.x, x); close(v.y, y);
    }
    close(direction(35, 0, origin, 0).y, 1);
  });
  check('beta wraparound does not produce a full-strength impulse', () => {
    const v = direction(-179, 0, { beta: 179, gamma: 0 }, 0);
    assert(v.y > 0 && v.y < .03);
  });
  check('diagonal and extreme angles stay bounded', () => {
    for (let beta = -180; beta <= 180; beta += 10) for (let gamma = -90; gamma <= 90; gamma += 10) {
      const v = direction(beta, gamma, { beta: 30, gamma: -5 }, 90);
      assert(Math.hypot(v.x, v.y) <= 1 + 1e-9);
    }
  });
  const h = setup(); await h.tilt.enable();
  check('permission grant waits for a valid sensor sample', () => {
    assert(h.tilt.enabled); h.sample(null, null); assert.equal(h.tilt.origin, null);
    h.sample(40, 5); assert.equal(h.states.at(-1), 'enabled');
    close(h.tilt.step(16).x, 0);
  });
  check('calibrated tilt is smoothed and converges', () => {
    h.sample(40, 40);
    const first = h.tilt.step(16).x; assert(first > 0 && first < .1);
    for (let i = 0; i < 120; i++) h.tilt.step(16);
    assert(h.tilt.current.x > .99);
  });
  check('recenter cancels current force and samples a new neutral position', () => {
    h.tilt.recenter(); close(h.tilt.step(16).x, 0);
    h.sample(70, -20); close(h.tilt.step(16).x, 0);
  });
  check('screen rotation clears the previous direction', () => {
    h.sample(70, 15); h.tilt.step(500);
    h.window.screen.orientation.angle = 90;
    h.window.screen.orientation.dispatchEvent(new Event('change'));
    close(h.tilt.current.x, 0); assert.equal(h.tilt.origin, null);
    h.sample(20, 10); h.sample(55, 10);
    assert(h.tilt.step(500).x > .9);
  });
  check('background detaches sensor; foreground recalibrates', () => {
    h.window.document.hidden = true;
    h.window.document.dispatchEvent(new Event('visibilitychange'));
    h.sample(90, 90); assert.equal(h.tilt.origin, null); close(h.tilt.current.x, 0);
    h.window.document.hidden = false;
    h.window.document.dispatchEvent(new Event('visibilitychange'));
    h.sample(30, 20); close(h.tilt.step(500).x, 0);
  });
  check('disable removes sensor listener and returns no tilt force', () => {
    h.tilt.disable(); h.sample(80, 80); assert.equal(h.tilt.step(16), null); assert.equal(h.tilt.origin, null);
  });
  const denied = setup('denied'); await denied.tilt.enable();
  check('denied permission preserves disabled state and allows retry', () => {
    assert(!denied.tilt.enabled); assert(!denied.tilt.pending); assert.equal(denied.states.at(-1), 'denied');
  });
  const missing = setup(); await missing.tilt.enable();
  check('missing sensor times out safely', () => {
    [...missing.timers.values()].forEach(fn => fn());
    assert(!missing.tilt.enabled); assert.equal(missing.states.at(-1), 'unavailable');
  });
  const unsupported = setup(); delete unsupported.window.DeviceOrientationEvent;
  await unsupported.tilt.enable();
  check('unsupported devices stay off', () => assert(!unsupported.tilt.enabled));
  const insecure = setup(); insecure.window.isSecureContext = false;
  check('insecure pages do not request sensors', () => assert(!insecure.tilt.supported));
  const implicit = setup(); delete implicit.window.DeviceOrientationEvent.requestPermission;
  await implicit.tilt.enable();
  check('browsers without a permission method can receive sensors', () => assert(implicit.tilt.enabled));
  console.log(`${checks} checks passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
