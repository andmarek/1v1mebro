# DEADBOLT — quickscope range

A single-player, desktop-browser prototype built with **TypeScript, Babylon.js, and Vite**. An original desert scrapyard, an Intervention-inspired procedural rifle, and nine walking, respawning practice enemies let you try movement and quickscoping before adding multiplayer.

## Run

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173** in a desktop browser and click **Enter the range**. Chrome or Edge in a regular browser window is recommended for mouse capture. If an embedded preview blocks Pointer Lock, the game falls back to dragging or using arrow keys to look and clicking to shoot. Q toggles aiming in either mode.

```sh
npm test       # movement, rifle timing, patrol, and penetration tests
npm run build # type-check and production build
npm run preview
```

## Controls

| Input | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look |
| Shift | Sprint |
| Space | Jump |
| Hold C or Ctrl | Lower stance / move slowly |
| Hold right mouse | Aim down sights |
| Q | Toggle aiming, useful on a trackpad |
| Left mouse | Fire |
| R | Reload |
| V | Inspect the rifle |
| Esc | Pause / release mouse |

Open **Settings** from the range menu or the HUD gear. Controls, Graphics, Audio, and Practice tabs include sensitivity, inverted vertical look, render resolution, shadow detail, impact marks, an FPS counter, volume, walking enemies, scope-in time, and a practice reset. Preferences save locally when storage is available; **Restore defaults** resets them. Opening settings pauses the game.

Bullet holes use three shared procedural textures for metal, wood, and concrete, projected onto the actual surface triangles. Entry marks appear on all struck cover; exit marks appear only when a bullet passes through. A pool capped at 64 reuses old marks, and marks clear after 30 seconds of game time. The graphics toggle hides existing holes and suppresses new ones without changing damage or penetration.

## Mechanics

- 5-round magazine, unlimited reserve; 920 ms bolt cycle; 2.15 second reload.
- Default 180 ms scope-in animation, adjustable from 120–320 ms.
- Accuracy tightens at 72% of the scope-in transition. A hit in the following 180 ms counts as a quickscope, adding 50 points.
- Enemies have 100 health. Direct body shots deal 150 damage, headshots deal 300. Damage persists until elimination, respawn, or practice reset; there is no health regeneration.
- Thin metal and wood can be penetrated; thickness and angle consume a finite bullet energy budget. Thick steel, concrete, and ground stop bullets. Hollow containers and drums count their two shell walls rather than their air volume, with corrugations included in the same object. At most four objects can be penetrated, and the first enemy hit stops the bullet. Headshots retain their damage multiplier after penetration.
- The **METAL / LIVE FIRE** screen in front of the central patrol and **WOOD / LIVE FIRE** screen on the right make penetration easy to try. For a repeatable test, disable walking enemies and reset practice: a scoped body shot from spawn through the central metal screen deals about 79 damage, leaving 21 health. A second hit eliminates the enemy. HUD feedback shows damage, remaining health, and wallbang eliminations.
- Body eliminations award 100 points; headshots award 150. Each enemy returns after 2 seconds and starts a new patrol from its spawn.
- Hip fire has substantial random spread; scoped fire is precise, with extra spread while airborne.
- Sprinting, strafing, jumping, gravity, sliding against cover, and stepping up stairs use a fixed 120 Hz movement simulation.
- All nine practice enemies walk along patrol loops, with turns, brief pauses, swinging arms, bending knees, and level boots. Paths avoid map cover; elevated patrols stay on their decks. Enemies stop for nearby characters. Disable **Walking enemies** for stationary practice, or reset the session to return everyone to their spawn. They do not shoot back yet.
- The rifle has rounded machined edges, an open handguard, fluted barrel, hollow scope housing, coated lenses, adjustment dials, screws, engraved markings, and tactical gloves. Metal, paint, fabric, and rubber use distinct physically based materials. The bolt, hands, and magazine animate independently.
- The scrapyard uses photographed sand, concrete, and rust materials, chipped painted metal, beveled containers with locking hardware, cast Jersey barriers, open steel stairs, hollow pipes, rolled drums, chain-link fences, gravel, tire tracks, and an eroded desert ridge. Physically based lighting, 2K filtered shadows, dust haze, and filmic tone mapping give surfaces more depth. Static detail is batched by material to keep draw calls low. Playable terrain and stair collision retain the original layout.
- Audio is synthesized locally with Web Audio. Map and rifle geometry are authored in code. Public-domain Poly Haven material maps and a Babylon.js reflection environment are bundled locally; credits are in `public/assets/README.md`. Google Fonts are optional and fall back to local fonts.

This is a feel prototype, not a frame-perfect reproduction of MW2. Stance currently lowers the camera and movement speed while retaining full collision height. The client runs everything locally; there is no networking, matchmaking, or persistence of match statistics.

## Code

- `src/main.ts`: input, fixed-step game loop, hitscan, HUD, pause.
- `src/ballistics.ts`: cached static surface geometry, material/thickness penetration, damage, and clipped decal projection.
- `src/ballistics.test.ts`: direct shots, material resistance, layered/angled cover, hollow shells, and surface projection checks.
- `src/impacts.ts`: procedural hole textures and a bounded, reusable decal pool.
- `src/settings.ts`: accessible settings dialog, category navigation, defaults, and local preference storage.
- `src/simulation.ts`: engine-independent character collision and rifle rules, a starting point for a future authoritative server.
- `src/arena.ts`: procedural arena, colliders, and training targets.
- `src/arenaMaterials.ts`: photographed PBR surfaces and procedural worn paint.
- `src/arenaGeometry.ts`: world-scaled UVs, sloped barriers, and desert terrain.
- `src/tower.ts`: shared tower geometry used for rendering and traversal tests.
- `src/patrol.ts`: navigation grid, obstacle-aware patrols, reset state, and walking pose.
- `src/patrol.test.ts`: cover avoidance, continuous movement, deck support, stopping, and gait tests.
- `src/weapon.ts`: procedural rifle viewmodel and bolt assembly.
- `src/rifleGeometry.ts`: beveled geometry with smooth normals and texture coordinates.
- `src/audio.ts`: synthesized shot, bolt, hit, reload, and footstep sounds.
- `src/style.css`: menu, HUD, and scope overlay.

Multiplayer would add the previously discussed Node.js/Colyseus server alongside the client, then prediction, reconciliation, and lag-compensated hit checks. It is intentionally outside this first build.
