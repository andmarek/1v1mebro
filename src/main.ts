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
import { settingsMarkup, setupSettings } from './settings';
import { RangeAudio, type FootstepSurface } from './audio';
import { bulletDamage, resolveCover, traceCover } from './ballistics';
import { ImpactMarks } from './impacts';
import { buildRifle } from './weapon';
import { buildPistol } from './pistol';
import { type WeaponSlot } from './loadout';
import { ViewMotion, WALK_BOB_RATE, SPRINT_BOB_RATE, CROUCH_BOB_RATE } from './viewMotion';
import { DEFAULT_MATCH_RULES, allowsDamage, type MatchRules, type CombatVector, type DamageSource } from './match';
import { matchSetupMarkup, setupMatch } from './matchSetup';
import { selectMeleeTarget, MELEE_DAMAGE } from './melee';
import { buildKnife } from './knife';
import { playerHitDistance } from './botCombat';
import { CombatEffects } from './combatEffects';
import { MatchSimulation } from './matchSimulation';
import { DEFAULT_ROUND_OPTIONS, type RoundOptions } from './rounds';
import { roundUIMarkup, setupRoundUI } from './roundUI';
import { RoundOutro } from './roundOutro';
import { ReplayRecorder, type KillReplay } from './killReplay';
import { ReplayScene } from './replayScene';
import { ARENA_SPAWNS, INITIAL_SPAWN, chooseSpawn, type SpawnPoint } from './spawning';
import { combatFeedbackMarkup, setupCombatFeedback } from './combatFeedback';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <canvas id="game" aria-label="First-person quickscope practice arena"></canvas>
  <div id="vignette"></div><div id="damage-overlay"></div>
  <div id="scope" aria-hidden="true"><div class="scope-circle"><div class="reticle-h"></div><div class="reticle-v"></div><div class="reticle-center"></div><span class="scope-number">4× / MIL-DOT</span><div class="scope-ticks">┊　┊　┊　┊　┊　┊　┊</div></div></div>
  <div id="hud" hidden>
    <header class="hud-top"><div class="wordmark">DEADBOLT<span>RANGE / 07</span></div><div class="session-info"><span class="live-dot"></span> <span id="mode-label">SOLO PRACTICE</span> <b id="timer">00:00</b><button id="settings-hud" aria-label="Open settings">⚙</button><button id="pause" aria-label="Pause game">Ⅱ</button></div></header>
    <div class="stats"><div><span>ELIMINATIONS</span><b id="kills">00</b></div><div><span>ACCURACY</span><b id="accuracy">—</b></div><div><span>QUICKSCOPES</span><b id="quicks">00</b></div><div><span>DEATHS</span><b id="deaths">00</b></div></div>
    <div id="respawn-screen" hidden><b>ELIMINATED</b><span id="respawn-label"></span></div>
    <div id="crosshair"><i></i><i></i><i></i><i></i><b></b></div>
    ${combatFeedbackMarkup}<div id="hitmarker"></div><div id="feedback"><b></b><span></span></div>
    <div id="notification"></div>
    <footer class="hud-bottom"><div class="location"><span class="small-label">SECTOR 07</span><b>THE SCRAPYARD</b><div class="health-status" id="health-status"><span>HP</span><b id="health">100</b><div class="health-track"><i id="health-bar"></i></div><span id="protection"></span></div><span id="input-hint">WASD MOVE &nbsp; / &nbsp; RMB AIM &nbsp; / &nbsp; R RELOAD &nbsp; / &nbsp; ESC PAUSE</span></div><div class="weapon-status"><div class="loadout-slots"><span id="slot-rifle" class="selected"><kbd>1</kbd> INTERVENTION</span><span id="slot-pistol"><kbd>2</kbd> FIELD-9</span></div><span class="small-label" id="weapon-label">BOLT-ACTION / .408</span><b id="weapon-name">INTERVENTION <span>01</span></b><div class="ammo"><strong id="ammo">05</strong><span>/ ∞</span><div id="rounds"></div></div><div class="action-status"><span id="action">READY</span><div class="action-track"><i id="action-progress"></i></div></div></div></footer>
    <div id="fps"></div>
  </div>
  <div id="menu">
    <header class="menu-top"><div class="wordmark">DB<span>DEADBOLT / FIELD LAB</span></div><span class="prototype"><i></i> PLAYABLE PROTOTYPE <b>V.01</b></span></header>
    <main class="menu-content"><section class="intro"><div class="eyebrow"><span>01 / THE SCRAPYARD</span><i></i> SINGLE PLAYER</div><h1>ONE SHOT.<br><em>MAKE IT COUNT.</em></h1><p>A rifle. A sidearm. A dusty yard. The split second<br>between lining it up and landing the shot.</p><div class="tags"><span>SNIPER + SIDEARM</span><span>9 PATROLLING ENEMIES</span><span>FREE ROAM</span></div><div id="active-rules" class="match-rule-summary"></div><div class="menu-actions"><button id="play" class="play-button"><span id="play-label">CREATE MATCH</span><span>↗</span></button><button id="settings-open" class="menu-settings" aria-label="Open settings">⚙ <span>SETTINGS</span></button><button id="new-match" class="menu-settings" hidden>NEW MATCH</button></div><div class="start-note" id="start-note">Mouse + keyboard recommended · click to capture mouse</div><p id="error" role="alert"></p></section>
    <aside class="range-panel"><div class="panel-heading"><span>FIELD NOTES</span><b>QUICKSCOPE / 101</b></div><div class="lesson"><span>01</span><div><b>Line it up.</b><p>Keep the target near your crosshair as you move.</p></div></div><div class="lesson"><span>02</span><div><b>Scope. Fire. Release.</b><p>Aim with right click and fire as the scope settles. Hits in the first 180 ms of accuracy earn a quickscope bonus.</p></div></div><div class="lesson"><span>03</span><div><b>Keep moving.</b><p>Sprint with Shift. Jump with Space and steer with A/D. Swap to your sidearm with Q or the mouse wheel while the bolt cycles.</p></div></div></aside></main>
    <footer class="menu-bottom"><div><kbd>W A S D</kbd> MOVE <kbd>SHIFT</kbd> SPRINT <kbd>SPACE</kbd> JUMP <kbd>C</kbd> CROUCH</div><div><kbd>RMB</kbd> AIM <kbd>Q</kbd> SWAP <kbd>LMB</kbd> FIRE <kbd>R</kbd> RELOAD <kbd>1 / 2</kbd> SELECT <kbd>V</kbd> INSPECT <kbd>E</kbd> KNIFE <kbd>ESC</kbd> PAUSE</div><button id="fullscreen" aria-label="Toggle fullscreen">⛶ FULLSCREEN</button></footer>
  </div>
  ${settingsMarkup}
  ${matchSetupMarkup}
  ${roundUIMarkup}
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
const pistolModel = buildPistol(scene, camera); pistolModel.root.setEnabled(false);
const simulation = new MatchSimulation(arena.targets.map(target => ({ id: target.index, home: target.home, patrol: target.patrol })));
const { loadout, melee, bots: botCombat, life, player, movement } = simulation;
let roundOptions: RoundOptions = { ...DEFAULT_ROUND_OPTIONS };
let previousSpawnId = INITIAL_SPAWN.id;
const combatFeedback = setupCombatFeedback(id => id === 'player' ? 'YOU' : `ENEMY ${String(Number(id.slice(4)) + 1).padStart(2, '0')}`);
const knifeModel = buildKnife(scene, camera);
const combatEffects = new CombatEffects(scene);
const outro = new RoundOutro();
const replayScene = new ReplayScene(camera, [...arena.targets.map(target => target.root), viewmodel.root, pistolModel.root, knifeModel.root]);
const recorder = new ReplayRecorder(replayScene.width);
let replay: KillReplay | null = null;
let pendingReplay = false, replayWasShowing = false;
let finalKiller = '';
let replayHitUntil = -Infinity, replayHeadshot = false;
let outroCuePlayed = false;
let rules: MatchRules = { ...DEFAULT_MATCH_RULES };
let damageUntil = 0, lastAttacker = 0;
const viewMotion = new ViewMotion();
const keys = new Set<string>();
let now = 0, running = false, started = false, dragging = false, fallback = false;
let aimingMouse = false, aimingToggle = false, pendingFire = false, pendingJump = false;
let toggleAim = false, rightMouseDownHandled = false;
let mouseFiredOnDown = false, dragDistance = 0;
let yaw = 0, pitch = 0.024, eyeHeight = 1.65;
let cameraEyeY = 1.65, stepDistance = 0, travelSpeed = 0, sprinting = false;
let sensitivity = 1, adsSeconds = 0.18, movingTargets = true, invertY = false;
let kills = 0, quicks = 0, hits = 0, points = 0, hitUntil = 0, feedbackUntil = 0;
let boltSoundAt = 0, notificationUntil = 0;
let inspectStarted = -10;
let accumulator = 0, lastFrame = performance.now(), lastHud = 0;
const impacts = new ImpactMarks(scene);
function notify(message: string) { $('notification').textContent = message; notificationUntil = now + 2.5; }
function clearInput() { movement.cancelJump(); keys.clear(); aimingMouse = aimingToggle = rightMouseDownHandled = false; dragging = false; pendingFire = false; pendingJump = false; mouseFiredOnDown = false; dragDistance = 0; }
function pause() {
  if (!running) return;
  updateHud(); running = false; audio.setActive(false); clearInput(); hud.hidden = true; menu.hidden = false;
  $('play-label').textContent = 'RETURN TO THE RANGE';
  $('start-note').textContent = `${kills} eliminations · ${life.deaths} deaths · ${points.toLocaleString()} points`;
  if (document.pointerLockElement) document.exitPointerLock();
}
async function play() {
  $('error').textContent = '';
  try { await audio.start(); } catch { /* The game also works without audio. */ }
  try {
    await canvas.requestPointerLock();
    fallback = document.pointerLockElement !== canvas;
  } catch { fallback = true; }
  started = true; $('new-match').hidden = false; running = true; clearInput(); menu.hidden = true; hud.hidden = false;
  audio.setActive(true);
  viewMotion.resetLook(yaw, pitch);
  canvas.focus(); lastFrame = performance.now(); accumulator = 0;
  if (fallback) {
    $('input-hint').textContent = 'DRAG / ARROWS LOOK / RMB AIM / Q SWAP / E KNIFE / CLICK FIRE / ESC PAUSE';
    notify('Drag or use arrows to look. Toggle aim is available in Controls.');
  } else $('input-hint').textContent = 'WASD MOVE / RMB AIM / Q SWAP / E KNIFE / R RELOAD / ESC PAUSE';
}
function reset() {
  outro.reset(); outroCuePlayed = false; recorder.reset(); replay = null; pendingReplay = replayWasShowing = false; finalKiller = '';
  replayHitUntil = -Infinity; hud.classList.remove('round-ending', 'round-banner', 'round-replay');
  simulation.reset(rules, roundOptions); previousSpawnId = INITIAL_SPAWN.id;
  yaw = now = 0; pitch = 0.024;
  movement.reset(); viewMotion.reset(yaw, pitch); cameraEyeY = eyeHeight = 1.65;
  stepDistance = travelSpeed = 0; sprinting = false; kills = quicks = hits = points = 0;
  combatEffects.clear(); combatFeedback.clear(); damageUntil = 0;
  boltSoundAt = hitUntil = feedbackUntil = notificationUntil = 0;
  $('feedback').querySelector('b')!.textContent = '';
  $('feedback').querySelector('span')!.textContent = '';
  inspectStarted = -10; lastWheelAt = -10;
  impacts.clear();
  arena.targets.forEach(t => { t.respawnAt = 0; t.root.setEnabled(true); t.reset(); });
  clearInput(); $('start-note').textContent = 'Practice reset · ready for another run';
  updateHud();
}
const matchSetup = setupMatch((next, options) => { rules = { ...next }; roundOptions = { ...options }; reset(); updateRuleSummary(); void play(); });
const roundUI = setupRoundUI({ rematch: () => { reset(); void play(); }, newMatch: () => matchSetup.open(), viewStandings: () => outro.skip(), skipReplay: () => outro.skipReplay() });
function finishRound() {
  if (simulation.round.phase !== 'finished' || !outro.begin()) return;
  pendingReplay = simulation.round.finishReason === 'kill-limit' && finalKiller === 'player';
  running = false; audio.setActive(false); clearInput(); travelSpeed = 0; sprinting = false; updateHud();
  if (document.pointerLockElement) document.exitPointerLock();
}
function updateRuleSummary() {
  $('mode-label').textContent = rules.botsShoot ? 'SOLO COMBAT' : 'SOLO PRACTICE';
  $('active-rules').innerHTML = `<span>${roundOptions.killLimit ? `${roundOptions.killLimit} KILLS` : 'NO KILL LIMIT'} / ${roundOptions.timeLimitSeconds ? `${Math.round(roundOptions.timeLimitSeconds / 60)} MIN` : 'NO TIME LIMIT'}</span><span>PISTOL DAMAGE ${rules.secondaryDamage ? 'ON' : 'OFF'}</span><span>KNIVES ${rules.knives ? 'ON' : 'OFF'}</span><span>ENEMY FIRE ${rules.botsShoot ? 'ON' : 'OFF'}</span>`;
}
$('play').addEventListener('click', () => { if (started) void play(); else matchSetup.open(); });
$('new-match').addEventListener('click', () => { pause(); matchSetup.open(); });
updateRuleSummary();
$('pause').addEventListener('click', pause);
$('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { $('error').textContent = 'Fullscreen is unavailable in this browser panel. You can still play in the window.'; }
});
document.addEventListener('pointerlockchange', () => { if (running && !fallback && document.pointerLockElement !== canvas) pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('blur', () => { if (running) pause(); });
document.addEventListener('contextmenu', event => {
  if (event.target === canvas || running) event.preventDefault();
  // Embedded panels can send a right-click menu event without mouse-down.
  // Real mouse-down already handles aiming; never toggle twice for one click.
  if (running && simulation.active && life.alive && event.target === canvas && event.button === 2 && toggleAim && !rightMouseDownHandled) aimingToggle = !aimingToggle;
  rightMouseDownHandled = false;
});
window.addEventListener('keydown', e => {
  if (!running || ((!simulation.active || !life.alive) && e.code !== 'Escape')) return;
  if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyC', 'KeyQ', 'KeyE', 'Digit1', 'Digit2'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  // Keyboard look also works in embedded panels that only deliver clicks during a drag.
  if (fallback && e.code.startsWith('Arrow')) {
    e.preventDefault();
    const lookScale = 1 - loadout.weapon.ads * loadout.spec.lookReduction;
    if (e.code === 'ArrowLeft') yaw -= .07 * lookScale;
    if (e.code === 'ArrowRight') yaw += .07 * lookScale;
    if (e.code === 'ArrowUp') pitch = Math.max(-1.45, Math.min(1.45, pitch - .05 * lookScale * (invertY ? -1 : 1)));
    if (e.code === 'ArrowDown') pitch = Math.max(-1.45, Math.min(1.45, pitch + .05 * lookScale * (invertY ? -1 : 1)));
  }
  if (e.code === 'Space' && !e.repeat) pendingJump = true;
  if (e.code === 'KeyE' && !e.repeat) knifeAttack();
  if (e.code === 'KeyQ' && !e.repeat) swap(loadout.requested === 0 ? 1 : 0);
  if (e.code === 'KeyV' && !e.repeat && !melee.active(now) && !loadout.swapping && !loadout.weapon.reloadAt && loadout.weapon.ads < 0.05) inspectStarted = now;
  if (!e.repeat && (e.code === 'Digit1' || e.code === 'Digit2')) swap(e.code === 'Digit1' ? 0 : 1);
  if (e.code === 'KeyR' && !e.repeat && !melee.active(now) && simulation.reload()) { audio.reload(); notify('Reloading'); }
  if (e.code === 'Escape') pause();
});
window.addEventListener('keyup', e => keys.delete(e.code));
let lastWheelAt = -10;
canvas.addEventListener('wheel', e => {
  if (!running || !simulation.active) return;
  e.preventDefault();
  // Trackpad inertia and high-resolution wheels should produce one deliberate swap.
  if (Math.abs(e.deltaY) < 2 || now - lastWheelAt < .18) return;
  lastWheelAt = now; swap(loadout.requested === 0 ? 1 : 0);
}, { passive: false });
function swap(slot: WeaponSlot) {
  if (!simulation.active || !life.alive || melee.active(now)) return;
  inspectStarted = -10; pendingFire = false;
  if (simulation.swap(slot)) audio.swap();
}
canvas.addEventListener('mousedown', e => {
  if (!running || !simulation.active || !life.alive) return;
  if (e.button === 3) { e.preventDefault(); knifeAttack(); return; }
  if (e.button === 0) {
    dragDistance = 0;
    if (fallback) dragging = true;
    else { pendingFire = true; mouseFiredOnDown = true; }
  }
  if (e.button === 2) {
    rightMouseDownHandled = true;
    if (toggleAim) aimingToggle = !aimingToggle;
    else aimingMouse = true;
  }
});
// Some embedded browser panels deliver clicks without mouse-down events.
// In drag mode, looking around should not consume a round.
canvas.addEventListener('click', e => {
  if (running && simulation.active && life.alive && e.button === 0 && !mouseFiredOnDown && dragDistance < 5) pendingFire = true;
  mouseFiredOnDown = false; dragDistance = 0;
});
canvas.addEventListener('auxclick', e => { if (e.button === 3) e.preventDefault(); });
window.addEventListener('mouseup', e => { if (e.button === 0) dragging = false; if (e.button === 2) aimingMouse = false; });
window.addEventListener('mousemove', e => {
  if (!running || !simulation.active || !life.alive || (document.pointerLockElement !== canvas && !dragging)) return;
  if (dragging) dragDistance += Math.hypot(e.movementX, e.movementY);
  const scale = 0.0021 * sensitivity * (1 - loadout.weapon.ads * loadout.spec.lookReduction);
  yaw += e.movementX * scale;
  pitch = Math.max(-1.45, Math.min(1.45, pitch + e.movementY * scale * (invertY ? -1 : 1)));
});

const settings = setupSettings({
  sensitivity: value => { sensitivity = value; }, ads: value => { adsSeconds = value / 1000; },
  volume: value => { audio.volume = value / 100; }, walking: value => { movingTargets = value; },
  invert: value => { invertY = value; }, fps: value => { $('fps').hidden = !value; },
  toggleAim: value => { toggleAim = value; aimingMouse = aimingToggle = rightMouseDownHandled = false; },
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
  if (!simulation.active || !life.alive || melee.active(now)) return;
  inspectStarted = -10;
  const shot = simulation.fire();
  if (!shot) { if (!loadout.swapping && !loadout.weapon.ammo && !loadout.weapon.reloadAt) { audio.dry(); notify('Magazine empty — press R to reload'); } return; }
  const spec = loadout.spec;
  viewMotion.fire(spec.recoil);
  recorder.cue(now, loadout.active === 0 ? 'sniper' : 'pistol');
  if (loadout.active === 0) { boltSoundAt = now + .35; audio.shot(); } else audio.pistolShot();
  // Scope accuracy is deliberately independent of the scope's visual animation.
  const spread = loadout.active === 0
    ? shot.scoped ? (player.grounded ? .00035 : .005) : .045 * (1 - loadout.weapon.ads * .7)
    : shot.scoped ? (player.grounded ? .0012 : .004) : .024 * (1 - loadout.weapon.ads * .8);
  // Fire through the presented crosshair, including the recovering camera kick.
  const forward = camera.getForwardRay(1).direction;
  const right = Vector3.Cross(Vector3.Up(), forward).normalize();
  const up = Vector3.Cross(forward, right).normalize();
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
  const direction = forward.add(right.scale(Math.cos(a) * r)).add(up.scale(Math.sin(a) * r)).normalize();
  const ray = new Ray(camera.position.clone(), direction, 180);
  // Pick only the nearest live enemy. Static cover uses its cached, unmerged geometry.
  const pick = scene.pickWithRay(ray, mesh => mesh.isEnabled() && mesh.metadata?.target !== undefined);
  const result = resolveCover(traceCover(ray, arena.cover), direction, pick?.hit ? pick.distance : Infinity, spec.energy);
  result.impacts.forEach(impact => impacts.stamp(impact, now));
  const coverLabel = Array.from(new Set(result.materials)).join(' + ').toUpperCase();
  if (result.energy <= 0 || !pick?.hit || !pick.pickedMesh) {
    if (result.stopped || result.penetrations) {
      feedbackUntil = now + 1.2;
      $('feedback').querySelector('b')!.textContent = result.stopped ? 'COVER HIT' : 'PENETRATED';
      $('feedback').querySelector('span')!.textContent = result.stopped
        ? `STOPPED BY ${result.stopped.toUpperCase()}` : `${coverLabel} / ${bulletDamage(result.energy / spec.energy, false, spec.bodyDamage)} DAMAGE REMAINING`;
    }
    return;
  }
  const metadata = pick.pickedMesh.metadata;
  damageEnemy(metadata.target, bulletDamage(result.energy / spec.energy, !!metadata.head, spec.bodyDamage), loadout.active === 0 ? 'sniper' : 'pistol', !!metadata.head, shot.quickscope, result.penetrations > 0, coverLabel);
}
function damageEnemy(index: number, damage: number, source: DamageSource, head = false, quickscope = false, throughCover = false, coverLabel = '') {
  const target = arena.targets[index];
  if (!target || target.respawnAt) return;
  if (!allowsDamage(rules, source)) { notify('Secondary weapon damage is disabled for this match.'); return; }
  const result = simulation.hitEnemy(index, damage, source, { headshot: head, quickscope, throughCover });
  if (!result) return;
  target.health = result.health;
  const eliminated = result.eliminated;
  hitUntil = now + .19; feedbackUntil = now + 1.4;
  $('hitmarker').classList.toggle('headshot', head);
  audio.hit(head); recorder.cue(now, head ? 'headshot' : 'hit');
  if (eliminated) {
    target.root.setEnabled(false); target.respawnAt = simulation.enemies.find(enemy => enemy.id === index)!.respawnAt;
    const reward = result.reward;
    $('feedback').querySelector('b')!.textContent = throughCover
      ? (head ? 'WALLBANG HEADSHOT' : quickscope ? 'WALLBANG QUICKSCOPE' : 'WALLBANG')
      : source === 'knife' ? 'KNIFE ELIMINATION' : quickscope ? 'QUICKSCOPE' : head ? 'HEADSHOT' : `ELIMINATED ENEMY ${String(index + 1).padStart(2, '0')}`;
    $('feedback').querySelector('span')!.textContent = `+${reward} / ${damage} DMG${throughCover ? ` / ${coverLabel}` : ''}`;
  } else {
    $('feedback').querySelector('b')!.textContent = throughCover ? 'HIT THROUGH COVER' : 'HIT';
    $('feedback').querySelector('span')!.textContent = `${damage} DMG / ${target.health} HP${throughCover ? ` / ${coverLabel}` : ''}`;
  }
}

// Query only on actual footfalls/landings, using cached map surfaces rather than height guesses.
function footstepSurface(): FootstepSurface {
  const ray = new Ray(new Vector3(player.x, player.y + .08, player.z), new Vector3(0, -1, 0), .18);
  return traceCover(ray, arena.cover)[0]?.surface.material === 'metal' ? 'metal' : 'sand';
}
function fixedUpdate(dt: number) {
  const tick = simulation.advance(dt, () => chooseSpawn(ARENA_SPAWNS, botSnapshots(), canSee, arena.solids, previousSpawnId));
  now = simulation.now;
  if (!tick.active) { finishRound(); return; }
  if (!tick.activeDt) return;
  dt = tick.activeDt;
  for (const id of tick.enemyRespawns) { const target = arena.targets[id]; target.reset(); target.root.setEnabled(true); }
  if (tick.playerRespawn) respawnPlayer(tick.playerRespawn);
  updateTargets(dt);
  if (!life.alive) {
    combatEffects.update(now); impacts.update(now);
    updateBotCombat(dt);
    for (const event of simulation.drainEvents()) { finalKiller = event.killerId; combatFeedback.elimination(event); }
    finishRound(); return;
  }
  const crouching = keys.has('KeyC') || keys.has('ControlLeft') || keys.has('ControlRight');
  const aiming = !melee.active(now) && (aimingMouse || aimingToggle);
  if (aiming || loadout.weapon.reloadAt) inspectStarted = -10;
  const previousSlot = loadout.active;
  const motion = simulation.move({
    strafe: Number(keys.has('KeyD')) - Number(keys.has('KeyA')),
    forward: Number(keys.has('KeyW')) - Number(keys.has('KeyS')),
    yaw, sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'), aiming, crouching, jump: pendingJump,
  }, dt, arena.solids, adsSeconds)!;
  pendingJump = false;
  if (previousSlot !== loadout.active) viewMotion.clearRecoil();
  travelSpeed = motion.distance / dt;
  sprinting = motion.sprinting;
  const ease = (rate: number) => 1 - Math.exp(-rate * dt);
  eyeHeight += ((movement.crouching ? 1.0 : 1.65) - eyeHeight) * ease(16);
  cameraEyeY += (player.y + eyeHeight - cameraEyeY) * ease(player.grounded ? 22 : 42);
  if (motion.jumped) stepDistance = 0;
  if (motion.landed) {
    stepDistance = 0;
    viewMotion.land(motion.landingSpeed);
    if (motion.landingSpeed > 4) audio.land(footstepSurface(), Math.min(1.6, motion.landingSpeed / 7));
  }
  if (player.grounded && motion.distance > .00001) {
    stepDistance += motion.distance;
    const stride = Math.PI / (motion.sprinting ? SPRINT_BOB_RATE : movement.crouching ? CROUCH_BOB_RATE : WALK_BOB_RATE);
    if (stepDistance >= stride) { audio.step(footstepSurface(), movement.crouching ? .4 : motion.sprinting ? 1.25 : .85); stepDistance %= stride; }
  }
  if (boltSoundAt && now >= boltSoundAt) { if (loadout.active === 0) { audio.bolt(); recorder.cue(now, 'bolt'); } boltSoundAt = 0; }
  positionCamera();
  if (melee.update(now)) {
    const index = selectMeleeTarget(camera.position, camera.getForwardRay(1).direction, botSnapshots(), (from, to) => !canSee(from, to));
    if (index !== null) damageEnemy(index, MELEE_DAMAGE, 'knife');
  }
  if (pendingFire) { pendingFire = false; fire(); }
  if (simulation.active) updateBotCombat(dt);
  for (const event of simulation.drainEvents()) { finalKiller = event.killerId; combatFeedback.elimination(event); }
  combatEffects.update(now); impacts.update(now);
  finishRound();
}
function updateTargets(dt: number) {
  simulation.patrol(dt, movingTargets);
  for (const target of arena.targets) {
    const state = simulation.enemies.find(enemy => enemy.id === target.index)!;
    target.health = state.health; target.respawnAt = state.respawnAt;
    if (!state.respawnAt) target.animate(dt, now);
  }
}
function botSnapshots() { return simulation.snapshots(); }
function canSee(from: CombatVector, to: CombatVector) {
  const origin = new Vector3(from.x, from.y, from.z), end = new Vector3(to.x, to.y, to.z);
  const distance = Vector3.Distance(origin, end);
  if (distance < .001) return true;
  const ray = new Ray(origin, end.subtract(origin).normalize(), distance);
  return !traceCover(ray, arena.cover).some(crossing => crossing.entry.distance < distance - .01);
}
function knifeAttack() {
  if (!simulation.active || !life.alive || loadout.swapping) return;
  if (!rules.knives) { notify('Knives are disabled for this match.'); return; }
  if (!simulation.knife()) return;
  aimingMouse = aimingToggle = pendingFire = false;
  inspectStarted = -10; viewMotion.clearRecoil(); audio.melee(); recorder.cue(now, 'knife');
}
function respawnPlayer(spawn: SpawnPoint) {
  recorder.reset();
  previousSpawnId = spawn.id;
  yaw = spawn.yaw; pitch = .024; cameraEyeY = player.y + 1.65; eyeHeight = 1.65;
  viewMotion.reset(yaw, pitch); travelSpeed = stepDistance = 0; sprinting = false;
  clearInput(); boltSoundAt = 0;
  inspectStarted = -10; damageUntil = hitUntil = feedbackUntil = 0; notify('Respawned — brief spawn protection'); positionCamera();
}
function updateBotCombat(dt: number) {
  const shots = botCombat.update(now, dt, botSnapshots(), { ...player, height: movement.height, alive: life.alive && now >= life.protectedUntil }, rules.botsShoot, canSee);
  for (const target of arena.targets) {
    const pose = botCombat.pose(target.index, now);
    target.setCombatPose(pose.aiming, pose.yaw, pose.pitch, pose.shotAge, pose.reloading, pose.reloadProgress, pose.boltProgress);
  }
  for (const shot of shots) {
    if (!simulation.active) break;
    simulation.botFired(shot.botId);
    const origin = new Vector3(shot.origin.x, shot.origin.y, shot.origin.z), direction = new Vector3(shot.direction.x, shot.direction.y, shot.direction.z);
    const distance = Vector3.Distance(origin, new Vector3(player.x, player.y + movement.height * .55, player.z));
    const hitDistance = playerHitDistance(shot.origin, shot.direction, { ...player, height: movement.height, alive: life.alive });
    const endDistance = hitDistance ?? distance + 3;
    const ray = new Ray(origin, direction, endDistance);
    const cover = traceCover(ray, arena.cover)[0];
    const blocked = cover && cover.entry.distance < endDistance;
    combatEffects.shot(origin, origin.add(direction.scale(blocked ? cover.entry.distance : endDistance)), now);
    if (blocked) impacts.stamp({ hit: cover.entry, material: cover.surface.material, exit: false }, now);
    audio.botShot(distance);
    if (shot.hit && !blocked && allowsDamage(rules, 'bot') && now >= life.protectedUntil && life.alive) {
      const hit = simulation.damagePlayer(shot.botId, shot.damage);
      if (!hit.applied) continue;
      combatFeedback.damage(shot.origin, now); damageUntil = now + .35; audio.hurt();
      const died = hit.died;
      if (died) {
        lastAttacker = shot.botId; clearInput(); melee.reset(); movement.reset(); travelSpeed = 0; sprinting = false;
        loadout.weapon.reloadAt = 0;
      }
    }
  }
}
const smooth = (v: number) => v * v * (3 - 2 * v);
function positionCamera(aim = loadout.weapon.ads) {
  const eyeY = Math.min(cameraEyeY + viewMotion.cameraY, player.y + movement.height - .08);
  camera.position.set(player.x, eyeY, player.z);
  camera.rotation.set(pitch + viewMotion.cameraPitch, yaw, viewMotion.cameraRoll);
  const ads = smooth(aim);
  camera.fov = .98 + (loadout.spec.aimFov - .98) * ads + .045 * viewMotion.sprint * (1 - ads);
}
function updateHud() {
  const stats = simulation.round.standings().find(entry => entry.id === 'player')!;
  kills = stats.kills; quicks = stats.quickscopes; hits = stats.hits; points = stats.points;
  $('health').textContent = String(Math.ceil(life.health));
  $('deaths').textContent = String(life.deaths).padStart(2, '0');
  $('health-bar').style.width = `${life.health}%`;
  $('health-status').classList.toggle('low', life.health < 40);
  $('protection').textContent = rules.botsShoot && life.alive && now < life.protectedUntil ? `PROTECTED ${Math.ceil(life.protectedUntil - now)}s` : '';
  $('respawn-screen').hidden = life.alive || simulation.round.phase === 'finished';
  $('respawn-label').textContent = now >= life.respawnAt && !life.alive ? 'WAITING FOR A SAFE SPAWN' : `ENEMY ${String(lastAttacker + 1).padStart(2, '0')} / INTERVENTION / RESPAWN IN ${Math.max(0, life.respawnAt - now).toFixed(1)}s`;
  $('kills').textContent = String(kills).padStart(2, '0');
  $('quicks').textContent = String(quicks).padStart(2, '0');
  $('accuracy').textContent = loadout.shots ? `${Math.round(hits / loadout.shots * 100)}%` : '—';
  $('weapon-label').textContent = loadout.spec.label;
  $('weapon-name').innerHTML = `${loadout.spec.name} <span>0${loadout.active + 1}</span>`;
  $('slot-rifle').classList.toggle('selected', loadout.active === 0);
  $('slot-pistol').classList.toggle('selected', loadout.active === 1);
  $('slot-rifle').classList.toggle('incoming', loadout.swapping && loadout.requested === 0);
  $('slot-pistol').classList.toggle('incoming', loadout.swapping && loadout.requested === 1);
  $('ammo').textContent = String(loadout.weapon.ammo).padStart(2, '0');
  $('rounds').innerHTML = Array.from({ length: loadout.spec.magazineSize }, (_, i) => `<i class="${i < loadout.weapon.ammo ? 'loaded' : ''}"></i>`).join('');
  const remaining = simulation.round.timeRemaining;
  const clock = remaining === null ? Math.floor(now) : Math.ceil(remaining);
  $('timer').textContent = `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(Math.floor(clock % 60)).padStart(2, '0')}`;
  let progress = 1, status = 'READY';
  if (!simulation.active) { status = simulation.round.phase === 'countdown' ? 'GET READY' : 'MATCH COMPLETE'; progress = 0; }
  else if (!life.alive) { status = 'RESPAWNING'; progress = 0; }
  else if (melee.active(now)) { status = 'MELEE'; progress = melee.progress(now); }
  else if (loadout.swapping) { status = 'SWAPPING'; progress = loadout.swapProgress(now); }
  else if (loadout.weapon.reloadAt) { status = 'RELOADING'; progress = 1 - (loadout.weapon.reloadAt - now) / loadout.spec.reloadSeconds; }
  else if (loadout.weapon.readyAt > now) { status = loadout.active === 0 ? 'CYCLING BOLT' : 'RECOVERING'; progress = 1 - (loadout.weapon.readyAt - now) / loadout.spec.fireSeconds; }
  else if (!loadout.weapon.ammo) { status = 'R / RELOAD'; progress = 0; }
  else if (loadout.weapon.ads >= .72) status = loadout.active === 1 ? 'SIGHTS READY' : now - loadout.weapon.accurateSince <= .18 ? 'QUICKSCOPE WINDOW' : 'SCOPE READY';
  $('action').textContent = status; $('action-progress').style.width = `${Math.max(0, progress) * 100}%`;
  $('action').classList.toggle('ready', loadout.weapon.ads >= .72 && !loadout.weapon.reloadAt && !loadout.swapping);
  $('fps').textContent = `${Math.round(engine.getFps())} FPS`;
}
engine.runRenderLoop(() => {
  const frame = performance.now(), dt = Math.min((frame - lastFrame) / 1000, 0.05); lastFrame = frame;
  if (running) {
    accumulator += dt;
    while (running && accumulator >= 1 / 120) { fixedUpdate(1 / 120); accumulator -= 1 / 120; }
  }
  if (outro.presenting && !document.hidden) outro.advance(dt);
  if (outro.stage === 'banner' && !outroCuePlayed) {
    outroCuePlayed = true;
    const winners = simulation.round.snapshot.winnerIds;
    audio.roundEnd(winners.length > 1 ? 'draw' : winners.includes('player') ? 'win' : 'loss');
  }
  const replaying = outro.stage === 'replay' && replay !== null;
  if (replayWasShowing && !replaying && replay) {
    const last = replay.frames[replay.frames.length - 1];
    replayScene.apply({ before: last, after: last, mix: 0 });
    impacts.showAt(now);
    $('hitmarker').style.opacity = '0';
  }
  if (replaying && !replayWasShowing) combatEffects.clear();
  replayWasShowing = replaying;
  const presenting = outro.presenting;
  hud.classList.toggle('round-ending', presenting);
  hud.classList.toggle('round-banner', outro.stage === 'banner');
  hud.classList.toggle('round-replay', replaying);
  if (replaying && replay) {
    const elapsed = outro.replayElapsed;
    impacts.showAt(replay.start + elapsed);
    const lens = replayScene.apply(replay.sample(elapsed));
    $('scope').style.opacity = String(lens.scope); $('scope').classList.toggle('accurate', lens.accurate);
    $('damage-overlay').style.opacity = '0';
    for (const cue of replay.drainCues(elapsed)) {
      if (cue.kind === 'sniper') audio.shot();
      else if (cue.kind === 'pistol') audio.pistolShot();
      else if (cue.kind === 'knife') audio.melee();
      else if (cue.kind === 'bolt') audio.bolt();
      else { audio.hit(cue.kind === 'headshot'); replayHeadshot = cue.kind === 'headshot'; replayHitUntil = elapsed + .19; }
    }
    $('hitmarker').classList.toggle('headshot', replayHeadshot);
    $('hitmarker').style.opacity = elapsed < replayHitUntil ? '1' : '0';
  } else if (running || presenting) {
    const renderNow = now + (presenting ? outro.elapsed : 0);
    const aim = loadout.weapon.ads * (presenting ? outro.aimScale : 1);
    viewMotion.update(dt, {
      yaw, pitch, ads: aim, speed: travelSpeed, grounded: player.grounded,
      sprinting, crouching: movement.crouching,
      strafeSpeed: presenting ? 0 : movement.vx * Math.cos(yaw) - movement.vz * Math.sin(yaw),
    });
    positionCamera(aim);
    const recoil = viewMotion.gunKick;
    const ads = smooth(aim), shotAge = renderNow - loadout.lastShots[loadout.active];
    const sway = viewMotion.weaponY;
    const reloadT = loadout.weapon.reloadAt ? Math.max(0, Math.min(1, 1 - (loadout.weapon.reloadAt - renderNow) / loadout.spec.reloadSeconds)) : 0;
    const inspectT = (renderNow - inspectStarted) / 2.4;
    const inspect = inspectT >= 0 && inspectT < 1 ? Math.sin(inspectT * Math.PI) : 0;
    const knifing = life.alive && melee.active(renderNow);
    knifeModel.root.setEnabled(knifing); if (knifing) knifeModel.updatePose(melee.progress(renderNow));
    viewmodel.root.setEnabled(life.alive && !knifing && loadout.active === 0 && aim < .75);
    pistolModel.root.setEnabled(life.alive && !knifing && loadout.active === 1);
    const model = loadout.active === 0 ? viewmodel : pistolModel;
    if (loadout.active === 0) viewmodel.updatePose(ads, recoil, sway, shotAge, reloadT, !!loadout.weapon.reloadAt, inspect);
    else pistolModel.updatePose(ads, recoil, sway, shotAge, reloadT, !!loadout.weapon.reloadAt, inspect, loadout.weapon.ammo === 0);
    model.root.position.x += viewMotion.weaponX;
    model.root.position.z += viewMotion.weaponZ;
    model.root.rotation.x += viewMotion.weaponPitch;
    model.root.rotation.y += viewMotion.weaponYaw;
    model.root.rotation.z += viewMotion.weaponRoll;
    const holster = smooth(loadout.holsterAmount(renderNow));
    model.root.position.y -= holster * .38;
    model.root.rotation.x += holster * .35;
    model.flash.setEnabled(!loadout.swapping && shotAge < (loadout.active === 0 ? .045 : .035));
    $('scope').style.opacity = life.alive && !knifing && loadout.active === 0 ? String(Math.max(0, Math.min(1, (aim - .55) / .2))) : '0';
    $('scope').classList.toggle('accurate', loadout.active === 0 && aim >= .72);
    $('crosshair').style.opacity = !life.alive ? '0' : String(1 - Math.min(1, aim * 2));
    $('crosshair').style.setProperty('--spread', `${10 + (!player.grounded ? 13 : 0) + recoil * 12}px`);
    $('damage-overlay').style.opacity = renderNow < damageUntil ? '.9' : life.alive && life.health < 40 ? '.28' : '0';
    $('hitmarker').style.opacity = renderNow < hitUntil ? '1' : '0';
    $('feedback').style.opacity = renderNow < feedbackUntil ? '1' : '0';
    $('notification').style.opacity = renderNow < notificationUntil ? '1' : '0';
    combatFeedback.update(renderNow, player, yaw);
    if (presenting) {
      combatEffects.update(renderNow);
      if (boltSoundAt && renderNow >= boltSoundAt) { if (loadout.active === 0) audio.bolt(); boltSoundAt = 0; }
      for (const target of arena.targets) {
        const pose = botCombat.pose(target.index, renderNow);
        target.setCombatPose(pose.aiming, pose.yaw, pose.pitch, pose.shotAge, pose.reloading, pose.reloadProgress, pose.boltProgress);
      }
    }
    if ((running && simulation.active && life.alive) || pendingReplay) {
      recorder.record(now, data => replayScene.capture(data, Number($('scope').style.opacity), $('scope').classList.contains('accurate')), pendingReplay);
      if (pendingReplay) {
        replay = recorder.clip(); pendingReplay = false;
        if (replay) outro.scheduleReplay(replay.duration);
      }
    }
    if (frame - lastHud > 80) { updateHud(); lastHud = frame; }
  } else if (!started) {
    const t = frame / 1000;
    camera.position.set(24 + Math.sin(t * 0.035) * 2, 15, -27);
    camera.setTarget(new Vector3(0, 3.5, 3));
  }
  if (!running && !presenting) { $('scope').style.opacity = '0'; viewmodel.root.setEnabled(false); pistolModel.root.setEnabled(false); knifeModel.root.setEnabled(false); $('damage-overlay').style.opacity = '0'; }
  roundUI.render(simulation.round.snapshot, 'player', running || (started && simulation.round.phase === 'finished'), outro.stage, replay ? outro.replayElapsed / replay.duration : 0);
  scene.render();
});
window.addEventListener('resize', () => engine.resize());
scene.executeWhenReady(() => { $('loading').hidden = true; });
