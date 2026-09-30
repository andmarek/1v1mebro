# DEADBOLT — quickscope range

A single-player, desktop-browser prototype built with **TypeScript, Babylon.js, and Vite**. An original desert scrapyard, an Intervention-inspired procedural rifle, a service pistol, and nine walking, respawning practice enemies let you try movement and quickscoping before adding multiplayer.

## Run

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173** in a desktop browser and click **Enter the range**. Chrome or Edge in a regular browser window is recommended for mouse capture. If an embedded preview blocks Pointer Lock, the game falls back to dragging or using arrow keys to look and clicking to shoot. Right click aims in either mode; enable **Toggle aim** in Controls to aim with a click rather than a hold.

```sh
npm test       # movement feel, collision, weapon timing/swaps, patrol, and penetration tests
npm run build # type-check and production build
npm run preview
```

## Controls

| Input | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look |
| Hold Shift + forward movement | Sprint |
| Space | Jump; use WASD to steer in the air |
| Hold C or Ctrl | Lower stance / move slowly |
| Right mouse | Aim down sights; hold by default, or click with Toggle aim enabled |
| Q | Swap between the sniper and pistol |
| Left mouse | Fire |
| R | Reload |
| 1 / 2 | Select sniper / FIELD-9 pistol |
| Mouse wheel | Swap weapons |
| V | Inspect the equipped weapon |
| Esc | Pause / release mouse |

Open **Settings** from the range menu or the HUD gear. Controls, Graphics, Audio, and Practice tabs include sensitivity, inverted vertical look, toggle aim, render resolution, shadow detail, impact marks, an FPS counter, volume, walking enemies, scope-in time, and a practice reset. Preferences save locally when storage is available; **Restore defaults** resets them. Opening settings pauses the game.

Bullet holes use three shared procedural textures for metal, wood, and concrete, projected onto the actual surface triangles. Entry marks appear on all struck cover; exit marks appear only when a bullet passes through. A pool capped at 64 reuses old marks, and marks clear after 30 seconds of game time. The graphics toggle hides existing holes and suppresses new ones without changing damage or penetration.

## Mechanics

- **Intervention:** 5-round magazine, unlimited reserve; 920 ms bolt cycle; 2.15 second reload.
- **FIELD-9:** original M9/USP-inspired service pistol with 15 rounds, unlimited reserve, a 180 ms firing interval, 120 ms iron-sight aim, and a 1.35 second reload. Semi-automatic: one shot per click. Body hits deal 35 damage and head hits 70, so full-health enemies need three body hits or two head hits. The smaller bullet energy budget penetrates very thin wood/metal but stops at the central live-fire metal panel. Entry/exit marks use the same bounded pool as the rifle.
- Weapon swaps take 280 ms: 120 ms to holster and 160 ms to draw. Movement continues throughout; firing and reloading wait until the draw finishes. Both weapons keep their ammo and shot cooldowns, so swapping cannot skip the sniper bolt cycle. Switching cancels an unfinished reload without refilling the magazine. Rapid selections queue the most recent choice; wheel inputs are limited to one request per 180 ms to tame trackpad inertia.
- The pistol has a rounded, worn steel slide, exposed chamber, machined controls, grip checkering, an open trigger guard, three-dot iron sights, engraved markings, and tactical gloves. The slide recoils with each shot and locks back on an empty magazine; the magazine and support hand animate during reload. Both models support inspection and holster/draw poses.
- Default 180 ms scope-in animation, adjustable from 120–320 ms.
- Accuracy tightens at 72% of the scope-in transition. A hit in the following 180 ms counts as a quickscope, adding 50 points.
- Enemies have 100 health. Direct sniper body shots deal 150 damage, headshots deal 300. Damage persists until elimination, respawn, or practice reset; there is no health regeneration.
- Thin metal and wood can be penetrated; thickness and angle consume a finite bullet energy budget. Thick steel, concrete, and ground stop bullets. Hollow containers and drums count their two shell walls rather than their air volume, with corrugations included in the same object. At most four objects can be penetrated, and the first enemy hit stops the bullet. Headshots retain their damage multiplier after penetration.
- The **METAL / LIVE FIRE** screen in front of the central patrol and **WOOD / LIVE FIRE** screen on the right make penetration easy to try. For a repeatable test, disable walking enemies and reset practice: a scoped body shot from spawn through the central metal screen deals about 79 damage, leaving 21 health. A second hit eliminates the enemy. HUD feedback shows damage, remaining health, and wallbang eliminations.
- Body eliminations award 100 points; headshots award 150. Each enemy returns after 2 seconds and starts a new patrol from its spawn.
- Hip fire has substantial random spread; scoped fire is precise, with extra spread while airborne.
- Movement uses a fixed 120 Hz velocity simulation: running at 6.1 m/s, forward sprinting at 9.4 m/s, aiming at 3.8 m/s, and lowered stance at 2.8 m/s. Acceleration eases in over roughly 100–150 ms, with fast braking and responsive strafe reversals. Diagonal input is normalized.
- Jumps reach about 1.4 m and retain takeoff momentum. WASD steers in the air, with bounded speed so repeated hops cannot stack extra acceleration. Jump presses are buffered for 120 ms before landing; a 100 ms grace window permits jumping just after leaving an edge. Holding jump does not automatically repeat it.
- The collision controller slides along cover, steps up stairs, and follows small downward steps without bouncing off each tread. Camera height smooths stair transitions, with a small landing dip and subtle sprint FOV widening. Scope zoom stays consistent, and footsteps/weapon sway follow actual travel rather than held keys.
- All nine practice enemies walk along patrol loops, with turns, brief pauses, swinging arms, bending knees, and level boots. Paths avoid map cover; elevated patrols stay on their decks. Enemies stop for nearby characters. Disable **Walking enemies** for stationary practice, or reset the session to return everyone to their spawn. They do not shoot back yet.
- The rifle has rounded machined edges, an open handguard, fluted barrel, hollow scope housing, coated lenses, adjustment dials, screws, engraved markings, and tactical gloves. Metal, paint, fabric, and rubber use distinct physically based materials. The bolt, hands, and magazine animate independently.
- The scrapyard uses photographed sand, concrete, and rust materials, chipped painted metal, beveled containers with locking hardware, cast Jersey barriers, open steel stairs, hollow pipes, rolled drums, chain-link fences, gravel, tire tracks, and an eroded desert ridge. Physically based lighting, 2K filtered shadows, dust haze, and filmic tone mapping give surfaces more depth. Static detail is batched by material to keep draw calls low. Playable terrain and stair collision retain the original layout.
- Audio is synthesized locally with Web Audio. Map and weapon geometry are authored in code. Public-domain Poly Haven material maps and a Babylon.js reflection environment are bundled locally; credits are in `public/assets/README.md`. Google Fonts are optional and fall back to local fonts.

