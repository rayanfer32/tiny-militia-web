# Tiny Militia Web - Developer & Agent Guide

> **Quick Reference for AI Agents & Developers**: Read this document first to understand the architecture, coordinate systems, visual style, physics rules, and file layout before making any modifications.

---

## 1. Project Overview & Tech Stack
- **Game**: Modern 2.5D web recreation of **Doodle Army 2: Mini Militia** (Outpost map, single-player wave survival mode, procedural 3D chibi soldiers and weapons, full touch/desktop controls).
- **Engine / Core**: **Three.js** (WebGL 2.5D perspective rendering with toon/PBR materials).
- **Language**: **TypeScript** (strict typing; always ensure `npm run build` succeeds).
- **Bundler / Dev Server**: **Vite** (`bun dev` or `npm run dev`).
- **UI / HUD**: Vanilla HTML5 + CSS with cybernetic glassmorphism, responsive for desktop and mobile.
- **Audio**: Web Audio API Sound Manager ([src/audio.ts](file:///c:/CODE/tiny-militia-web/src/audio.ts)) playing 112 authentic `.wav` sound effects extracted from the official APK in `public/audio/`.

---

## 2. Visual Layer Structure & Coordinate System (CRITICAL)
The game uses a **2.5D perspective** with the camera positioned at `z = 28..32` looking at `(camX, camY, 0)`:

| Layer | Z-Depth Range | Description |
|---|---|---|
| **Gameplay Plane** | `z = 0.0` | **Player, AI Bots, Projectiles, Grenades, Barrels, Pickups**. All collision and gameplay logic occurs strictly on this plane. |
| **Foreground Decor** | `z = -0.5` to `-0.2` | Small stones, standing grass tufts, drooping sod overhang teeth. |
| **Terrain / Rocks** | `z = -3.7` to `-0.1` | Extruded 3D terrain meshes (`depth: 3.5`, `mesh.position.z = -3.7`). Front face is at `z = -0.1`, guaranteeing it is **strictly behind** all gameplay entities. |
| **Palm Trees** | `z = -1.8` | Planted directly on the top surface coordinates of floating islands. Leaves stay behind `z = 0`. |
| **Sky / Clouds** | `z = -25` to `-35` | Procedural dodecahedron clouds drifting horizontally. |
| **Background Hills** | `z = -55` to `-60` | Sphere geometries scaled flat (`scale.z = 0.25`). Never position closer than `z = -50` to avoid occluding the gameplay plane. |

---

## 3. Map Geometry & Physics Engine Rules ([src/physics.ts](file:///c:/CODE/tiny-militia-web/src/physics.ts))
- **Scale Factor**: `scale = 0.045`.
  - World coordinate conversion:
    - `toWorldX(px) = (px - mapPixelWidth / 2) * 0.045`
    - `toWorldY(py) = (mapPixelHeight / 2 - py) * 0.045`
- **Clockwise Winding Outward Normals**:
  - All collision polygons in `public/data/outpost.json` are Clockwise in world space.
  - The outward normal of edge `(p1 -> p2)` is `(-dy / len, dx / len)`.
  - Normal always points **outwards away from the rock interior**.
- **Inward Penetration Prevention**:
  - `isPointInPolygon(pos, poly)`: If an entity's center enters any polygon, it is immediately ejected to the nearest edge along `(seg.nx, seg.ny)`.
  - In `resolveCircle`, push direction is forced to match the outward normal (`if (nx * seg.nx + ny * seg.ny < 0) { nx = seg.nx; ny = seg.ny; }`).
- **Slope Walking (Walk Uphill with 0 Fuel)**:
  - Walkable ground threshold: $n_y > 0.25$ (slopes up to 75°).
  - When on ground (`onGround && !isBoosting`), walking input (`moveX`) drives velocity along the ground tangent:
    $$\vec{T} = \left(\frac{n_y}{\|\vec{n}\|}, -\frac{-n_x}{\|\vec{n}\|}\right)$$
  - This allows the player to run up any hill or slope without needing jetpack fuel.
- **Open Abyss / Freefall**:
  - There is **NO bottom collision boundary floor**.
  - Boundary walls exist only on Left, Right, and Top.
  - Any entity falling below `y < -28` enters the void and triggers abyss death.

---

## 4. Key Files & Responsibilities

### [`src/game.ts`](file:///c:/CODE/tiny-militia-web/src/game.ts)
- **Game Controller & Main Loop**: Handles frame updates (`animate`), match timer, wave state, camera lerping, and screen shake.
- **Player Controller**:
  - Movement integration (ground slope tangent vs air physics).
  - 360° mouse aiming & dual virtual joysticks for mobile.
  - Weapon firing, pellet spread, recoil kick, and automatic reload.
  - `takeDamage()` and `triggerGameOver()`.
- **Test Mode**:
  - Toggle via HUD button or hotkey **`T`** (`toggleTestMode()`).
  - Provides unlimited health (damage immunity) and infinite jetpack fuel.
- **Fullscreen API**:
  - `toggleFullscreen()` and `updateFullscreenUI()` with cross-browser and mobile vendor fallback.

### [`src/map.ts`](file:///c:/CODE/tiny-militia-web/src/map.ts)
- Loads `public/data/outpost.json` (TMX tilemap export).
- **Procedural 3D Terrain**:
  - Extruded polygons using `THREE.ExtrudeGeometry` (never call `geom.center()`—keep 1:1 vertex alignment with collision polygons).
  - Styled after `idea.avif`: warm desert stone (`0xb59e85`), lush grass sod (`0x5ea82e`), drooping triangular overhang tufts, standing sprouts, faceted silhouette boulders, and terracotta clay pockets.
  - Palm trees rooted at exact floating island surface coordinates.

### [`src/proceduralModels.ts`](file:///c:/CODE/tiny-militia-web/src/proceduralModels.ts)
- **Procedural 3D Chibi Soldiers**:
  - Segmented body, rotating arm pivot with weapon mount, animated walk/fly legs, jetpack nozzles with particle mounts.
- **Weapons**: Procedural 3D meshes for AK-47, M16, Shotgun, Magnum .44, Desert Eagle, Sniper Rifle, SMAW Rocket Launcher.
- **Palm Trees**: 7-segment bulging coconut trunk, coconuts cluster, and 8 arched drooping fronds.
- **Environment Props**: Explosive barrels, floating pickup crates/tanks.

### [`src/weapons.ts`](file:///c:/CODE/tiny-militia-web/src/weapons.ts)
- Weapon definitions registry: damage, fire rate, ammo capacity, reload speed, spread, bullet velocity, rocket physics, sound IDs.
- `WeaponInstance` class managing ammo count and reload timers.

### [`src/bot.ts`](file:///c:/CODE/tiny-militia-web/src/bot.ts)
- AI Soldier Bots: state machine (`HUNT` vs `RETREAT`), pathfinding, jetpack lift over obstacles, burst fire, melee knife strikes, and slope traversal parity.

### [`src/particles.ts`](file:///c:/CODE/tiny-militia-web/src/particles.ts)
- High-performance particle pools: jetpack flame/smoke, muzzle flash, bullet impact sparks, blood splatter, and rocket explosion fireballs.

### [`src/audio.ts`](file:///c:/CODE/tiny-militia-web/src/audio.ts)
- Web Audio API Sound Manager with 3D/horizontal panning, loop management (jetpack hum), volume scaling, and voice lines (Sarge callouts).

### [`index.html`](file:///c:/CODE/tiny-militia-web/index.html) & [`src/style.css`](file:///c:/CODE/tiny-militia-web/src/style.css)
- Cybernetic HUD overlay: health/boost meters, wave indicator, match timer, weapon silhouette, ammo/grenade counter, virtual touch joysticks, Test Mode button, and Fullscreen button.

---

## 5. Floating Island Surface Coordinates (Reference for Spawns/Decorations)
If adding props, spawns, or items, use these exact top surface coordinates:

| Island | Poly Index | Surface Center | Length |
|---|---|---|---|
| **Upper-Left Floating Rock** | `Poly 3` | `x = -17.5, y = 13.8` | `len = 6.1` |
| **Upper-Right Floating Rock** | `Poly 6` | `x = 26.0, y = 16.2` | `len = 2.8` |
| **Central Island Ridge** | `Poly 5` | `x = 8.5, y = 8.8` | `len = 8.1` |
| **Mid-Left Floating Rock** | `Poly 4` | `x = -21.5, y = 1.5` | `len = 7.6` |
| **Mid-Right Floating Rock** | `Poly 7` | `x = 33.5, y = 2.4` | `len = 4.9` |
| **Left High Cliff** | `Poly 1` | `x = -53.5, y = 9.2` | `len = 8.7` |
| **Right High Cliff** | `Poly 8` | `x = 48.0, y = 11.2` | `len = 14.3` |
| **Right Ground Plateau** | `Poly 12` | `x = 56.5, y = -4.7` | `len = 8.2` |

---

## 6. Development & Contribution Rules
1. **Always Verify Builds**: Run `npm run build` after editing any TypeScript files to prevent broken builds.
2. **Never Shift Terrain Geometries**: Do not call `geometry.center()` on map extrusions; Three.js shape vertices must remain 1:1 with collision polygon vertices.
3. **Preserve Gameplay Z-Plane**: Keep all interactive entities at `z = 0` and terrain/decor at `z < 0`.
4. **Follow `/donot-assume-anything-just-ask`**: If requirements or design preferences are ambiguous, ask the user before making major architectural changes.
