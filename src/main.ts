import './style.css';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import '@babylonjs/core/Shaders/shadowMap.vertex';
import '@babylonjs/core/Shaders/shadowMap.fragment';
import { Ray } from '@babylonjs/core/Culling/ray';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { buildArena } from './arena';
import { updatePatrol } from './patrol';
import { settingsMarkup, setupSettings } from './settings';
import { RangeAudio } from './audio';
import { bulletDamage, resolveCover, traceCover } from './ballistics';
import { ImpactMarks } from './impacts';
import { buildRifle } from './weapon';
import { BOLT_SECONDS, MAGAZINE_SIZE, movePlayer, RELOAD_SECONDS, Rifle, type Player } from './simulation';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <canvas id="game" aria-label="First-person quickscope practice arena"></canvas>
  <div id="vignette"></div>
  <div id="scope" aria-hidden="true"><div class="scope-circle"><div class="reticle-h"></div><div class="reticle-v"></div><div class="reticle-center"></div><span class="scope-number">4× / MIL-DOT</span><div class="scope-ticks">┊　┊　┊　┊　┊　┊　┊</div></div></div>
  <div id="hud" hidden>
    <header class="hud-top"><div class="wordmark">DEADBOLT<span>RANGE / 07</span></div><div class="session-info"><span class="live-dot"></span> SOLO PRACTICE <b id="timer">00:00</b><button id="settings-hud" aria-label="Open settings">⚙</button><button id="pause" aria-label="Pause game">Ⅱ</button></div></header>
    <div class="stats"><div><span>ELIMINATIONS</span><b id="kills">00</b></div><div><span>ACCURACY</span><b id="accuracy">—</b></div><div><span>QUICKSCOPES</span><b id="quicks">00</b></div></div>
    <div id="crosshair"><i></i><i></i><i></i><i></i><b></b></div>
    <div id="hitmarker"></div><div id="feedback"><b></b><span></span></div>
    <div id="notification"></div>
    <footer class="hud-bottom"><div class="location"><span class="small-label">SECTOR 07</span><b>THE SCRAPYARD</b><span id="input-hint">WASD MOVE &nbsp; / &nbsp; RMB AIM &nbsp; / &nbsp; R RELOAD &nbsp; / &nbsp; ESC PAUSE</span></div><div class="weapon-status"><span class="small-label">BOLT-ACTION / .408</span><b>INTERVENTION <span>01</span></b><div class="ammo"><strong id="ammo">05</strong><span>/ ∞</span><div id="rounds"></div></div><div class="action-status"><span id="action">READY</span><div class="action-track"><i id="action-progress"></i></div></div></div></footer>
    <div id="fps"></div>
  </div>
  <div id="menu">
    <header class="menu-top"><div class="wordmark">DB<span>DEADBOLT / FIELD LAB</span></div><span class="prototype"><i></i> PLAYABLE PROTOTYPE <b>V.01</b></span></header>
    <main class="menu-content"><section class="intro"><div class="eyebrow"><span>01 / THE SCRAPYARD</span><i></i> SINGLE PLAYER</div><h1>ONE SHOT.<br><em>MAKE IT COUNT.</em></h1><p>A rifle. A dusty yard. The split second<br>between lining it up and landing the shot.</p><div class="tags"><span>INTERVENTION ONLY</span><span>9 PATROLLING ENEMIES</span><span>FREE ROAM</span></div><div class="menu-actions"><button id="play" class="play-button"><span id="play-label">ENTER THE RANGE</span><span>↗</span></button><button id="settings-open" class="menu-settings" aria-label="Open settings">⚙ <span>SETTINGS</span></button></div><div class="start-note" id="start-note">Mouse + keyboard recommended · click to capture mouse</div><p id="error" role="alert"></p></section>
    <aside class="range-panel"><div class="panel-heading"><span>FIELD NOTES</span><b>QUICKSCOPE / 101</b></div><div class="lesson"><span>01</span><div><b>Line it up.</b><p>Keep the target near your crosshair as you move.</p></div></div><div class="lesson"><span>02</span><div><b>Scope. Fire. Release.</b><p>Hold right click and fire as the scope settles. Hits in the first 180 ms of accuracy earn a quickscope bonus.</p></div></div><div class="lesson"><span>03</span><div><b>Keep moving.</b><p>The bolt needs a moment. Reposition, then take the next shot. Enemies patrol the yard and return after 2 seconds.</p></div></div></aside></main>
    <footer class="menu-bottom"><div><kbd>W A S D</kbd> MOVE <kbd>SHIFT</kbd> SPRINT <kbd>SPACE</kbd> JUMP <kbd>C</kbd> CROUCH</div><div><kbd>RMB</kbd> AIM <kbd>Q</kbd> TOGGLE AIM <kbd>LMB</kbd> FIRE <kbd>R</kbd> RELOAD <kbd>V</kbd> INSPECT <kbd>ESC</kbd> PAUSE</div><button id="fullscreen" aria-label="Toggle fullscreen">⛶ FULLSCREEN</button></footer>
  </div>
  ${settingsMarkup}
  <div id="loading"><span>DEADBOLT</span><p>PREPARING THE RANGE…</p></div>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const menu = $('menu'), hud = $('hud');