This is a feel prototype, not a frame-perfect reproduction of MW2. Stance currently lowers the camera and movement speed while retaining full collision height. The client runs everything locally; there is no networking, matchmaking, or persistence of match statistics.

## Code

- `src/main.ts`: input, fixed-step game loop, hitscan, HUD, pause.
- `src/ballistics.ts`: cached static surface geometry, material/thickness penetration, damage, and clipped decal projection.
- `src/ballistics.test.ts`: direct shots, material resistance, layered/angled cover, hollow shells, and surface projection checks.
- `src/impacts.ts`: procedural hole textures and a bounded, reusable decal pool.
- `src/settings.ts`: accessible settings dialog, category navigation, defaults, and local preference storage.
- `src/simulation.ts`: engine-independent character collision, gravity, and configurable firearm timing.
- `src/movement.ts`: deterministic velocity controller, ground/air steering, jump grace/buffering, and stair descent.
- `src/movement.test.ts`: speed limits, acceleration/braking, jump timing, cover collision, ceilings, and actual tower traversal.
- `src/arena.ts`: procedural arena, colliders, and training targets.
- `src/arenaMaterials.ts`: photographed PBR surfaces and procedural worn paint.
- `src/arenaGeometry.ts`: world-scaled UVs, sloped barriers, and desert terrain.
- `src/tower.ts`: shared tower geometry used for rendering and traversal tests.
- `src/patrol.ts`: navigation grid, obstacle-aware patrols, reset state, and walking pose.
- `src/patrol.test.ts`: cover avoidance, continuous movement, deck support, stopping, and gait tests.
- `src/weapon.ts`: procedural rifle viewmodel and bolt assembly.
- `src/pistol.ts`: procedural pistol, three-dot iron sights, slide, magazine, and hands.
- `src/loadout.ts`: weapon profiles, independent ammo/cooldowns, and queued swaps.
- `src/loadout.test.ts`: weapon cadence, reload cancellation, rapid swaps, and ammo/cooldown integrity.
- `src/rifleGeometry.ts`: beveled geometry with smooth normals and texture coordinates.
- `src/audio.ts`: synthesized shot, bolt, hit, reload, and footstep sounds.
- `src/style.css`: menu, HUD, and scope overlay.

Multiplayer would add the previously discussed Node.js/Colyseus server alongside the client, then prediction, reconciliation, and lag-compensated hit checks. It is intentionally outside this first build.
