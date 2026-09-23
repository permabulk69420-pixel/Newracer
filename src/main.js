import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { buildWorld, groundHeight, nearestRoad, route } from './world.js';
import './style.css';

const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.35 : 1.8));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.17;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(.55);
document.querySelector('#app').appendChild(renderer.domElement);

const rig = new THREE.Group(); scene.add(rig);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, .07, 3200);
camera.rotation.order = 'YXZ'; camera.position.y = 1.68; rig.add(camera);
const start = route[0];
rig.position.copy(start.p).addScaledVector(start.side, -2.5);
camera.rotation.y = Math.atan2(-start.tangent.x, -start.tangent.z);
rig.position.y = start.p.y + .02;

// World generation is deliberately synchronous, so the first rendered frame
// contains the full coastline rather than objects popping in during movement.
const world = buildWorld(scene, true);
const loading = document.querySelector('#loading');
const intro = document.querySelector('#intro');
const hud = document.querySelector('#hud');
let started = false, highDetail = true;
function begin() {
  started = true; intro.classList.add('dismissed'); hud.classList.remove('hidden');
}
document.querySelector('#explore').addEventListener('click', begin);

if ('xr' in navigator) {
  const button = VRButton.createButton(renderer, { optionalFeatures: ['bounded-floor'] });
  button.id = 'VRButton'; document.body.appendChild(button);
}
renderer.xr.addEventListener('sessionstart', () => {
  begin(); document.querySelector('#vr-help').style.display = 'block';
  document.querySelector('#desktop-help').style.display = 'none';
  // Leave the Quest's eye resolution to the WebXR runtime and use foveation.
  renderer.xr.setFoveation(.55);
});
renderer.xr.addEventListener('sessionend', () => {
  document.querySelector('#vr-help').style.display = 'none';
  document.querySelector('#desktop-help').style.display = '';
});

document.querySelector('#quality').addEventListener('click', e => {
  highDetail = !highDetail;
  e.currentTarget.textContent = `DETAIL: ${highDetail ? 'HIGH' : 'ECO'}`;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, highDetail ? 1.45 : 1));
  renderer.xr.setFoveation(highDetail ? .55 : .8);
  for (const mesh of scene.userData.scatter || []) mesh.count = highDetail ? mesh.userData.fullCount : Math.ceil(mesh.userData.fullCount * .55);
});

const keys = new Set(), up = new THREE.Vector3(0, 1, 0), forward = new THREE.Vector3(), right = new THREE.Vector3();
const clock = new THREE.Clock();
let pointerDown = false, lastX = 0, lastY = 0, runningTouch = false;
window.addEventListener('keydown', e => { keys.add(e.code); if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); });
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
renderer.domElement.addEventListener('click', () => { if (started && !matchMedia('(pointer: coarse)').matches) renderer.domElement.requestPointerLock?.(); });
renderer.domElement.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') { pointerDown = true; lastX = e.clientX; lastY = e.clientY; } });
window.addEventListener('pointerup', () => { pointerDown = false; });
window.addEventListener('mousemove', e => {
  if (!started || renderer.xr.isPresenting) return;
  if (document.pointerLockElement === renderer.domElement || pointerDown) {
    const dx = document.pointerLockElement ? e.movementX : e.clientX - lastX;
    const dy = document.pointerLockElement ? e.movementY : e.clientY - lastY;
    camera.rotation.y -= dx * .0025;
    camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dy * .0023, -1.46, 1.46);
    lastX = e.clientX; lastY = e.clientY;
  }
});

function makePad(id, knobId) {
  const el = document.getElementById(id), knob = document.getElementById(knobId);
  const value = { x: 0, y: 0 };
  function update(e) {
    const b = el.getBoundingClientRect(), x = e.clientX - b.left - b.width / 2, y = e.clientY - b.top - b.height / 2;
    const len = Math.hypot(x, y), ratio = Math.min(len, 38) / (len || 1);
    value.x = x * ratio / 38; value.y = y * ratio / 38;
    knob.style.transform = `translate(${value.x * 38}px,${value.y * 38}px)`;
  }
  el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); update(e); });
  el.addEventListener('pointermove', e => { if (el.hasPointerCapture(e.pointerId)) update(e); });
  const release = () => { value.x = value.y = 0; knob.style.transform = ''; };
  el.addEventListener('pointerup', release); el.addEventListener('pointercancel', release);
  return value;
}
const movePad = makePad('move-pad', 'move-knob'), lookPad = makePad('look-pad', 'look-knob');
const run = document.querySelector('#run-button');
run.addEventListener('pointerdown', e => { run.setPointerCapture(e.pointerId); runningTouch = true; run.classList.add('pressed'); });
for (const event of ['pointerup', 'pointercancel']) run.addEventListener(event, () => { runningTouch = false; run.classList.remove('pressed'); });