const audio = new RangeAudio();
let engine: Engine;
try { engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false }); }
catch { $('loading').innerHTML = '<span>WEBGL UNAVAILABLE</span><p>Open this game in a browser with hardware acceleration enabled.</p>'; throw new Error('WebGL unavailable'); }
engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5));
const scene = new Scene(engine);
scene.clearColor = new Color4(0.79, 0.78, 0.72, 1);
scene.fogMode = Scene.FOGMODE_EXP2; scene.fogDensity = 0.007;
scene.fogColor = new Color3(0.79, 0.78, 0.72);
scene.imageProcessingConfiguration.contrast = 1.12;
scene.imageProcessingConfiguration.exposure = 1.15;
scene.imageProcessingConfiguration.toneMappingEnabled = true;
scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
const camera = new FreeCamera('player camera', new Vector3(0, 1.65, -23), scene);
camera.minZ = 0.05; camera.maxZ = 250; camera.fov = 0.98; camera.inputs.clear();
const ambient = new HemisphericLight('sky', new Vector3(0.3, 1, 0.2), scene);
ambient.intensity = 0.48; ambient.diffuse = new Color3(0.80, 0.88, 1); ambient.groundColor = new Color3(0.34, 0.29, 0.22);
const sun = new DirectionalLight('late afternoon sun', new Vector3(-0.6, -1, 0.4), scene);
sun.position.set(25, 45, -30); sun.intensity = 2.3; sun.diffuse = new Color3(1, 0.9, 0.75);
sun.shadowMinZ = 1; sun.shadowMaxZ = 110; sun.autoCalcShadowZBounds = true;
const shadows = new ShadowGenerator(2048, sun); shadows.usePercentageCloserFiltering = true;
shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM; shadows.bias = 0.0008; shadows.normalBias = 0.035; shadows.setDarkness(0.12);
const arena = buildArena(scene, shadows);
const viewmodel = buildRifle(scene, camera);
viewmodel.root.setEnabled(false);
const rifle = new Rifle();
const player: Player = { x: 0, y: 0, z: -23, vy: 0, grounded: true };
const keys = new Set<string>();
let now = 0, running = false, started = false, dragging = false, fallback = false;
let aimingMouse = false, aimingToggle = false, pendingFire = false, pendingJump = false;
let mouseFiredOnDown = false, dragDistance = 0;
let yaw = 0, pitch = 0.024, recoil = 0, bob = 0, eyeHeight = 1.65;
let sensitivity = 1, adsSeconds = 0.18, movingTargets = true, invertY = false;
let kills = 0, quicks = 0, hits = 0, points = 0, hitUntil = 0, feedbackUntil = 0;
let lastShot = -10, boltSoundAt = 0, lastStep = 0, notificationUntil = 0;
let inspectStarted = -10;
let accumulator = 0, lastFrame = performance.now(), lastHud = 0;
const impacts = new ImpactMarks(scene);
function notify(message: string) { $('notification').textContent = message; notificationUntil = now + 2.5; }
function clearInput() { keys.clear(); aimingMouse = aimingToggle = false; dragging = false; pendingFire = false; pendingJump = false; mouseFiredOnDown = false; dragDistance = 0; }
function pause() {
  if (!running) return;
  running = false; clearInput(); hud.hidden = true; menu.hidden = false;
  $('play-label').textContent = 'RETURN TO THE RANGE';
  $('start-note').textContent = `${kills} eliminations · ${quicks} quickscopes · ${points.toLocaleString()} points`;
  if (document.pointerLockElement) document.exitPointerLock();
}
async function play() {
  $('error').textContent = '';
  try { await audio.start(); } catch { /* The game also works without audio. */ }
  try {
    await canvas.requestPointerLock();
    fallback = document.pointerLockElement !== canvas;
  } catch { fallback = true; }
  started = true; running = true; clearInput(); menu.hidden = true; hud.hidden = false;
  viewmodel.root.setEnabled(true); canvas.focus(); lastFrame = performance.now(); accumulator = 0;
  if (fallback) {
    $('input-hint').textContent = 'DRAG / ARROWS LOOK / Q AIM / CLICK FIRE / V INSPECT / ESC PAUSE';
    notify('Mouse capture unavailable: drag to look, Q to toggle aim.');
  } else $('input-hint').textContent = 'WASD MOVE / RMB AIM / R RELOAD / V INSPECT / ESC PAUSE';
}
function reset() {
  Object.assign(player, { x: 0, y: 0, z: -23, vy: 0, grounded: true });
  yaw = recoil = now = bob = 0; pitch = 0.024; kills = quicks = hits = points = 0;
  Object.assign(rifle, { ammo: MAGAZINE_SIZE, readyAt: 0, reloadAt: 0, shots: 0, ads: 0, accurateSince: -Infinity });
  lastShot = -10; boltSoundAt = lastStep = hitUntil = feedbackUntil = notificationUntil = 0;
  inspectStarted = -10;
  impacts.clear();
  arena.targets.forEach(t => { t.respawnAt = 0; t.root.setEnabled(true); t.reset(); });
  clearInput(); $('start-note').textContent = 'Practice reset · ready for another run';
  updateHud();
}
$('play').addEventListener('click', play);
$('pause').addEventListener('click', pause);
$('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { $('error').textContent = 'Fullscreen is unavailable in this browser panel. You can still play in the window.'; }
});
document.addEventListener('pointerlockchange', () => { if (running && !fallback && document.pointerLockElement !== canvas) pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('blur', () => { if (running) pause(); });
document.addEventListener('contextmenu', event => { if (event.target === canvas || running) event.preventDefault(); });
window.addEventListener('keydown', e => {
  if (!running) return;
  if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ControlLeft', 'KeyC', 'KeyQ'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  // Keyboard look also works in embedded panels that only deliver clicks during a drag.
  if (fallback && e.code.startsWith('Arrow')) {
    e.preventDefault();
    const lookScale = 1 - rifle.ads * .68;
    if (e.code === 'ArrowLeft') yaw -= .07 * lookScale;
    if (e.code === 'ArrowRight') yaw += .07 * lookScale;
    if (e.code === 'ArrowUp') pitch = Math.max(-1.45, Math.min(1.45, pitch - .05 * lookScale * (invertY ? -1 : 1)));
    if (e.code === 'ArrowDown') pitch = Math.max(-1.45, Math.min(1.45, pitch + .05 * lookScale * (invertY ? -1 : 1)));
  }
  if (e.code === 'Space' && !e.repeat) pendingJump = true;
  if (e.code === 'KeyQ' && !e.repeat) aimingToggle = !aimingToggle;
  if (e.code === 'KeyV' && !e.repeat && !rifle.reloadAt && rifle.ads < 0.05) inspectStarted = now;
  if (e.code === 'KeyR' && !e.repeat && rifle.reload(now)) { audio.reload(); notify('Reloading'); }
  if (e.code === 'Escape') pause();
});
window.addEventListener('keyup', e => keys.delete(e.code));
canvas.addEventListener('mousedown', e => {
  if (!running) return;
  if (e.button === 0) {
    dragDistance = 0;
    if (fallback) dragging = true;
    else { pendingFire = true; mouseFiredOnDown = true; }
  }
  if (e.button === 2) aimingMouse = true;
});
// Some embedded browser panels deliver clicks without mouse-down events.
// In drag mode, looking around should not consume a round.
canvas.addEventListener('click', e => {
  if (running && e.button === 0 && !mouseFiredOnDown && dragDistance < 5) pendingFire = true;
  mouseFiredOnDown = false; dragDistance = 0;
});
window.addEventListener('mouseup', e => { if (e.button === 0) dragging = false; if (e.button === 2) aimingMouse = false; });
window.addEventListener('mousemove', e => {
  if (!running || (document.pointerLockElement !== canvas && !dragging)) return;
  if (dragging) dragDistance += Math.hypot(e.movementX, e.movementY);
  const scale = 0.0021 * sensitivity * (1 - rifle.ads * 0.68);
  yaw += e.movementX * scale;
  pitch = Math.max(-1.45, Math.min(1.45, pitch + e.movementY * scale * (invertY ? -1 : 1)));
});

const settings = setupSettings({
  sensitivity: value => { sensitivity = value; }, ads: value => { adsSeconds = value / 1000; },
  volume: value => { audio.volume = value / 100; }, walking: value => { movingTargets = value; },
  invert: value => { invertY = value; }, fps: value => { $('fps').hidden = !value; },
  impacts: value => impacts.setEnabled(value),
  shadows: value => {
    scene.shadowsEnabled = value !== 'off';
    if (value !== 'off') {
      shadows.mapSize = value === 'high' ? 2048 : 1024;
      shadows.filteringQuality = value === 'high' ? ShadowGenerator.QUALITY_MEDIUM : ShadowGenerator.QUALITY_LOW;
    }
  },
  resolution: value => {
    const scale = value === 'performance' ? 1.25 : value === 'sharp'
      ? 1 / Math.max(1.25, Math.min(window.devicePixelRatio, 2)) : 1 / Math.min(window.devicePixelRatio, 1.5);
    engine.setHardwareScalingLevel(scale);
  },
  resetPractice: reset,
});
for (const id of ['settings-open', 'settings-hud']) $(id).addEventListener('click', () => { pause(); $('settings-open').focus(); settings.open(); });

function fire() {
  inspectStarted = -10;
  const shot = rifle.fire(now);
  if (!shot) { if (!rifle.ammo && !rifle.reloadAt) { audio.dry(); notify('Magazine empty — press R to reload'); } return; }
  lastShot = now; boltSoundAt = now + 0.35; recoil = 1; audio.shot();
  // Scope accuracy is deliberately independent of the scope's visual animation.
  const spread = shot.scoped ? (player.grounded ? 0.00035 : 0.005) : 0.045 * (1 - rifle.ads * 0.7);
  const forward = new Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const up = Vector3.Cross(forward, right).normalize();
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
  const direction = forward.add(right.scale(Math.cos(a) * r)).add(up.scale(Math.sin(a) * r)).normalize();
  const ray = new Ray(new Vector3(player.x, player.y + eyeHeight, player.z), direction, 180);
  // Pick only the nearest live enemy. Static cover uses its cached, unmerged geometry.
  const pick = scene.pickWithRay(ray, mesh => mesh.isEnabled() && mesh.metadata?.target !== undefined);
  const result = resolveCover(traceCover(ray, arena.cover), direction, pick?.hit ? pick.distance : Infinity);
  result.impacts.forEach(impact => impacts.stamp(impact, now));
  const coverLabel = Array.from(new Set(result.materials)).join(' + ').toUpperCase();
  if (result.energy <= 0 || !pick?.hit || !pick.pickedMesh) {
    if (result.stopped || result.penetrations) {
      feedbackUntil = now + 1.2;
      $('feedback').querySelector('b')!.textContent = result.stopped ? 'COVER HIT' : 'PENETRATED';
      $('feedback').querySelector('span')!.textContent = result.stopped
        ? `STOPPED BY ${result.stopped.toUpperCase()}` : `${coverLabel} / ${bulletDamage(result.energy, false)} DAMAGE REMAINING`;
    }
    return;
  }
  const metadata = pick.pickedMesh.metadata, target = arena.targets[metadata.target];
  if (target.respawnAt) return;
  const damage = bulletDamage(result.energy, !!metadata.head);
  target.health = Math.max(0, target.health - damage);
  const eliminated = target.health === 0, throughCover = result.penetrations > 0;
  hits++; hitUntil = now + .19; feedbackUntil = now + 1.4;
  $('hitmarker').classList.toggle('headshot', !!metadata.head);
  audio.hit(!!metadata.head);
  if (eliminated) {
    target.root.setEnabled(false); target.respawnAt = now + 2;
    kills++; if (shot.quickscope) quicks++;
    const reward = (metadata.head ? 150 : 100) + (shot.quickscope ? 50 : 0); points += reward;
    $('feedback').querySelector('b')!.textContent = throughCover
      ? (metadata.head ? 'WALLBANG HEADSHOT' : shot.quickscope ? 'WALLBANG QUICKSCOPE' : 'WALLBANG')
      : shot.quickscope ? 'QUICKSCOPE' : metadata.head ? 'HEADSHOT' : 'TARGET DOWN';
    $('feedback').querySelector('span')!.textContent = `+${reward} / ${damage} DMG${throughCover ? ` / ${coverLabel}` : ''}`;
  } else {
    $('feedback').querySelector('b')!.textContent = throughCover ? 'HIT THROUGH COVER' : 'HIT';
    $('feedback').querySelector('span')!.textContent = `${damage} DMG / ${target.health} HP${throughCover ? ` / ${coverLabel}` : ''}`;
  }
}

function fixedUpdate(dt: number) {
  now += dt;
  const crouching = keys.has('KeyC') || keys.has('ControlLeft');
  const aiming = aimingMouse || aimingToggle;
  if (aiming || rifle.reloadAt) inspectStarted = -10;
  rifle.update(now, dt, aiming, adsSeconds);
  let mx = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  let mz = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  const len = Math.hypot(mx, mz); if (len > 0) { mx /= len; mz /= len; }
  const sprint = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && !aiming && !crouching;
  const speed = crouching ? 2.5 : aiming ? 3.6 : sprint ? 8 : 5.2;
  const dx = (mx * Math.cos(yaw) + mz * Math.sin(yaw)) * speed * dt;
  const dz = (mz * Math.cos(yaw) - mx * Math.sin(yaw)) * speed * dt;
  if (pendingJump && player.grounded && !crouching) { player.vy = 7.4; player.grounded = false; }
  pendingJump = false;
  // Keep the full collision height while crouching to avoid standing up inside geometry.
  movePlayer(player, dx, dz, dt, arena.solids);
  eyeHeight += ((crouching ? 1.05 : 1.65) - eyeHeight) * Math.min(1, dt * 14);
  if (len && player.grounded) {
    bob += dt * (sprint ? 14 : 10);
    if (now - lastStep > (sprint ? 0.27 : 0.4)) { audio.step(); lastStep = now; }
  }
  recoil = Math.max(0, recoil - dt * 5.5);
  if (boltSoundAt && now >= boltSoundAt) { audio.bolt(); boltSoundAt = 0; }
  for (const target of arena.targets) {
    if (target.respawnAt && now >= target.respawnAt) { target.reset(); target.root.setEnabled(true); target.respawnAt = 0; }
    if (target.respawnAt) continue;
    const blockers = [player, ...arena.targets.filter(other => other !== target && !other.respawnAt && Math.abs(other.home.y - target.home.y) < .5).map(other => other.patrol)]
      .filter(blocker => 'y' in blocker ? Math.abs(blocker.y - target.home.y) < .5 : true);
    updatePatrol(target.patrol, dt, movingTargets, blockers);
    target.animate(dt, now);
  }
  camera.position.set(player.x, player.y + eyeHeight + (len && player.grounded ? Math.sin(bob) * 0.022 * (1 - rifle.ads) : 0), player.z);
  camera.rotation.set(pitch - recoil * 0.065, yaw, 0);
  camera.fov = 0.98 + (0.235 - 0.98) * smooth(rifle.ads);
  if (pendingFire) { pendingFire = false; fire(); }
  impacts.update(now);
}
const smooth = (v: number) => v * v * (3 - 2 * v);
function updateHud() {
  $('kills').textContent = String(kills).padStart(2, '0');
  $('quicks').textContent = String(quicks).padStart(2, '0');
  $('accuracy').textContent = rifle.shots ? `${Math.round(hits / rifle.shots * 100)}%` : '—';
  $('ammo').textContent = String(rifle.ammo).padStart(2, '0');
  $('rounds').innerHTML = Array.from({ length: MAGAZINE_SIZE }, (_, i) => `<i class="${i < rifle.ammo ? 'loaded' : ''}"></i>`).join('');
  $('timer').textContent = `${String(Math.floor(now / 60)).padStart(2, '0')}:${String(Math.floor(now % 60)).padStart(2, '0')}`;
  let progress = 1, status = 'READY';
  if (rifle.reloadAt) { status = 'RELOADING'; progress = 1 - (rifle.reloadAt - now) / RELOAD_SECONDS; }
  else if (rifle.readyAt > now) { status = 'CYCLING BOLT'; progress = 1 - (rifle.readyAt - now) / BOLT_SECONDS; }
  else if (!rifle.ammo) { status = 'R / RELOAD'; progress = 0; }
  else if (rifle.ads >= 0.72) status = now - rifle.accurateSince <= 0.18 ? 'QUICKSCOPE WINDOW' : 'SCOPE READY';
  $('action').textContent = status; $('action-progress').style.width = `${Math.max(0, progress) * 100}%`;
  $('action').classList.toggle('ready', rifle.ads >= 0.72 && !rifle.reloadAt);
  $('fps').textContent = `${Math.round(engine.getFps())} FPS`;
}
engine.runRenderLoop(() => {
  const frame = performance.now(), dt = Math.min((frame - lastFrame) / 1000, 0.05); lastFrame = frame;
  if (running) {
    accumulator += dt;
    while (accumulator >= 1 / 120) { fixedUpdate(1 / 120); accumulator -= 1 / 120; }
    const ads = smooth(rifle.ads), shotAge = now - lastShot;
    const sway = keys.size ? Math.sin(bob) * 0.008 * (1 - ads) : Math.sin(now * 1.5) * 0.0015;
    const reloadT = rifle.reloadAt ? 1 - (rifle.reloadAt - now) / RELOAD_SECONDS : 0;
    const inspectT = (now - inspectStarted) / 2.4;
    const inspect = inspectT >= 0 && inspectT < 1 ? Math.sin(inspectT * Math.PI) : 0;
    viewmodel.updatePose(ads, recoil, sway, shotAge, reloadT, !!rifle.reloadAt, inspect);
    viewmodel.root.setEnabled(rifle.ads < 0.75);
    viewmodel.flash.setEnabled(shotAge < 0.045);
    $('scope').style.opacity = String(Math.max(0, Math.min(1, (rifle.ads - 0.55) / 0.2)));
    $('scope').classList.toggle('accurate', rifle.ads >= 0.72);
    $('crosshair').style.opacity = String(1 - Math.min(1, rifle.ads * 2));
    $('crosshair').style.setProperty('--spread', `${10 + (!player.grounded ? 13 : 0) + recoil * 12}px`);
    $('hitmarker').style.opacity = now < hitUntil ? '1' : '0';
    $('feedback').style.opacity = now < feedbackUntil ? '1' : '0';
    $('notification').style.opacity = now < notificationUntil ? '1' : '0';
    if (frame - lastHud > 80) { updateHud(); lastHud = frame; }
  } else if (!started) {
    const t = frame / 1000;
    camera.position.set(24 + Math.sin(t * 0.035) * 2, 15, -27);
    camera.setTarget(new Vector3(0, 3.5, 3));
  }
  if (!running) { $('scope').style.opacity = '0'; viewmodel.root.setEnabled(false); }
  scene.render();
});
window.addEventListener('resize', () => engine.resize());
scene.executeWhenReady(() => { $('loading').hidden = true; });
