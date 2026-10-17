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

  constructor(scene: THREE.Scene, physics: PhysicsEngine) {
    this.scene = scene;
    this.physics = physics;
    this.mapGroup = new THREE.Group();
    this.scene.add(this.mapGroup);

    this.rockMat = new THREE.MeshToonMaterial({
      color: 0x757f86,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });

    this.grassMat = new THREE.MeshToonMaterial({
      color: 0x55a630
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
      bevelSize: 0.1,
      bevelThickness: 0.1
    };

    polygons.forEach((poly) => {
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
      // Place rock behind player plane (front face at -3.7 + 3.5 + 0.1 = -0.1)
      mesh.position.set(0, 0, -3.7);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.mapGroup.add(mesh);

      // Add stylized cartoon green grass trims along upward-facing edges
      for (let i = 0; i < worldPts.length; i++) {
        const p1 = worldPts[i];
        const p2 = worldPts[(i + 1) % worldPts.length];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.1) continue;

        // In CW polygons, normal ny = dx / len. Surfaces with dx / len > 0.35 are walk-on ground
        if (dx / len > 0.35) {
          const grassBoxGeo = new THREE.BoxGeometry(len + 0.15, 0.35, 3.6);
          const grass = new THREE.Mesh(grassBoxGeo, this.grassMat);
          grass.position.set((p1.x + p2.x) / 2, (p1.y + p2.y) / 2 + 0.05, -1.95);
          grass.rotation.z = Math.atan2(dy, dx);
          this.mapGroup.add(grass);

          if (Math.random() < 0.5 && len > 3) {
            const rock = createRock(0.3 + Math.random() * 0.3);
            rock.position.set(
              p1.x + (Math.random() * 0.6 + 0.2) * dx,
              p1.y + 0.15,
              -0.5 + (Math.random() - 0.5) * 0.2
            );
            this.mapGroup.add(rock);
          }
        }
      }
    });
  }

  private buildDecorations(): void {
    const palmPositions = [
      { x: -28, y: 12 },
      { x: -14, y: 7 },
      { x: 4, y: 6 },
      { x: 18, y: 11 },
      { x: 32, y: 4 },
      { x: -45, y: -2 }
    ];

    palmPositions.forEach(pos => {
      const palm = createPalmTree();
      palm.position.set(pos.x, pos.y, -2.0);
      palm.scale.set(1.1, 1.1, 1.1);
      this.mapGroup.add(palm);
    });
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

    for (const pickup of this.pickups) {
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
