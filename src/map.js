// Tiny Militia Web - 3D Outpost Map Environment Builder (Three.js)
import * as THREE from 'three';
import { createPalmTree, createRock, createBarrel, createPickupItem } from './proceduralModels.js';

export class OutpostMap {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.mapGroup = new THREE.Group();
    this.scene.add(this.mapGroup);

    this.spawns = [];
    this.weaponSpawns = [];
    this.barrels = [];
    this.pickups = [];
    this.clouds = [];

    // Materials
    this.rockMat = new THREE.MeshToonMaterial({
      color: 0x757f86,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });

    this.grassMat = new THREE.MeshToonMaterial({
      color: 0x55a630
    });

    this.bunkerMat = new THREE.MeshToonMaterial({
      color: 0x5c677d
    });

    this.tunnelMat = new THREE.MeshToonMaterial({
      color: 0x333533
    });
  }

  async load() {
    try {
      const res = await fetch('/data/outpost.json');
      const data = await res.json();

      this.physics.loadMapGeometry(data);

      // Build 3D extruded terrain meshes
      this.buildTerrain(data.collision_polys);

      // Extract spawn points
      this.spawns = data.spawns.map(s => ({
        name: s.name,
        x: this.physics.toWorldX(s.x),
        y: this.physics.toWorldY(s.y)
      }));

      // Extract weapon spawns
      this.weaponSpawns = data.weapon_spawns.map(w => ({
        name: w.name,
        x: this.physics.toWorldX(w.x),
        y: this.physics.toWorldY(w.y),
        weapon: w.weapon
      }));

      // Build decorations (Palm trees, bushes, rocks)
      this.buildDecorations(data.decorations);

      // Build scenic background (mountains, ocean horizon, 3D clouds)
      this.buildScenery();

      // Spawn initial weapon pickups and explosive barrels
      this.spawnInitialItems();

      console.log('3D Outpost environment created successfully!');
    } catch (e) {
      console.error('Failed to load outpost map:', e);
    }
  }

  buildTerrain(polygons) {
    const extrudeSettings = {
      depth: 3.5,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.15,
      bevelThickness: 0.15
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
      geom.center(); // Center local anchor, then reposition

      // Calculate centroid
      let cx = 0, cy = 0;
      for (const p of worldPts) {
        cx += p.x;
        cy += p.y;
      }
      cx /= worldPts.length;
      cy /= worldPts.length;

      const mesh = new THREE.Mesh(geom, this.rockMat);
      mesh.position.set(cx, cy, -0.2);
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

        // If edge is roughly horizontal and facing upwards (top surface)
        if (dy / len < 0.35 && dx > 0) {
          const grassBoxGeo = new THREE.BoxGeometry(len, 0.45, 3.8);
          const grass = new THREE.Mesh(grassBoxGeo, this.grassMat);
          grass.position.set((p1.x + p2.x) / 2, (p1.y + p2.y) / 2 + 0.15, -0.2);
          grass.rotation.z = Math.atan2(dy, dx);
          this.mapGroup.add(grass);

          // Random tiny decorative rocks on grass
          if (Math.random() < 0.6 && len > 3) {
            const rock = createRock(0.4 + Math.random() * 0.4);
            rock.position.set(
              p1.x + (Math.random() * 0.6 + 0.2) * dx,
              p1.y + 0.3,
              0.5 + (Math.random() - 0.5) * 1.5
            );
            this.mapGroup.add(rock);
          }
        }
      }
    });
  }

  buildDecorations(decorations) {
    // Add palm trees at data points and key cliff tops
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
      palm.position.set(pos.x, pos.y, -0.5);
      palm.scale.set(1.1, 1.1, 1.1);
      this.mapGroup.add(palm);
    });
  }

  buildScenery() {
    // 1. Distant rolling green hills/mountains (Parallax background)
    const hillMat = new THREE.MeshToonMaterial({ color: 0x386641 });
    const distantHillMat = new THREE.MeshToonMaterial({ color: 0x2d6a4f, transparent: true, opacity: 0.85 });

    for (let i = -4; i <= 4; i++) {
      const hillGeo = new THREE.SphereGeometry(22 + Math.random() * 8, 16, 12);
      const hill = new THREE.Mesh(hillGeo, (i % 2 === 0) ? hillMat : distantHillMat);
      hill.position.set(i * 24 + Math.random() * 6, -26 + Math.random() * 4, -18 - Math.random() * 10);
      hill.scale.set(1.4, 0.7, 1);
      this.mapGroup.add(hill);
    }

    // 2. 3D Low-Poly Floating Clouds
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
        -12 - Math.random() * 16
      );

      this.mapGroup.add(cloudGroup);
      this.clouds.push({
        group: cloudGroup,
        speed: 0.8 + Math.random() * 1.4
      });
    }
  }

  spawnInitialItems() {
    // Spawn explosive red barrels near covers and bridges
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

    // Spawn authentic weapon & health drops at map weapon points
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

  update(dt) {
    // Drifting clouds animation
    for (const cloud of this.clouds) {
      cloud.group.position.x += cloud.speed * dt;
      if (cloud.group.position.x > 90) {
        cloud.group.position.x = -90;
      }
    }

    // Floating pickups bobbing and rotating
    for (const pickup of this.pickups) {
      pickup.userData.hoverTime += dt * 3;
      pickup.position.y = pickup.userData.startY + Math.sin(pickup.userData.hoverTime) * 0.15;
      pickup.rotation.y += dt * 1.5;
    }
  }

  removePickup(pickup) {
    const idx = this.pickups.indexOf(pickup);
    if (idx !== -1) {
      this.scene.remove(pickup);
      this.pickups.splice(idx, 1);
    }
  }

  removeBarrel(barrel) {
    const idx = this.barrels.indexOf(barrel);
    if (idx !== -1) {
      this.scene.remove(barrel);
      this.barrels.splice(idx, 1);
    }
  }
}
