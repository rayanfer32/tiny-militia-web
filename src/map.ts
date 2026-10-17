// Tiny Militia Web - 3D Outpost Map Environment Builder (TypeScript)
import * as THREE from 'three';
import { PhysicsEngine, MapDataJson } from './physics.js';
import { createPalmTree, createRock, createBarrel, createPickupItem } from './proceduralModels.js';

export interface SpawnPoint {
  name: string;
  x: number;
  y: number;
}

export interface WeaponSpawnPoint {
  name: string;
  x: number;
  y: number;
  weapon: string;
}

export interface CloudItem {
  group: THREE.Group;
  speed: number;
}

export class OutpostMap {
  public scene: THREE.Scene;
  public physics: PhysicsEngine;
  public mapGroup: THREE.Group;

  public spawns: SpawnPoint[] = [];
  public weaponSpawns: WeaponSpawnPoint[] = [];
  public barrels: THREE.Group[] = [];
  public pickups: THREE.Group[] = [];
  public clouds: CloudItem[] = [];

  private rockMat: THREE.MeshToonMaterial;
  private grassMat: THREE.MeshToonMaterial;
  private grassDarkMat: THREE.MeshToonMaterial;
  private clayMat: THREE.MeshToonMaterial;

  constructor(scene: THREE.Scene, physics: PhysicsEngine) {
    this.scene = scene;
    this.physics = physics;
    this.mapGroup = new THREE.Group();
    this.scene.add(this.mapGroup);

    // Warm desert stone palette matching idea.avif
    this.rockMat = new THREE.MeshToonMaterial({
      color: 0xb59e85,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });

    // Lush vibrant cartoon grass sod
    this.grassMat = new THREE.MeshToonMaterial({
      color: 0x5ea82e
    });

    this.grassDarkMat = new THREE.MeshToonMaterial({
      color: 0x467e22
    });

    // Terracotta clay soil pocket accent
    this.clayMat = new THREE.MeshToonMaterial({
      color: 0x98523d
    });
  }

  public async load(): Promise<void> {
    try {
      const res = await fetch('/data/outpost.json');
      const data: MapDataJson = await res.json();

      this.physics.loadMapGeometry(data);

      this.buildTerrain(data.collision_polys);

      this.spawns = data.spawns.map(s => ({
        name: s.name,
        x: this.physics.toWorldX(s.x),
        y: this.physics.toWorldY(s.y)
      }));

      this.weaponSpawns = data.weapon_spawns.map(w => ({
        name: w.name,
        x: this.physics.toWorldX(w.x),
        y: this.physics.toWorldY(w.y),
        weapon: w.weapon
      }));

      this.buildDecorations();
      this.buildScenery();
      this.spawnInitialItems();

      console.log('3D Outpost environment created successfully!');
    } catch (e) {
      console.error('Failed to load outpost map:', e);
    }
  }

  private buildTerrain(polygons: MapDataJson['collision_polys']): void {
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: 3.5,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.12,
      bevelThickness: 0.12
    };

