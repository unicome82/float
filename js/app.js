(() => {
  'use strict';

  const stage = document.querySelector('.playground');
  const header = document.querySelector('.header');
  const layer = document.querySelector('.shapes');
  const modeInput = document.querySelector('#mode');
  const blendInput = document.querySelector('#blend');
  const status = document.querySelector('.status');
  modeInput.value = 'repel';
  blendInput.value = 'normal';
  for (const option of blendInput.querySelectorAll('button')) {
    if (!CSS.supports('mix-blend-mode', option.dataset.value)) {
      option.remove();
    }
  }
  const panel = document.querySelector('.settings-popup');
  const adjust = document.querySelector('.adjust');
  const close = panel.querySelector('.close');
  const sizeInput = document.querySelector('#size');
  const sizeValue = document.querySelector('#size-value');
  const backdrop = document.querySelector('.popup-backdrop');
  const heading = panel.querySelector('.heading');
  let panelDrag = null;

  function resetPanelDrag() {
    const id = panelDrag?.id;
    panelDrag = null;
    panel.classList.remove('is-dragging');
    panel.style.removeProperty('transform');
    if (id !== undefined && heading.hasPointerCapture(id)) heading.releasePointerCapture(id);
  }

  function setPanel(open) {
    resetPanelDrag();
    backdrop.hidden = !open;
    adjust.hidden = open;
    adjust.inert = open;
    adjust.setAttribute('aria-expanded', String(open));
    header.classList.toggle('is-hidden', open);
    stage.inert = open;
    header.inert = open;
    if (!open && panel.contains(document.activeElement)) adjust.focus();
    panel.inert = !open;
    panel.setAttribute('aria-hidden', String(!open));
    panel.classList.toggle('is-open', open);
    if (open) { if (window.Matter) releaseDrag(); close.focus({ preventScroll: true }); }
  }

  adjust.addEventListener('click', () => setPanel(true));
  close.addEventListener('click', () => setPanel(false));
  backdrop.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    setPanel(false);
  });
  heading.addEventListener('pointerdown', event => {
    if (panelDrag || event.target.closest('button') || (event.pointerType === 'mouse' && event.button !== 0)) return;
    panelDrag = { id: event.pointerId, y: event.clientY, distance: 0 };
    heading.setPointerCapture(event.pointerId);
    panel.classList.add('is-dragging');
  });
  heading.addEventListener('pointermove', event => {
    if (panelDrag?.id !== event.pointerId) return;
    panelDrag.distance = Math.max(0, event.clientY - panelDrag.y);
    panel.style.transform = `translateY(${panelDrag.distance}px)`;
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    heading.addEventListener(name, event => {
      if (panelDrag?.id !== event.pointerId) return;
      const dismiss = name === 'pointerup' && panelDrag.distance >= Math.min(90, panel.offsetHeight * .2);
      if (dismiss) setPanel(false);
      else resetPanelDrag();
    });
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel.classList.contains('is-open')) setPanel(false);
    if (event.key === 'Tab' && panel.classList.contains('is-open')) {
      const controls = [...panel.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
  });
  if (!window.Matter) {
    status.textContent = 'The physics engine could not load. Check your connection and refresh.';
    status.hidden = false;
    document.querySelectorAll('.controls button, .controls input').forEach(control => { control.disabled = true; });
    return;
  }

  const { Engine, Bodies, Body, Composite, Constraint, Query } = Matter;
  const engine = Engine.create({ gravity: { x: 0, y: 0 }, positionIterations: 6 });
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const bursts = [];
  const shapes = [];
  let width = stage.clientWidth;
  let height = stage.clientHeight;
  let walls = [];
  let mode = modeInput.value;
  let lastTime = 0;
  let elapsed = 0;
  let resizeFrame = 0;
  let animationFrame = 0;
  let shapeScale = 1;
  let shapeCount = width <= 600 ? 12 : 15;
  let drag = null;
  const types = ['circle', 'arch', 'capsule', 'square', 'ellipse'];
  const random = (min, max) => min + Math.random() * (max - min);

  const tiltToggle = document.querySelector('#tilt-toggle');
  const tilt = new FloatTilt.Tilt(state => {
    const active = state === 'waiting' || state === 'enabled';
    tiltToggle.disabled = state === 'pending';
    tiltToggle.setAttribute('aria-busy', String(state === 'pending'));
    tiltToggle.setAttribute('aria-checked', String(active));
  });
  if (!tilt.supported) tiltToggle.disabled = true;
  tiltToggle.addEventListener('click', () => {
    if (tilt.enabled) tilt.disable();
    else tilt.enable();
  });

  function updateTilt(dt) {
    const direction = tilt.step(dt);
    const strength = mode === 'gravity' ? .75 : .055;
    engine.gravity.x = direction ? direction.x * strength : 0;
    engine.gravity.y = direction ? direction.y * strength : mode === 'gravity' ? .65 : 0;
  }

  function bounds() {
    return { left: 0, right: width, top: 0, bottom: height };
  }

  function createWalls() {
    Composite.remove(engine.world, walls);
    const b = bounds();
    const options = { isStatic: true, restitution: 1, friction: .12 };
    walls = [
      Bodies.rectangle(width / 2, b.top - 50, width + 200, 100, options),
      Bodies.rectangle(width / 2, b.bottom + 50, width + 200, 100, options),
      Bodies.rectangle(b.left - 50, height / 2, 100, height + 200, options),
      Bodies.rectangle(b.right + 50, height / 2, 100, height + 200, options)
    ];
    Composite.add(engine.world, walls);
  }

  function baseDimensions(index) {
    const type = types[index % types.length];
    const ratio = type === 'capsule' ? .43 : type === 'ellipse' ? .64 : 1;
    if (width <= 600) return { w: width * .36, h: width * .36 * ratio };
    const b = bounds();
    const scale = Math.min(1, width / 1250, (b.bottom - b.top) / 520);
    const size = Math.max(40, [146, 164, 178, 108, 194, 94, 126][index % 7] * scale);
    const w = Math.min(size, (b.right - b.left) / 6 * .94) * 1.6;
    const h = Math.min(w * ratio, (b.bottom - b.top) / 4 * .92 * 1.6);
    return { w: type === 'circle' ? Math.min(w, h) : w, h };
  }

  function dimensions(index) {
    const { w, h } = baseDimensions(index);
    return { w: w * shapeScale, h: h * shapeScale };
  }

  function resizeShape(shape, index) {
    const { w, h } = dimensions(index);
    if (w === shape.w && h === shape.h) return;
    const angle = shape.body.angle;
    Body.setAngle(shape.body, 0);
    Body.scale(shape.body, w / shape.w, h / shape.h);
    Body.setAngle(shape.body, angle);
    shape.offset *= h / shape.h;
    shape.w = w;
    shape.h = h;
    shape.radius = collisionRadius(shape.body);
    shape.element.style.width = `${w}px`;
    shape.element.style.height = `${h}px`;
  }

  function createShapes(start = 0, count = shapeCount) {
    const mobile = width <= 600;
    const columns = mobile ? 3 : 5;
    for (let i = start; i < count; i++) {
      const type = types[i % types.length];
      const { w, h } = dimensions(i);
      const x = width / 2;
      const y = height / 2;
      // Keep the full outline for walls; handle shape pairs by their centers.
      const options = { restitution: .82, friction: .04, frictionAir: .012, density: .001, angle: random(-.7, .7), collisionFilter: { category: 2, mask: 1 } };
      let body;
      if (type === 'circle') {
        body = Bodies.circle(x, y, Math.min(w, h) / 2, options);
      } else if (type === 'ellipse') {
        body = Bodies.circle(x, y, w / 2, { ...options, angle: 0 });
        Body.scale(body, 1, h / w);
        Body.setAngle(body, options.angle);
      } else if (type === 'arch') {
        const vertices = [{ x: -w / 2, y: h / 2 }, { x: w / 2, y: h / 2 }];
        for (let step = 0; step <= 16; step++) {
          const angle = step / 16 * Math.PI;
          vertices.push({ x: Math.cos(angle) * w / 2, y: -Math.sin(angle) * h + h / 2 });
        }
        body = Bodies.fromVertices(x, y, vertices, options);
      } else {
        body = Bodies.rectangle(x, y, w, h, { ...options, chamfer: type === 'capsule' ? { radius: h / 2 } : null });
      }
      const element = document.createElement('div');
      element.className = `shape type-${type} color-${i % 10 + 1}`;
      element.style.width = `${w}px`;
      element.style.height = `${h}px`;
      layer.append(element);
      // Matter centers an arch on its centroid; retain its visual center offset.
      const offset = type === 'arch' ? -h * (.5 - 4 / (3 * Math.PI)) : 0;
      shapes.push({ body, element, w, h, offset, radius: collisionRadius(body), phase: random(0, Math.PI * 2) });
      Composite.add(engine.world, body);
      Body.setVelocity(body, { x: random(-.45, .45), y: random(-.4, .4) });
      Body.setAngularVelocity(body, random(-.002, .002));
    }
    if (start === 0) arrangeShapes(columns);
    else shapes.slice(start).forEach(({ body }) => {
      Body.setPosition(body, { x: width * random(.25, .75), y: height * random(.25, .75) });
      contain(body);
    });
  }

  function arrangeShapes(columns) {
    const rows = [];
    for (let i = 0; i < shapes.length; i += columns) {
      const items = shapes.slice(i, i + columns).map(({ body }) => ({
        body,
        w: body.bounds.max.x - body.bounds.min.x,
        h: body.bounds.max.y - body.bounds.min.y
      }));
      let x = 0;
      items.forEach((item, index) => {
        x += index ? (items[index - 1].w + item.w) * .45 : item.w / 2;
        item.x = x;
      });
      rows.push({ items, w: x + items[items.length - 1].w / 2, h: Math.max(...items.map(item => item.h)) });
    }
    let y = 0;
    rows.forEach((row, index) => {
      y += index ? (rows[index - 1].h + row.h) * .45 : row.h / 2;
      row.y = y;
    });
    const totalHeight = y + rows[rows.length - 1].h / 2;
    for (const row of rows) {
      for (const item of row.items) {
        const box = item.body.bounds;
        Body.translate(item.body, {
          x: width / 2 - row.w / 2 + item.x - (box.min.x + box.max.x) / 2,
          y: height / 2 - totalHeight / 2 + row.y + random(-item.h * .03, item.h * .03) - (box.min.y + box.max.y) / 2
        });
      }
    }
  }

  function applyForces(dt) {
    elapsed += dt;
    while (bursts.length && elapsed - bursts[0].time > 240) bursts.shift();
    const maxSpeed = bursts.length ? 10 : mode === 'gravity' ? 9 : ['repel', 'bounce', 'scatter'].includes(mode) ? 5 : 2.4;
    for (const shape of shapes) {
      const { body, phase } = shape;
      if (mode !== 'gravity') {
        const lift = body.mass * .000009;
        Body.applyForce(body, body.position, {
          x: Math.sin(elapsed * .0003 + phase) * lift,
          y: Math.cos(elapsed * .00024 + phase) * lift
        });
        body.torque += Math.sin(elapsed * .0002 + phase) * body.inertia * .00000003;
      }
      for (const burst of bursts) {
        const dx = body.position.x - burst.x;
        const dy = body.position.y - burst.y;
        const distance = Math.hypot(dx, dy);
        const radius = Math.min(480, width * .85) + Math.max(shape.w, shape.h) / 2;
        if (distance >= radius) continue;
        const proximity = 1 - distance / radius;
        const decay = 1 - (elapsed - burst.time) / 240;
        const force = body.mass * .0035 * proximity * decay;
        const nx = distance > .001 ? dx / distance : Math.cos(phase);
        const ny = distance > .001 ? dy / distance : Math.sin(phase);
        Body.applyForce(body, body.position, { x: nx * force, y: ny * force });
      }
      if (body.speed > maxSpeed) Body.setVelocity(body, { x: body.velocity.x / body.speed * maxSpeed, y: body.velocity.y / body.speed * maxSpeed });
      if (Math.abs(body.angularVelocity) > .025) Body.setAngularVelocity(body, Math.sign(body.angularVelocity) * .025);
    }
  }

  function contain(body) {
    const b = bounds();
    const box = body.bounds;
    const dx = box.min.x < b.left ? b.left - box.min.x : box.max.x > b.right ? b.right - box.max.x : 0;
    const dy = box.min.y < b.top ? b.top - box.min.y : box.max.y > b.bottom ? b.bottom - box.max.y : 0;
    if (dx || dy) {
      Body.translate(body, { x: dx, y: dy });
      Body.setVelocity(body, { x: dx ? Math.sign(dx) * Math.abs(body.velocity.x) * .8 : body.velocity.x, y: dy ? Math.sign(dy) * Math.abs(body.velocity.y) * .8 : body.velocity.y });
    }
  }

  function repelCenters() {
    for (let i = 0; i < shapes.length; i++) {
      const a = shapes[i];
      for (let j = i + 1; j < shapes.length; j++) {
        const b = shapes[j];
        const dx = b.body.position.x - a.body.position.x;
        const dy = b.body.position.y - a.body.position.y;
        const reach = (a.radius + b.radius) * .7;
        if (dx * dx + dy * dy >= reach * reach) continue;
        const distance = Math.hypot(dx, dy);
        const nx = distance > .001 ? dx / distance : 1;
        const ny = distance > .001 ? dy / distance : 0;
        // Allow about 30% overlap along the line connecting the two centers.
        const radius = (extent(a.body, nx, ny) + extent(b.body, -nx, -ny)) * .7;
        if (distance >= radius) continue;
        const closing = (a.body.velocity.x - b.body.velocity.x) * nx + (a.body.velocity.y - b.body.velocity.y) * ny;
        const mass = a.body.mass * b.body.mass / (a.body.mass + b.body.mass);
        const stiffness = mode === 'gravity' ? .004 : mode === 'bounce' ? .0018 : .0009;
        const force = mass * ((1 - distance / radius) * stiffness + Math.max(0, closing) * .00016);
        Body.applyForce(a.body, a.body.position, { x: -nx * force, y: -ny * force });
        Body.applyForce(b.body, b.body.position, { x: nx * force, y: ny * force });
      }
    }
  }

  function collisionRadius(body) {
    let radius = 0;
    for (const vertex of body.vertices) {
      const x = vertex.x - body.position.x;
      const y = vertex.y - body.position.y;
      radius = Math.max(radius, x * x + y * y);
    }
    return Math.sqrt(radius);
  }

  function extent(body, x, y) {
    let reach = 0;
    for (const vertex of body.vertices) {
      reach = Math.max(reach, (vertex.x - body.position.x) * x + (vertex.y - body.position.y) * y);
    }
    return reach;
  }

  function render() {
    for (const { body, element, w, h, offset } of shapes) {
      element.style.transform = `translate3d(${body.position.x - w / 2}px, ${body.position.y - h / 2}px, 0) rotate(${body.angle}rad) translateY(${offset}px)`;
    }
  }

  function frame(time) {
    const dt = Math.min(time - (lastTime || time), 1000 / 30) * (motion.matches ? .2 : 1);
    lastTime = time;
    if (!document.hidden && dt > 0) {
      updateTilt(dt);
      applyForces(dt);
      // Substeps keep cursor forces and collisions stable on slower devices.
      const steps = Math.ceil(dt / (1000 / 60));
      for (let i = 0; i < steps; i++) {
        repelCenters();
        Engine.update(engine, dt / steps);
      }
      shapes.forEach(({ body }) => contain(body));
      render();
    }
    animationFrame = requestAnimationFrame(frame);
  }

  function releaseDrag() {
    if (!drag) return;
    const { constraint, id } = drag;
    drag = null;
    Composite.remove(engine.world, constraint);
    if (stage.hasPointerCapture(id)) stage.releasePointerCapture(id);
  }

  function stagePoint(event) {
    const rect = stage.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  stage.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (mode === 'gravity') {
      if (drag) return;
      const point = stagePoint(event);
      const body = Query.point(shapes.map(shape => shape.body), point).pop();
      if (!body) return;
      const constraint = Constraint.create({
        pointA: point,
        bodyB: body,
        pointB: { x: point.x - body.position.x, y: point.y - body.position.y },
        stiffness: .12,
        damping: .15,
        length: 0
      });
      drag = { constraint, id: event.pointerId };
      Composite.add(engine.world, constraint);
      stage.setPointerCapture(event.pointerId);
      return;
    }
    bursts.push({ ...stagePoint(event), time: elapsed });
    if (bursts.length > 4) bursts.shift();
  });
  stage.addEventListener('pointermove', event => {
    if (drag?.id === event.pointerId) drag.constraint.pointA = stagePoint(event);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    stage.addEventListener(name, event => { if (drag?.id === event.pointerId) releaseDrag(); });
  }
  window.addEventListener('blur', () => { bursts.length = 0; releaseDrag(); });
  modeInput.addEventListener('change', () => {
    releaseDrag();
    bursts.length = 0;
    const previous = mode;
    mode = modeInput.value;
    updateTilt(0);
    for (const { body } of shapes) {
      body.restitution = mode === 'bounce' ? 1 : .82;
      body.frictionAir = mode === 'bounce' ? .001 : .012;
      if (previous === 'gravity' && mode !== 'gravity') Body.applyForce(body, body.position, { x: random(-1, 1) * body.mass * .0003, y: -body.mass * .0015 });
    }
  });
  blendInput.addEventListener('change', () => {
    layer.className = `shapes blend-${blendInput.value}`;
  });
  for (const field of [modeInput, blendInput]) {
    const list = field.querySelector('.options');
    let scrollDrag = null;
    let suppressClick = false;
    list.addEventListener('pointerdown', event => {
      suppressClick = false;
      if (event.pointerType === 'touch' || event.button !== 0 || list.scrollWidth <= list.clientWidth) return;
      scrollDrag = { id: event.pointerId, x: event.clientX, left: list.scrollLeft };
    });
    list.addEventListener('pointermove', event => {
      if (scrollDrag?.id !== event.pointerId) return;
      const distance = event.clientX - scrollDrag.x;
      if (!suppressClick && Math.abs(distance) < 5) return;
      suppressClick = true;
      event.preventDefault();
      list.classList.add('is-dragging');
      if (!list.hasPointerCapture(event.pointerId)) list.setPointerCapture(event.pointerId);
      list.scrollLeft = scrollDrag.left - distance;
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      list.addEventListener(name, event => {
        if (scrollDrag?.id !== event.pointerId) return;
        scrollDrag = null;
        list.classList.remove('is-dragging');
        if (list.hasPointerCapture(event.pointerId)) list.releasePointerCapture(event.pointerId);
      });
    }
    list.addEventListener('click', event => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    }, true);
    list.addEventListener('wheel', event => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || list.scrollWidth <= list.clientWidth) return;
      event.preventDefault();
      list.scrollLeft += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? list.clientWidth : 1);
    }, { passive: false });
    field.addEventListener('click', event => {
      const button = event.target.closest('button[data-value]');
      if (!button || button.disabled) return;
      field.value = button.dataset.value;
      field.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      field.dispatchEvent(new Event('change'));
    });
  }
  const countInput = document.querySelector('#count');
  const countValue = document.querySelector('#count-value');
  countInput.value = shapeCount;
  countValue.value = String(shapeCount);
  countInput.addEventListener('input', () => {
    releaseDrag();
    bursts.length = 0;
    shapeCount = Number(countInput.value);
    const previousCount = shapes.length;
    while (shapes.length > shapeCount) {
      const shape = shapes.pop();
      Composite.remove(engine.world, shape.body);
      shape.element.remove();
    }
    if (shapeCount > previousCount) createShapes(previousCount, shapeCount);
    for (const { body } of shapes) {
      body.restitution = mode === 'bounce' ? 1 : .82;
      body.frictionAir = mode === 'bounce' ? .001 : .012;
    }
    countValue.value = String(shapeCount);
    render();
  });
  sizeInput.addEventListener('input', () => {
    releaseDrag();
    shapeScale = Number(sizeInput.value) / 100;
    sizeValue.value = `${sizeInput.value}%`;
    shapes.forEach((shape, index) => { resizeShape(shape, index); contain(shape.body); });
    render();
  });
  document.addEventListener('visibilitychange', () => {
    lastTime = 0;
    cancelAnimationFrame(animationFrame);
    if (document.hidden) { bursts.length = 0; releaseDrag(); resetPanelDrag(); }
    else animationFrame = requestAnimationFrame(frame);
  });
  function queueResize() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      bursts.length = 0;
      releaseDrag();
      const oldWidth = width;
      const oldHeight = height;
      width = stage.clientWidth;
      height = stage.clientHeight;
      createWalls();
      for (const [index, shape] of shapes.entries()) {
        resizeShape(shape, index);
        Body.setPosition(shape.body, { x: shape.body.position.x / oldWidth * width, y: shape.body.position.y / oldHeight * height });
        contain(shape.body);
      }
      render();
    });
  }
  window.addEventListener('resize', queueResize);
  new ResizeObserver(queueResize).observe(stage);

  createWalls();
  createShapes();
  shapes.forEach(({ body }) => contain(body));
  render();
  animationFrame = requestAnimationFrame(frame);
})();
