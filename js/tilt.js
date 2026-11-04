/* Device tilt is opt-in and calibrated to the user's current holding position. */
(function (root) {
  'use strict';
  const clamp = value => Math.max(-1, Math.min(1, value));
  const difference = (angle, origin) => ((angle - origin + 540) % 360) - 180;

  function direction(beta, gamma, origin, angle) {
    const limit = 35;
    const x = clamp(difference(gamma, origin.gamma) / limit);
    const y = clamp(difference(beta, origin.beta) / limit);
    const radians = angle * Math.PI / 180;
    let screenX = x * Math.cos(radians) + y * Math.sin(radians);
    let screenY = -x * Math.sin(radians) + y * Math.cos(radians);
    const length = Math.hypot(screenX, screenY);
    if (length < .04) return { x: 0, y: 0 };
    const magnitude = Math.min(1, (length - .04) / .96);
    return { x: screenX / length * magnitude, y: screenY / length * magnitude };
  }

  class Tilt {
    constructor(onChange = () => {}) {
      this.onChange = onChange;
      this.enabled = false;
      this.pending = false;
      this.origin = null;
      this.target = { x: 0, y: 0 };
      this.current = { x: 0, y: 0 };
      this.timer = null;
      this.angle = () => root.screen.orientation?.angle ?? root.orientation ?? 0;
      this.receive = event => {
        if (!this.enabled || root.document.hidden || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
        // Some browsers expose null readings when no physical sensor is present.
        if (!this.origin) {
          this.origin = { beta: event.beta, gamma: event.gamma };
          clearTimeout(this.timer);
          this.onChange('enabled');
        }
        this.target = direction(event.beta, event.gamma, this.origin, this.angle());
      };
      this.rotate = () => { if (this.enabled) this.recenter(); };
      this.visibility = () => {
        if (!this.enabled) return;
        this.detach();
        this.reset();
        if (!root.document.hidden) this.listen();
      };
      root.screen.orientation?.addEventListener('change', this.rotate);
      root.addEventListener('orientationchange', this.rotate);
      root.document.addEventListener('visibilitychange', this.visibility);
    }

    get supported() {
      return root.isSecureContext && typeof root.DeviceOrientationEvent !== 'undefined';
    }

    async enable() {
      if (!this.supported || this.pending || this.enabled) return;
      this.pending = true;
      this.onChange('pending');
      try {
        // iOS requires this call directly inside the user's button gesture.
        const request = root.DeviceOrientationEvent.requestPermission;
        if (typeof request === 'function' && await request.call(root.DeviceOrientationEvent) !== 'granted') {
          this.onChange('denied');
          return;
        }
        this.enabled = true;
        this.reset();
        if (!root.document.hidden) this.listen();
      } catch (_) {
        this.onChange('denied');
      } finally {
        this.pending = false;
      }
    }

    reset() {
      this.origin = null;
      this.target = { x: 0, y: 0 };
      this.current = { x: 0, y: 0 };
    }

    listen() {
      root.addEventListener('deviceorientation', this.receive, { passive: true });
      this.onChange('waiting');
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (!this.origin) this.disable('unavailable');
      }, 4000);
    }

    detach() {
      root.removeEventListener('deviceorientation', this.receive);
      clearTimeout(this.timer);
    }

    recenter() {
      this.detach();
      this.reset();
      if (this.enabled && !root.document.hidden) this.listen();
    }

    disable(state = 'off') {
      this.enabled = false;
      this.detach();
      this.reset();
      this.onChange(state);
    }

    step(dt) {
      // Constant work per frame; the sensor callback never updates bodies or DOM transforms.
      const mix = 1 - Math.exp(-Math.max(0, dt) / 180);
      this.current.x += (this.target.x - this.current.x) * mix;
      this.current.y += (this.target.y - this.current.y) * mix;
      return this.enabled ? this.current : null;
    }
  }

  root.FloatTilt = { Tilt, direction };
  if (typeof module !== 'undefined' && module.exports) module.exports = { direction };
})(typeof window === 'undefined' ? globalThis : window);