    polygons.forEach((poly, polyIdx) => {
      if (poly.points.length < 3) return;

      const shape = new THREE.Shape();
      const worldPts = poly.points.map(pt => ({
        x: this.physics.toWorldX(pt[0]),
        y: this.physics.toWorldY(pt[1])
      }));

      shape.moveTo(worldPts[0].x, worldPts[0].y);
      for (let i = 1; i < worldPts.length; i++) {
        shape.lineTo(worldPts[i].x, worldPts[i].y);
      }
      shape.closePath();

      const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);

      // Do NOT center geom: keeps coordinates 1:1 with collision segments
      const mesh = new THREE.Mesh(geom, this.rockMat);
      mesh.position.set(0, 0, -3.7);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.mapGroup.add(mesh);

      // Add terracotta clay cutout pockets on select large rock faces (matching idea.avif)
      if ([1, 5, 7, 12].includes(polyIdx)) {
        const avgX = worldPts.reduce((s, p) => s + p.x, 0) / worldPts.length;
        const avgY = worldPts.reduce((s, p) => s + p.y, 0) / worldPts.length;

        const clayRadius = polyIdx === 12 ? 2.4 : 1.6;
        const clayGeo = new THREE.CylinderGeometry(clayRadius, clayRadius, 0.15, 14);
        clayGeo.rotateX(Math.PI / 2);
        const clayMesh = new THREE.Mesh(clayGeo, this.clayMat);
        clayMesh.position.set(avgX + 0.5, avgY - 0.3, -0.15);
        this.mapGroup.add(clayMesh);

        // Frame clay pocket with a few small stones
        for (let a = 0; a < 5; a++) {
          const theta = (a / 5) * Math.PI * 2;
          const rChunk = createRock(0.25, 'sandy');
          rChunk.position.set(
            avgX + 0.5 + Math.cos(theta) * clayRadius,
            avgY - 0.3 + Math.sin(theta) * clayRadius,
            -0.12
          );
          this.mapGroup.add(rChunk);
        }
      }

      // Add stylized layered cartoon grass, drooping tufts, and faceted boulders
      for (let i = 0; i < worldPts.length; i++) {
        const p1 = worldPts[i];
        const p2 = worldPts[(i + 1) % worldPts.length];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.1) continue;

        // Silhouette faceted rocks embedded along rock edges and corners
        if (len > 0.8 && (i % 2 === 0)) {
          const boulder = createRock(
            0.35 + Math.random() * 0.45,
            Math.random() < 0.6 ? 'sandy' : (Math.random() < 0.5 ? 'warm' : 'grey')
          );
          boulder.position.set(
            p1.x + dx * 0.5 + (Math.random() - 0.5) * 0.3,
            p1.y + dy * 0.5 + (Math.random() - 0.5) * 0.3,
            -0.45 + (Math.random() - 0.5) * 0.3
          );
          boulder.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
          this.mapGroup.add(boulder);
        }

        // In CW polygons: normal ny = dx / len. Surfaces with dx / len > 0.35 are walk-on ground
        if (dx / len > 0.35) {
          // 1. Main grass sod bed
          const grassBoxGeo = new THREE.BoxGeometry(len + 0.2, 0.4, 3.6);
          const grass = new THREE.Mesh(grassBoxGeo, this.grassMat);
          grass.position.set((p1.x + p2.x) / 2, (p1.y + p2.y) / 2 + 0.08, -1.95);
          grass.rotation.z = Math.atan2(dy, dx);
          this.mapGroup.add(grass);

          // 2. Hanging / Drooping stylized triangular grass tufts (concept art charm!)
          const edgeAngle = Math.atan2(dy, dx);
          const tuftCount = Math.max(1, Math.floor(len / 1.1));
          for (let t = 0; t <= tuftCount; t++) {
            const frac = (t + 0.25) / (tuftCount + 0.5);
            const tx = p1.x + frac * dx;
            const ty = p1.y + frac * dy;

            const tuftH = 0.35 + (t % 3) * 0.12;
            const tuftGeo = new THREE.ConeGeometry(0.18, tuftH, 3);
            tuftGeo.rotateZ(Math.PI); // Point downward
            const tuft = new THREE.Mesh(tuftGeo, t % 2 === 0 ? this.grassMat : this.grassDarkMat);
            tuft.position.set(tx, ty - 0.12, -0.15);
            tuft.rotation.z = edgeAngle + Math.PI + (Math.random() - 0.5) * 0.2;
            this.mapGroup.add(tuft);
          }

          // 3. Standing grass sprouts on top surface
          if (len > 1.8) {
            const sproutGeo = new THREE.ConeGeometry(0.08, 0.32, 3);
            const sprout = new THREE.Mesh(sproutGeo, this.grassMat);
            sprout.position.set(p1.x + dx * 0.4, p1.y + dy * 0.4 + 0.28, -0.3);
            sprout.rotation.z = edgeAngle + (Math.random() - 0.5) * 0.3;
            this.mapGroup.add(sprout);
          }

          // 4. Cluster of low-poly stone boulders on the walking surface
          if (Math.random() < 0.65 && len > 2.5) {
            const rock = createRock(0.35 + Math.random() * 0.35, 'sandy');
            rock.position.set(
              p1.x + (Math.random() * 0.6 + 0.2) * dx,
              p1.y + 0.22,
              -0.45 + (Math.random() - 0.5) * 0.2
            );
            this.mapGroup.add(rock);
          }
        }
      }
    });
  }

  private buildDecorations(): void {
    // Palm trees planted strictly on the top grass surfaces of floating rocks and cliffs
    const palmLocations = [
      // Left high floating rock (Poly 3) - rooted on top surface
      { x: -17.5, y: 13.8, lean: 0.14, scale: 1.15 },
      // Right high floating rock (Poly 6) - rooted on top surface
      { x: 26.0, y: 16.2, lean: -0.16, scale: 1.12 },
      // Central floating island (Poly 5) - upper ridge
      { x: 8.5, y: 8.8, lean: 0.12, scale: 1.2 },
      // Mid-left floating rock (Poly 4)
      { x: -21.5, y: 1.5, lean: -0.12, scale: 1.05 },
      // Mid-right floating rock (Poly 7)
      { x: 33.5, y: 2.4, lean: 0.14, scale: 1.08 },
      // Left large cliff (Poly 1)
      { x: -53.5, y: 9.2, lean: -0.15, scale: 1.25 },
      // Right large upper island (Poly 8)
      { x: 48.0, y: 11.2, lean: 0.16, scale: 1.25 },
      // Right ground plateau (Poly 12)
      { x: 56.5, y: -4.7, lean: -0.12, scale: 1.15 },
      { x: 63.5, y: -4.7, lean: 0.14, scale: 1.1 }
    ];

    palmLocations.forEach(p => {
      const palm = createPalmTree(p.lean);
      palm.position.set(p.x, p.y, -1.8);
      palm.scale.set(p.scale, p.scale, p.scale);
      this.mapGroup.add(palm);
    });

    // Small wood stump / log detail on left cliff (matching idea.avif)
    const logGeo = new THREE.CylinderGeometry(0.32, 0.35, 0.55, 8);
    const logMat = new THREE.MeshToonMaterial({ color: 0x7a431d });
    const log = new THREE.Mesh(logGeo, logMat);
    log.position.set(-18.5, -4.2, -0.6);
    this.mapGroup.add(log);
  }

  private buildScenery(): void {
    const hillMat = new THREE.MeshToonMaterial({ color: 0x386641 });
    const distantHillMat = new THREE.MeshToonMaterial({ color: 0x2d6a4f, transparent: true, opacity: 0.85 });

    // Distant background mountains safely set far behind gameplay plane
    for (let i = -4; i <= 4; i++) {
      const radius = 24 + Math.random() * 8;
      const hillGeo = new THREE.SphereGeometry(radius, 16, 12);
      const hill = new THREE.Mesh(hillGeo, (i % 2 === 0) ? hillMat : distantHillMat);
      hill.position.set(i * 24 + Math.random() * 6, -26 + Math.random() * 4, -55 - Math.random() * 10);
      hill.scale.set(1.5, 0.65, 0.25);
      this.mapGroup.add(hill);
    }

    const cloudMat = new THREE.MeshToonMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92
    });

    for (let i = 0; i < 12; i++) {
      const cloudGroup = new THREE.Group();
      const puffCount = 4 + Math.floor(Math.random() * 4);
      for (let p = 0; p < puffCount; p++) {
        const puffGeo = new THREE.DodecahedronGeometry(2.5 + Math.random() * 2.5, 1);
        const puff = new THREE.Mesh(puffGeo, cloudMat);
        puff.position.set(
          (p - puffCount / 2) * 2.5 + (Math.random() - 0.5) * 1.5,
          (Math.random() - 0.5) * 1.2,
          (Math.random() - 0.5) * 1.5
        );
        cloudGroup.add(puff);
      }

      cloudGroup.position.set(
        (Math.random() - 0.5) * 160,
        15 + Math.random() * 18,
        -25 - Math.random() * 15
      );

      this.mapGroup.add(cloudGroup);
      this.clouds.push({
        group: cloudGroup,
        speed: 0.8 + Math.random() * 1.4
      });
    }
  }

  private spawnInitialItems(): void {
    const barrelLocations = [
      { x: -18, y: -4.5 },
      { x: -6, y: -6.0 },
      { x: 12, y: -4.0 },
      { x: 26, y: -5.0 },
      { x: -35, y: 5.5 }
    ];

    barrelLocations.forEach(b => {
      const barrel = createBarrel(b.x, b.y);
      this.scene.add(barrel);
      this.barrels.push(barrel);
    });

    this.weaponSpawns.forEach(w => {
      let pickType = 'ak47';
      const wList = w.weapon.toLowerCase();
      if (wList.includes('health')) pickType = 'healthpack';
      else if (wList.includes('boost')) pickType = 'boosttank';
      else if (wList.includes('smaw') || wList.includes('rocket')) pickType = 'rocket';
      else if (wList.includes('m93ba') || wList.includes('sniper')) pickType = 'sniper';
      else if (wList.includes('shotgun')) pickType = 'shotgun';
      else if (wList.includes('magnum')) pickType = 'magnum';
      else if (wList.includes('m16')) pickType = 'm16';

      const pickup = createPickupItem(pickType, w.x, w.y);
      this.scene.add(pickup);
      this.pickups.push(pickup);
    });
  }

  public update(dt: number): void {
    for (const cloud of this.clouds) {
      cloud.group.position.x += cloud.speed * dt;
      if (cloud.group.position.x > 90) {
        cloud.group.position.x = -90;
      }
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pickup = this.pickups[i];
      if (pickup.position.y < -28) {
        this.scene.remove(pickup);
        this.pickups.splice(i, 1);
        continue;
      }
      pickup.userData.hoverTime += dt * 3;
      pickup.position.y = pickup.userData.startY + Math.sin(pickup.userData.hoverTime) * 0.15;
      pickup.rotation.y += dt * 1.5;
    }
  }

  public removePickup(pickup: THREE.Group): void {
    const idx = this.pickups.indexOf(pickup);
    if (idx !== -1) {
      this.scene.remove(pickup);
      this.pickups.splice(idx, 1);
    }
  }

  public removeBarrel(barrel: THREE.Group): void {
    const idx = this.barrels.indexOf(barrel);
    if (idx !== -1) {
      this.scene.remove(barrel);
      this.barrels.splice(idx, 1);
    }
  }
}
