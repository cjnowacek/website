// src/scripts/explore.js: the Shore House walkthrough viewer (noclip style).
//
// One full-screen canvas with every room of src/data/shore-house-explore.json
// (embedded in the page as #explore-data) in one scene, a free-fly camera with
// no collision, a panel that teleports to rooms and shows or hides them, and
// the view in the URL hash so it can be shared. Rooms are GLBs already in world
// position with unlit, quantized materials: GLTFLoader needs no decoder and the
// scene needs no lights. A later layer (the rebuild) is more data, not code.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const START_ROOM = 'front-hall';
const MAX_IN_FLIGHT = 2;
const BASE_SPEED = 3; // m/s
const MIN_SPEED = 0.5;
const MAX_SPEED = 30;
const WHEEL_FACTOR = 1.15; // per wheel notch
const FAST = 4; // Shift multiplier
const LOOK = 0.0025; // radians per pixel
const PITCH_LIMIT = THREE.MathUtils.degToRad(89);
const STICK_RADIUS = 45; // px
const URL_INTERVAL = 500; // ms between hash writes while moving
const STATUS_CLEAR = 1500; // ms after the last load

export function start() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}

function init() {
  const dataEl = document.getElementById('explore-data');
  const canvas = document.getElementById('view');
  const statusEl = document.getElementById('status');
  if (!dataEl || !canvas || !statusEl) return;

  let layout;
  try {
    layout = JSON.parse(dataEl.textContent);
  } catch {
    statusEl.textContent = 'Could not read the room list';
    return;
  }

  // ---- Status line --------------------------------------------------------
  let statusTimer = 0;
  function setStatus(text, clearAfter = 0) {
    clearTimeout(statusTimer);
    statusEl.textContent = text;
    if (clearAfter) statusTimer = setTimeout(() => { statusEl.textContent = ''; }, clearAfter);
  }

  // ---- Renderer, scene, camera -------------------------------------------
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch {
    setStatus('This browser cannot show the walkthrough (WebGL is not available)');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x37383d);
  // Fallback for any material that is not unlit; MeshBasicMaterial ignores it.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1));

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 500);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false); // CSS sizes the canvas; this sets its drawing buffer
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- Rooms ---------------------------------------------------------------
  const base = layout.base || '';
  const rooms = new Map(); // id -> { data, group, state: 'idle'|'loading'|'loaded'|'failed' }
  for (const layer of layout.layers || []) {
    for (const data of layer.rooms || []) {
      if (rooms.has(data.id)) continue;
      const group = new THREE.Group();
      group.name = data.id;
      scene.add(group);
      rooms.set(data.id, { data, group, state: 'idle' });
    }
  }
  const total = rooms.size;

  const boxes = [...document.querySelectorAll('.room-show')];
  const goButtons = [...document.querySelectorAll('.room-go')];

  function boxFor(id) {
    return boxes.find((b) => b.dataset.room === id);
  }
  function isShown(id) {
    const room = rooms.get(id);
    return !!room && room.group.visible;
  }
  function setShown(id, on) {
    const room = rooms.get(id);
    if (!room) return;
    room.group.visible = on;
    const box = boxFor(id);
    if (box) box.checked = on;
  }

  // ---- Camera state ------------------------------------------------------
  let yaw = 0;
  let pitch = 0;
  function applyRotation() {
    pitch = THREE.MathUtils.clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  // ---- URL state (read once) -------------------------------------------------
  const params = parseHash(location.hash);
  let currentRoom = rooms.has(params.room) ? params.room : (rooms.has(START_ROOM) ? START_ROOM : rooms.keys().next().value);

  for (const id of (params.hide || '').split(',')) {
    if (rooms.has(id)) setShown(id, false);
  }

  const cam = parseCam(params.cam);
  if (cam) {
    camera.position.set(cam[0], cam[1], cam[2]);
    yaw = THREE.MathUtils.degToRad(cam[3]);
    pitch = THREE.MathUtils.degToRad(cam[4]);
  } else if (currentRoom) {
    camera.position.fromArray(rooms.get(currentRoom).data.spawn);
  }
  applyRotation();

  let dirty = false;
  let lastUrlWrite = 0;
  function writeUrl() {
    const p = camera.position;
    let yawDeg = THREE.MathUtils.radToDeg(yaw) % 360;
    if (yawDeg > 180) yawDeg -= 360;
    if (yawDeg <= -180) yawDeg += 360;
    const parts = [
      `room=${encodeURIComponent(currentRoom || '')}`,
      `cam=${[p.x, p.y, p.z].map((v) => v.toFixed(2)).join(',')},${yawDeg.toFixed(1)},${THREE.MathUtils.radToDeg(pitch).toFixed(1)}`,
    ];
    const hidden = [...rooms.keys()].filter((id) => !isShown(id));
    if (hidden.length) parts.push(`hide=${hidden.map(encodeURIComponent).join(',')}`);
    history.replaceState(history.state, '', `#${parts.join('&')}`);
    dirty = false;
    lastUrlWrite = performance.now();
  }

  // ---- Loading queue -------------------------------------------------------
  const loader = new GLTFLoader();
  const priority = currentRoom ? [currentRoom] : []; // ids to load before the nearest-first rest
  let inFlight = 0;
  let started = 0;
  const failed = [];

  function nextRoom() {
    while (priority.length) {
      const id = priority.shift();
      const room = rooms.get(id);
      if (room && room.state === 'idle' && room.group.visible) return room;
    }
    let best = null;
    let bestDist = Infinity;
    for (const room of rooms.values()) {
      if (room.state !== 'idle' || !room.group.visible) continue;
      const c = room.data.center || room.data.spawn;
      const d = c ? camera.position.distanceToSquared(new THREE.Vector3().fromArray(c)) : Infinity;
      if (best === null || d < bestDist) {
        best = room;
        bestDist = d;
      }
    }
    return best;
  }

  function pump() {
    while (inFlight < MAX_IN_FLIGHT) {
      const room = nextRoom();
      if (!room) break;
      loadRoom(room);
    }
    if (inFlight === 0 && started > 0) {
      if (failed.length) setStatus(`Could not load ${failed.join(', ')}`, 6000);
      else if (statusEl.textContent.startsWith('Loading')) setStatus(statusEl.textContent, STATUS_CLEAR);
    }
  }

  function loadRoom(room) {
    room.state = 'loading';
    inFlight += 1;
    started += 1;
    setStatus(`Loading ${room.data.title} (${started} of ${total})`);

    const files = room.data.files || [];
    let pending = files.length;
    let ok = true;

    function finish() {
      room.state = ok ? 'loaded' : 'failed';
      inFlight -= 1;
      if (!ok) {
        failed.push(room.data.title);
        setStatus(`Could not load ${room.data.title}`);
      }
      // Next tick, so a throw in one callback can never strand the queue.
      setTimeout(pump, 0);
    }
    if (pending === 0) {
      finish();
      return;
    }

    for (const file of files) {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        pending -= 1;
        if (pending === 0) finish();
      };
      try {
        loader.load(
          base + file,
          (gltf) => {
            if (settled) return;
            room.group.add(gltf.scene);
            done();
          },
          undefined,
          (err) => {
            if (settled) return;
            ok = false;
            console.error(`explore: could not load ${base + file}`, err);
            done();
          },
        );
      } catch (err) {
        ok = false;
        console.error(`explore: could not load ${base + file}`, err);
        done();
      }
    }
  }

  // Load this room next (before the nearest-first rest), if it still needs it.
  function loadFirst(id) {
    const room = rooms.get(id);
    if (!room || room.state !== 'idle') return;
    const i = priority.indexOf(id);
    if (i >= 0) priority.splice(i, 1);
    priority.unshift(id);
    pump();
  }

  // ---- Panel ---------------------------------------------------------------
  for (const button of goButtons) {
    button.addEventListener('click', (e) => {
      const id = button.dataset.room;
      const room = rooms.get(id);
      if (!room) return;
      camera.position.fromArray(room.data.spawn);
      pitch = 0;
      applyRotation();
      currentRoom = id;
      setShown(id, true);
      loadFirst(id);
      writeUrl();
      // A mouse or touch click hands the keyboard back to the view, so W A S D
      // work straight away; keyboard activation (detail 0) keeps focus in the list.
      if (e.detail > 0) canvas.focus({ preventScroll: true });
    });
  }

  for (const box of boxes) {
    box.addEventListener('change', () => {
      const id = box.dataset.room;
      setShown(id, box.checked);
      if (box.checked) loadFirst(id);
      writeUrl();
    });
  }

  document.getElementById('show-all')?.addEventListener('click', () => {
    for (const id of rooms.keys()) setShown(id, true);
    pump();
    writeUrl();
  });
  document.getElementById('show-none')?.addEventListener('click', () => {
    for (const id of rooms.keys()) setShown(id, false);
    writeUrl();
  });

  document.getElementById('copy-link')?.addEventListener('click', () => {
    writeUrl();
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(location.href))
      .then(
        () => setStatus('Link copied', 2000),
        () => setStatus('Copy failed', 2500),
      );
  });

  const panel = document.getElementById('panel');
  const toggle = document.getElementById('panel-toggle');
  toggle?.addEventListener('click', () => {
    const open = panel.classList.toggle('panel--open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  // ---- Keyboard ------------------------------------------------------------
  const keys = new Set();
  const MOVE_KEYS = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'ShiftLeft', 'ShiftRight',
  ]);
  function ignoredTarget(t) {
    return t instanceof Element && !!t.closest('input, button, a, select, textarea');
  }
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (ignoredTarget(e.target)) return;
    if (!MOVE_KEYS.has(e.code)) return;
    keys.add(e.code);
    if (e.code.startsWith('Arrow')) e.preventDefault();
  });
  // Key-up always releases, wherever focus went, so a key cannot stick.
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  // ---- Speed (wheel) -------------------------------------------------------
  let speed = BASE_SPEED;
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    // One notch is about 100 px, 3 lines or 1 page, depending on deltaMode.
    const notches = e.deltaMode === 1 ? e.deltaY / 3 : e.deltaMode === 2 ? e.deltaY : e.deltaY / 100;
    if (!notches) return;
    speed = THREE.MathUtils.clamp(speed * Math.pow(WHEEL_FACTOR, -notches), MIN_SPEED, MAX_SPEED);
    setStatus(`Speed ${speed.toFixed(1)} m/s`, 1200);
  }, { passive: false });

  // ---- Look (pointer on the canvas) ----------------------------------------
  let lookId = null;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (lookId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    lookId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.focus({ preventScroll: true });
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookId) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    yaw -= dx * LOOK;
    pitch -= dy * LOOK;
    applyRotation();
    dirty = true;
  });
  const endLook = (e) => {
    if (e.pointerId !== lookId) return;
    lookId = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  canvas.addEventListener('pointerup', endLook);
  canvas.addEventListener('pointercancel', endLook);
  canvas.addEventListener('lostpointercapture', endLook);

  // ---- Stick (touch) -------------------------------------------------------
  const stick = document.getElementById('stick');
  const knob = stick?.querySelector('.stick-knob');
  let stickId = null;
  let stickCx = 0;
  let stickCy = 0;
  const stickVec = { x: 0, y: 0 }; // x: strafe right, y: forward; length <= 1
  function stickTo(dx, dy) {
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx *= STICK_RADIUS / len;
      dy *= STICK_RADIUS / len;
    }
    if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
    stickVec.x = dx / STICK_RADIUS;
    stickVec.y = -dy / STICK_RADIUS;
  }
  if (stick) {
    stick.addEventListener('pointerdown', (e) => {
      if (stickId !== null) return;
      e.preventDefault();
      stickId = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      const r = stick.getBoundingClientRect();
      stickCx = r.left + r.width / 2;
      stickCy = r.top + r.height / 2;
      stickTo(e.clientX - stickCx, e.clientY - stickCy);
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId !== stickId) return;
      stickTo(e.clientX - stickCx, e.clientY - stickCy);
    });
    const endStick = (e) => {
      if (e.pointerId !== stickId) return;
      stickId = null;
      if (stick.hasPointerCapture(e.pointerId)) stick.releasePointerCapture(e.pointerId);
      stickTo(0, 0);
    };
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);
    stick.addEventListener('lostpointercapture', endStick);
  }

  // ---- Loop ----------------------------------------------------------------
  const clock = new THREE.Clock();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const move = new THREE.Vector3();

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1); // no huge jump after a hidden tab

    // Heading on the horizontal plane only: looking down and pressing W does
    // not sink you. Yaw 0 looks down -Z, as three's camera does.
    forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));

    let f = 0;
    let s = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
    const keyLen = Math.hypot(f, s);
    if (keyLen > 1) {
      f /= keyLen;
      s /= keyLen;
    }
    let u = 0;
    if (keys.has('KeyE')) u += 1;
    if (keys.has('KeyQ')) u -= 1;

    const fast = keys.has('ShiftLeft') || keys.has('ShiftRight') ? FAST : 1;
    const keySpeed = speed * fast;

    move.set(0, 0, 0)
      .addScaledVector(forward, f * keySpeed + stickVec.y * BASE_SPEED)
      .addScaledVector(right, s * keySpeed + stickVec.x * BASE_SPEED);
    move.y += u * keySpeed;

    if (move.x !== 0 || move.y !== 0 || move.z !== 0) {
      camera.position.addScaledVector(move, dt);
      dirty = true;
    }

    if (dirty && performance.now() - lastUrlWrite >= URL_INTERVAL) writeUrl();

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  writeUrl();
  pump();
  requestAnimationFrame(frame);
}

function parseHash(hash) {
  const out = {};
  for (const part of hash.replace(/^#/, '').split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const key = eq < 0 ? part : part.slice(0, eq);
    const value = eq < 0 ? '' : part.slice(eq + 1);
    try {
      out[decodeURIComponent(key)] = decodeURIComponent(value);
    } catch {
      // A malformed escape: skip that pair.
    }
  }
  return out;
}

function parseCam(value) {
  if (!value) return null;
  const nums = value.split(',').map(Number);
  if (nums.length !== 5 || !nums.every(Number.isFinite)) return null;
  return nums;
}