function stick(axes) {
  if (!axes || !axes.length) return { x: 0, y: 0 };
  // Meta Touch controllers expose thumbsticks on axes 2/3; other XR profiles
  // can expose only 0/1. Prefer whichever pair has a meaningful reading.
  const latter = axes.length >= 4 && (Math.abs(axes[2]) + Math.abs(axes[3]) > .08);
  const x = axes[latter ? 2 : 0] || 0, y = axes[latter ? 3 : 1] || 0;
  return { x: Math.abs(x) < .13 ? 0 : x, y: Math.abs(y) < .13 ? 0 : y };
}
function xrInput() {
  let moveX = 0, moveY = 0, turn = 0, sprint = false;
  const session = renderer.xr.getSession();
  for (const source of session?.inputSources || []) {
    if (!source.gamepad) continue;
    const axis = stick(source.gamepad.axes);
    if (source.handedness === 'left') { moveX = axis.x; moveY = axis.y; }
    if (source.handedness === 'right') turn = axis.x;
    if (source.gamepad.buttons[1]?.pressed) sprint = true;
  }
  return { moveX, moveY, turn, sprint };
}
function floorAt(x, z) {
  const nearby = nearestRoad(x, z);
  return nearby.sample && nearby.distance < 7.4 ? nearby.sample.p.y + .03 : Math.max(-8.9, groundHeight(x, z));
}
let labelTimer = 0;
function animate() {
  const dt = Math.min(clock.getDelta(), .05), elapsed = clock.elapsedTime;
  world.time.value = elapsed;
  if (started || renderer.xr.isPresenting) {
    const xr = renderer.xr.isPresenting;
    const input = xr ? xrInput() : {
      moveX: (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + movePad.x,
      moveY: (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + movePad.y,
      turn: lookPad.x, sprint: keys.has('ShiftLeft') || keys.has('ShiftRight') || runningTouch
    };
    if (xr) rig.rotation.y -= input.turn * dt * 1.9;
    else {
      camera.rotation.y -= input.turn * dt * 2.3;
      camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - lookPad.y * dt * 1.45, -1.46, 1.46);
    }
    (xr ? renderer.xr.getCamera(camera) : camera).getWorldDirection(forward);
    forward.y = 0; forward.normalize(); right.crossVectors(forward, up).normalize();
    const x = input.moveX, y = input.moveY, length = Math.max(1, Math.hypot(x, y));
    const speed = input.sprint ? 32 : 16;
    rig.position.addScaledVector(right, x / length * speed * dt);
    rig.position.addScaledVector(forward, -y / length * speed * dt);
    rig.position.x = THREE.MathUtils.clamp(rig.position.x, -1850, 1850);
    rig.position.z = THREE.MathUtils.clamp(rig.position.z, -1850, 1850);
    const floor = floorAt(rig.position.x, rig.position.z);
    rig.position.y = floor > rig.position.y ? floor : THREE.MathUtils.damp(rig.position.y, floor, 13, dt);
    labelTimer += dt;
    if (labelTimer > .55) {
      labelTimer = 0;
      const nearest = nearestRoad(rig.position.x, rig.position.z);
      document.querySelector('#position').textContent = nearest.distance < 25
        ? `${(nearest.sample.distance / 1000).toFixed(2)} KM / ${(world.routeLength / 1000).toFixed(1)} KM`
        : nearest.distance < 115 ? 'RIDGELINE' : 'WILD COAST';
    }
  }
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
requestAnimationFrame(() => { loading.classList.add('done'); window.__worldReady = true; });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
window.__newracer = { rig, camera, scene, renderer, route, floorAt };
