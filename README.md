# DEADBOLT — quickscope range

A single-player, desktop-browser prototype built with **TypeScript, Babylon.js, and Vite**. An original desert scrapyard, an Intervention-inspired procedural rifle, a service pistol, and nine walking, respawning practice enemies let you try movement and quickscoping before adding multiplayer.

## Run

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173** in a desktop browser and click **Create match**, choose rules and limits, then **Start match**. Chrome or Edge in a regular browser window is recommended for mouse capture. If an embedded preview blocks Pointer Lock, the game falls back to dragging or using arrow keys to look and clicking to shoot. Right click aims in either mode; enable **Toggle aim** in Controls to aim with a click rather than a hold.

```sh
npm test       # simulation, rounds, spawns, bot combat, movement, weapons, and penetration tests
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
| E / Mouse4 | Knife attack when allowed by match rules |
| Esc | Pause / release mouse |

Open **Settings** from the range menu or the HUD gear. Controls, Graphics, Audio, and Practice tabs include sensitivity, inverted vertical look, toggle aim, render resolution, shadow detail, impact marks, an FPS counter, volume, walking enemies, scope-in time, and a practice reset. Preferences save locally when storage is available; **Restore defaults** resets them. Opening settings pauses the game.

Bullet holes use three shared procedural textures for metal, wood, and concrete, projected onto the actual surface triangles. Entry marks appear on all struck cover; exit marks appear only when a bullet passes through. A pool capped at 64 reuses old marks, and marks clear after 30 seconds of game time. The graphics toggle hides existing holes and suppresses new ones without changing damage or penetration.

## Match setup

**Create match** opens a separate rules dialog. **Quickscope practice** defaults to unlimited training with pistol damage and knives enabled, and enemy fire off. **Combat range** enables all three with a 20-kill / 5-minute round. The initial setup also offers 20 kills / 5 minutes. Choose a kill limit, time limit, or Unlimited independently. Pistol damage can be disabled while retaining shots, sights, and weapon swaps. **New match** on the pause menu opens the dialog again; starting resets the session, while canceling preserves it. Personal Controls/Graphics/Audio preferences remain separate and persist locally.

Rounds begin with a three-second countdown; movement, firing, weapon swaps, and bot attacks wait until it ends. Pausing freezes the countdown and match clock. The first participant to reach the kill limit wins; at timeout, the highest kill count wins, with ties shown as a draw. At the final kill or timeout, gameplay freezes immediately while a 3.4-second presentation holds the impact, eases out of the scope, and shows a victory/defeat/draw banner over the yard. Recoil, muzzle flashes, tracers, and the final shot audio settle before the standings open. **View standings** or Escape skips the banner. Results show kills, deaths, accuracy, quickscopes, and final standings. **Rematch** keeps the confirmed rules and limits while resetting all state. **New match** opens setup; canceling leaves the results available. Bots currently fight the player, not one another.

Enabled bots use scoped bolt-action sniper rifles. They acquire the player within 35 m, react after 1.10–1.75 seconds, and fire at roughly 1.17–1.47 second intervals. Their rifles have five-round magazines, a 920 ms bolt cycle, and a 2.15 second reload. Ammo and weapon timers persist through lost sight, player death, and spawn protection. At most three attack at once. Slow tracking and imperfect aim make movement useful; actual cover blocks both sight and bullets. Direct hits deal 150 damage, making each shot dangerous. Gun poses, bolt/reload animations, muzzle flashes, pooled tracers, impact marks, sounds, a red overlay, and directional damage indicators show incoming fire. A bounded kill feed identifies the attacker, victim, weapon, and headshot/quickscope/wallbang bonuses.

You have 100 health, which stays damaged until respawn or reset. Death disables player actions and shows a two-second respawn countdown; enemy patrols continue. Respawning restores both magazines and health while keeping match statistics. Ten perimeter spawn candidates are validated against arena collision and living occupants. Selection favors fewer enemy sightlines, distance from nearby enemies, and a different location from the previous spawn. If no point is valid, respawn waits and retries. The initial match spawn stays fixed for repeatable practice; bot respawns also wait if their patrol home is occupied. Three seconds of spawn protection ends early when you fire an enabled damaging weapon or knife.

Knives deal 100 damage with a short wind-up, one contact event, and a 620 ms cooldown. A front-facing target must be within 2 m of its body surface and unobstructed by actual map cover. Melee lowers your firearm, cancels unfinished reloads without granting ammunition, and blocks firing, swaps, aiming, inspection, and sprinting until recovery. Knife eliminations score normally but do not count as firearm accuracy hits.

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
- Movement uses a fixed 120 Hz velocity simulation with IW4L-inspired ground friction followed by directional acceleration. Base forward speed is 6.1 m/s, sprint is 1.5×, strafing is 80%, and backpedaling is 70%. The rifle carries a 5% speed penalty; the pistol moves at base speed. Aiming blends toward 62% of rifle speed or 75% of pistol speed. Reloading, swapping, and the first 200 ms after a shot suppress sprinting. Directional input cannot grant a diagonal speed boost.
- Jumps reach about 1.4 m and retain takeoff momentum, with gravity adapted to the arena's meter scale. WASD steers more gently in the air, with bounded speed so repeated hops cannot stack extra acceleration. Jump presses are buffered for 120 ms before landing; a 100 ms grace window permits jumping just after leaving an edge. Holding jump does not automatically repeat it.
- The collision controller slides along cover, steps up stairs, and follows small downward steps without bouncing off each tread. Crouching reduces the collision hull from 1.75 m to 1.25 m and moves at a base 2.8 m/s before weapon/directional scales. Releasing crouch under low cover keeps the player crouched until there is room to stand; the camera follows the actual stance.
- Weapon presentation includes bounded mouse-turn sway, stance/speed-sensitive bob, a lowered sprint pose, and a 150 ms landing deflection followed by a 300 ms recovery. Gun and camera recoil recover on separate springs, and shots follow the visible crosshair during recoil. Aiming strongly attenuates motion; stair treads do not trigger landing shake. Presentation runs independently of fixed physics. Camera height smooths stair transitions, sprint subtly widens FOV, and footsteps follow actual travel.
- All nine practice enemies wear textured field uniforms, plate carriers, pouches, helmets, goggles, masks, gloves, and detailed boots. They carry scoped rifles with both hands at a low ready and smoothly raise them to the shoulder, turn their torsos toward the player, and lean toward the optic when aiming. Two-bone arm posing keeps the hands on the grip and foreend; hands move for bolting/reloading. Decorative armor and gear do not enlarge the existing hit volumes. A shared cloth texture and detail batches by joint/material keep the additions bounded. Enemies walk along patrol loops, with turns, brief pauses, bending knees, and level boots. Paths avoid map cover; elevated patrols stay on their decks. Enemies stop for nearby characters. Disable **Walking enemies** for stationary practice, or reset the session to return everyone to their spawn. Enable **Enemies shoot back** in match setup for combat practice.
- The rifle has rounded machined edges, an open handguard, fluted barrel, hollow scope housing, coated lenses, adjustment dials, screws, engraved markings, and tactical gloves. Metal, paint, fabric, and rubber use distinct physically based materials. The bolt, hands, and magazine animate independently.
- The scrapyard uses photographed sand, concrete, and rust materials, chipped painted metal, beveled containers with locking hardware, cast Jersey barriers, open steel stairs, hollow pipes, rolled drums, chain-link fences, gravel, tire tracks, and an eroded desert ridge. Physically based lighting, 2K filtered shadows, dust haze, and filmic tone mapping give surfaces more depth. Static detail is batched by material to keep draw calls low. Playable terrain and stair collision retain the original layout.
- Audio uses original locally generated, cached Web Audio samples. Footsteps layer heel/sole impacts, grit, cloth movement, and variation; cached map surface queries select metal tread sounds on stairs/decks. Landings sound heavier, crouch steps are softer, and stride timing follows actual travel and weapon bob. Rifle/pistol reports and mechanical actions use layered impulses rather than short oscillator beeps. A quiet stereo wind, distant machinery, and sparse metal-creak bed fades out on pause, settings, and round finish without stacking on rematches. Master volume controls all sounds, including restrained round-end cues. Map and weapon geometry are authored in code. Public-domain Poly Haven material maps and a Babylon.js reflection environment are bundled locally; credits are in `public/assets/README.md`. Google Fonts are optional and fall back to local fonts.

This is a feel prototype, not a frame-perfect reproduction of MW2. The client runs everything locally; there is no networking, matchmaking, or persistence of match statistics.

Movement and camera/weapon behavior reference [IW4L](https://github.com/vladtrc/iw4L) at commit `1a0daffd182d808ad3fa43adc6da0200fe78610d`. The directional scales, ground/air acceleration model, friction, crouch proportions, and landing timing are adapted to TypeScript. Run speed and the 1.4 m jump height retain this arena's tuning so existing cover remains traversable. Sway, bob amplitudes, recoil springs, and weapon speed penalties are custom tuning. Original game assets and IW4L's engine/renderer are not included. Attribution and the Apache 2.0 license ship in `public/licenses/` and the production build.

## Code

- `src/main.ts`: browser input, fixed-step host loop, Babylon geometry queries, rendering/audio adapters, HUD, and pause.
- `src/matchSimulation.ts`: shared match state and action APIs for movement, weapons, damage, scoring, countdown/finish gates, and respawns; no DOM or Babylon imports. Geometry queries and spawn selection come from the host.
- `src/rounds.ts` / `src/roundUI.ts`: engine-independent round controller and browser countdown/banner/results UI.
- `src/roundOutro.ts`: presentation-only end-of-round clock; gameplay remains frozen.
- `src/spawning.ts`: deterministic, collision-aware spawn selection.
- `src/combatEvents.ts` / `src/combatFeedback.ts`: shared elimination events and bounded browser kill-feed/damage presentation.
- `src/match.ts` / `src/matchSetup.ts`: shared combat contracts, damage rules, and match setup dialog.
- `src/melee.ts` / `src/knife.ts`: cover-aware melee targeting and animated knife model.
- `src/botCombat.ts` / `src/botWeapon.ts`: deterministic sniper attacks and visible bot weapons.
- `src/playerLife.ts`: shared health, protection, death, and respawn timing.
- `src/combatEffects.ts`: bounded incoming-fire tracers.
- `src/ballistics.ts`: cached static surface geometry, material/thickness penetration, damage, and clipped decal projection.
- `src/ballistics.test.ts`: direct shots, material resistance, layered/angled cover, hollow shells, and surface projection checks.
- `src/impacts.ts`: procedural hole textures and a bounded, reusable decal pool.
- `src/settings.ts`: accessible settings dialog, category navigation, defaults, and local preference storage.
- `src/simulation.ts`: engine-independent character collision, gravity, and configurable firearm timing.
- `src/movement.ts`: IW4L-inspired velocity controller, stance clearance, ground/air steering, jump grace/buffering, and stair descent.
- `src/movement.test.ts`: speed limits, acceleration/braking, jump timing, cover collision, ceilings, and actual tower traversal.
- `src/viewMotion.ts`: render-rate weapon sway, bob, sprint pose, landing response, and recoil recovery.
- `src/viewMotion.test.ts`: aiming attenuation, yaw wrapping, landing recovery, repeated recoil, and presentation consistency at 30/60/144 Hz.
- `src/arena.ts`: procedural arena, colliders, and animated patrol enemies.
- `src/enemyAppearance.ts`: shared soldier materials, decorative batching, and rifle hand placement.
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
- `src/audio.ts` / `src/soundDesign.ts`: cached sound variations, footsteps/landings, weapon sounds, ambience, and master-volume lifecycle.
- `src/style.css`: menu, HUD, and scope overlay.

The shared simulation is a starting point for an authoritative multiplayer host. Networking still needs a Node.js/Colyseus server, remote player state, server-side geometry and hit validation, prediction, reconciliation, and lag-compensated hit checks. This build remains entirely local.
