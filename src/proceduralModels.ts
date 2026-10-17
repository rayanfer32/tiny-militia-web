// Tiny Militia Web - Stylized 3D Procedural Assets Generator (TypeScript)
import * as THREE from 'three';

// Stylized Materials Palette
export const MATS: Record<string, THREE.Material> = {
  soldierSkin: new THREE.MeshToonMaterial({ color: 0xe0a986 }),
  camoGreen: new THREE.MeshToonMaterial({ color: 0x4f772d }),
  camoDark: new THREE.MeshToonMaterial({ color: 0x31572c }),
  helmetRed: new THREE.MeshToonMaterial({ color: 0xd90429 }),
  helmetGreen: new THREE.MeshToonMaterial({ color: 0x2d6a4f }),
  beretGreen: new THREE.MeshToonMaterial({ color: 0x1b4332 }),
  sunglasses: new THREE.MeshToonMaterial({ color: 0x111111 }),
  vestGrey: new THREE.MeshToonMaterial({ color: 0x495057 }),
  bootsBlack: new THREE.MeshToonMaterial({ color: 0x212529 }),
  jetpackMetal: new THREE.MeshToonMaterial({ color: 0x6c757d }),
  jetNozzle: new THREE.MeshToonMaterial({ color: 0x343a40 }),

  // Weapons
  gunMetal: new THREE.MeshToonMaterial({ color: 0x2b2d42 }),
  gunWood: new THREE.MeshToonMaterial({ color: 0x8d5b4c }),
  gunMag: new THREE.MeshToonMaterial({ color: 0x1c1d24 }),
  rocketBody: new THREE.MeshToonMaterial({ color: 0x588157 }),
  scopeLens: new THREE.MeshToonMaterial({ color: 0x00f5d4 }),
  grenadeGreen: new THREE.MeshToonMaterial({ color: 0x386641 }),

  // Environment & Objects
  palmTrunk: new THREE.MeshToonMaterial({ color: 0x8b5a2b }),
  palmLeaves: new THREE.MeshToonMaterial({ color: 0x55a630 }),
  rockGrey: new THREE.MeshToonMaterial({ color: 0x6c757d }),
  crateWood: new THREE.MeshToonMaterial({ color: 0x9c6644 }),
  barrelRed: new THREE.MeshToonMaterial({ color: 0xe63946 }),
  barrelYellow: new THREE.MeshToonMaterial({ color: 0xffb703 }),
  healthWhite: new THREE.MeshToonMaterial({ color: 0xf8f9fa }),
  healthCross: new THREE.MeshToonMaterial({ color: 0xe63946 }),
  boostBlue: new THREE.MeshToonMaterial({ color: 0x00b4d8 })
};

export interface SoldierModelOptions {
  isBot?: boolean;
  helmetColor?: 'red' | 'green' | 'beret' | string;
}

export interface SoldierModel {
  root: THREE.Group;
  armPivot: THREE.Group;
  weaponMount: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftNozzle: THREE.Mesh;
  rightNozzle: THREE.Mesh;
  jetpackGroup: THREE.Group;
  walkCycle: number;
  animateWalk(speed: number, isFlying: boolean): void;
}

/**
 * Creates a cute 3D stylized soldier character matching the concept art
 */
export function createSoldierModel(options: SoldierModelOptions = {}): SoldierModel {
  const isBot = !!options.isBot;
  const helmetColor = options.helmetColor || (isBot ? 'red' : 'green');

  const group = new THREE.Group();
  group.name = isBot ? 'bot_soldier' : 'player_soldier';

  // 1. Torso / Body
  const torsoGeo = new THREE.CylinderGeometry(0.38, 0.32, 0.65, 8);
  const torsoMat = isBot ? MATS.camoDark : MATS.camoGreen;
  const torso = new THREE.Mesh(torsoGeo, torsoMat);
  torso.position.y = 0.55;
  torso.castShadow = true;
  group.add(torso);

  // Tactical vest harness
  const vestGeo = new THREE.CylinderGeometry(0.42, 0.36, 0.45, 8);
  const vest = new THREE.Mesh(vestGeo, MATS.vestGrey);
  vest.position.y = 0.58;
  group.add(vest);

  // 2. Head
  const headGeo = new THREE.SphereGeometry(0.38, 12, 10);
  const head = new THREE.Mesh(headGeo, MATS.soldierSkin);
  head.position.y = 1.08;
  head.castShadow = true;
  group.add(head);

  // Helmet / Headwear
  if (helmetColor === 'red') {
    const helmGeo = new THREE.SphereGeometry(0.42, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const helm = new THREE.Mesh(helmGeo, MATS.helmetRed);
    helm.position.y = 1.12;
    helm.rotation.x = -0.1;
    group.add(helm);
  } else if (helmetColor === 'beret') {
    const beretGeo = new THREE.CylinderGeometry(0.44, 0.36, 0.18, 10);
    const beret = new THREE.Mesh(beretGeo, MATS.beretGreen);
    beret.position.set(0.04, 1.25, 0);
    beret.rotation.z = -0.25;
    group.add(beret);
  } else {
    const helmGeo = new THREE.SphereGeometry(0.42, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const helm = new THREE.Mesh(helmGeo, MATS.helmetGreen);
    helm.position.y = 1.12;
    group.add(helm);

    const rimGeo = new THREE.TorusGeometry(0.42, 0.05, 6, 12);
    const rim = new THREE.Mesh(rimGeo, MATS.helmetGreen);
    rim.position.y = 1.1;
    rim.rotation.x = Math.PI / 2;
    group.add(rim);
  }

  // Tactical Sunglasses / Visor
  const glassesGeo = new THREE.BoxGeometry(0.48, 0.15, 0.16);
  const glasses = new THREE.Mesh(glassesGeo, MATS.sunglasses);
  glasses.position.set(0, 1.1, 0.32);
  group.add(glasses);

  // 3. Jetpack on Back
  const jetpackGroup = new THREE.Group();
  jetpackGroup.position.set(0, 0.6, -0.32);

  const jetBodyGeo = new THREE.BoxGeometry(0.4, 0.5, 0.22);
  const jetBody = new THREE.Mesh(jetBodyGeo, MATS.jetpackMetal);
  jetpackGroup.add(jetBody);

  const nozzleGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.25, 8);
  const leftNozzle = new THREE.Mesh(nozzleGeo, MATS.jetNozzle);
  leftNozzle.position.set(-0.16, -0.28, 0);
  jetpackGroup.add(leftNozzle);

  const rightNozzle = new THREE.Mesh(nozzleGeo, MATS.jetNozzle);
  rightNozzle.position.set(0.16, -0.28, 0);
  jetpackGroup.add(rightNozzle);

  group.add(jetpackGroup);

  // 4. Arms & Gun Pivot
  const armPivot = new THREE.Group();
  armPivot.position.set(0, 0.72, 0);

  const weaponMount = new THREE.Group();
  weaponMount.position.set(0.4, -0.05, 0.3);
  armPivot.add(weaponMount);

  const handGeo = new THREE.SphereGeometry(0.1, 8, 6);
  const rightHand = new THREE.Mesh(handGeo, MATS.soldierSkin);
  rightHand.position.set(0.35, -0.05, 0.2);
  armPivot.add(rightHand);

  const leftHand = new THREE.Mesh(handGeo, MATS.soldierSkin);
  leftHand.position.set(0.15, -0.1, 0.4);
  armPivot.add(leftHand);

  group.add(armPivot);

  // 5. Legs / Boots
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.18, 0.35, 0);
  const bootGeo = new THREE.BoxGeometry(0.18, 0.38, 0.26);
  const leftBoot = new THREE.Mesh(bootGeo, MATS.bootsBlack);
  leftBoot.position.y = -0.15;
  leftBoot.position.z = 0.04;
  leftLeg.add(leftBoot);
  group.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.18, 0.35, 0);
  const rightBoot = new THREE.Mesh(bootGeo, MATS.bootsBlack);
  rightBoot.position.y = -0.15;
  rightBoot.position.z = 0.04;
  rightLeg.add(rightBoot);
  group.add(rightLeg);

  return {
    root: group,
    armPivot,
    weaponMount,
    leftLeg,
    rightLeg,
    leftNozzle,
    rightNozzle,
    jetpackGroup,
    walkCycle: 0,
    animateWalk(speed: number, isFlying: boolean) {
      if (isFlying) {
        this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0.6, 0.15);
        this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0.4, 0.15);
      } else if (Math.abs(speed) > 0.1) {
        this.walkCycle += Math.abs(speed) * 0.2;
        this.leftLeg.rotation.x = Math.sin(this.walkCycle) * 0.7;
        this.rightLeg.rotation.x = -Math.sin(this.walkCycle) * 0.7;
      } else {
        this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, 0.2);
        this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, 0.2);
      }
    }
  };
}

/**
 * Creates 3D procedural weapon meshes
 */
export function createWeaponMesh(weaponId: string): THREE.Group {
  const group = new THREE.Group();
  group.name = `weapon_${weaponId}`;

  switch (weaponId) {
    case 'ak47': {
      const rec = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.08), MATS.gunMetal);
      group.add(rec);

      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.07), MATS.gunWood);
      stock.position.set(-0.35, -0.03, 0);
      group.add(stock);

      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 0.075), MATS.gunWood);
      hand.position.set(0.3, 0, 0);
      group.add(hand);

      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 6), MATS.gunMetal);
      barrel.rotation.z = -Math.PI / 2;
      barrel.position.set(0.55, 0.02, 0);
      group.add(barrel);

      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.06), MATS.gunMag);
      mag.position.set(0.08, -0.16, 0);
      mag.rotation.z = -0.25;
      group.add(mag);

      const muzzle = new THREE.Object3D();
      muzzle.position.set(0.8, 0.02, 0);
      group.add(muzzle);
      group.userData.muzzle = muzzle;
      break;
    }
    case 'm16': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.14, 0.08), MATS.gunMetal);
      group.add(body);

      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.07), MATS.gunMetal);
      stock.position.set(-0.4, -0.02, 0);
      group.add(stock);

      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 0.05), MATS.gunMetal);
      sight.position.set(0, 0.1, 0);
      group.add(sight);

      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 6), MATS.gunMetal);
      barrel.rotation.z = -Math.PI / 2;
      barrel.position.set(0.5, 0.01, 0);
      group.add(barrel);

      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.06), MATS.gunMag);
      mag.position.set(0.1, -0.15, 0);
      group.add(mag);

      const muzzle = new THREE.Object3D();
      muzzle.position.set(0.72, 0.01, 0);
      group.add(muzzle);
      group.userData.muzzle = muzzle;
      break;
    }
    case 'shotgun': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.09), MATS.gunMetal);
      group.add(body);

      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.07), MATS.gunWood);
      stock.position.set(-0.35, -0.04, 0);
      group.add(stock);

      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.6, 8), MATS.gunMetal);
      barrel.rotation.z = -Math.PI / 2;
      barrel.position.set(0.45, 0.03, 0);
      group.add(barrel);

      const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8), MATS.gunWood);
      pump.rotation.z = -Math.PI / 2;
      pump.position.set(0.35, -0.03, 0);
      group.add(pump);

      const muzzle = new THREE.Object3D();
      muzzle.position.set(0.76, 0.03, 0);
      group.add(muzzle);
      group.userData.muzzle = muzzle;
      break;
    }
    case 'magnum':
    case 'deagle': {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.08), MATS.gunMetal);
      group.add(frame);

      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.07), MATS.gunWood);
      grip.position.set(-0.1, -0.14, 0);
      grip.rotation.z = -0.3;
      group.add(grip);

      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.07), MATS.gunMetal);
      barrel.position.set(0.25, 0.02, 0);
      group.add(barrel);

      const muzzle = new THREE.Object3D();
      muzzle.position.set(0.4, 0.02, 0);
      group.add(muzzle);
      group.userData.muzzle = muzzle;
      break;
    }
    case 'sniper': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.12, 0.08), MATS.gunMetal);
      group.add(body);

      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.07), MATS.gunMetal);
      stock.position.set(-0.45, -0.03, 0);
      group.add(stock);

      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 6), MATS.gunMetal);
      barrel.rotation.z = -Math.PI / 2;
      barrel.position.set(0.7, 0.02, 0);
      group.add(barrel);

      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.35, 8), MATS.gunMetal);
      scope.rotation.z = -Math.PI / 2;
      scope.position.set(0.05, 0.14, 0);
      group.add(scope);

      const muzzle = new THREE.Object3D();
      muzzle.position.set(1.15, 0.02, 0);
      group.add(muzzle);
      group.userData.muzzle = muzzle;
      break;
    }
    case 'rocket': {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.1, 10), MATS.rocketBody);
      tube.rotation.z = -Math.PI / 2;
      group.add(tube);

      const muzzleCone = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.15, 10), MATS.gunMetal);
      muzzleCone.rotation.z = -Math.PI / 2;
      muzzleCone.position.set(0.55, 0, 0);
      group.add(muzzleCone);

      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.08), MATS.gunMetal);
      sight.position.set(0.1, 0.16, 0);
      group.add(sight);

      const muzzle = new THREE.Object3D();
      muzzle.position.set(0.65, 0, 0);
      group.add(muzzle);
      group.userData.muzzle = muzzle;
      break;
    }
  }

  return group;
}

/**
 * Creates 3D stylized palm tree matching the concept art
 */
export function createPalmTree(): THREE.Group {
  const tree = new THREE.Group();

  const trunkSegments = 5;
  const height = 4.2;
  const curveAngle = (Math.random() - 0.5) * 0.4;

  let currentY = 0;
  let currentX = 0;
  for (let i = 0; i < trunkSegments; i++) {
    const segH = height / trunkSegments;
    const radiusBottom = 0.35 - (i * 0.035);
    const radiusTop = radiusBottom - 0.03;
    const segGeo = new THREE.CylinderGeometry(radiusTop, radiusBottom, segH, 8);
    const seg = new THREE.Mesh(segGeo, MATS.palmTrunk);

    seg.position.set(currentX, currentY + segH / 2, 0);
    seg.rotation.z = curveAngle * (i / trunkSegments);
    tree.add(seg);

    currentY += segH;
    currentX += Math.sin(curveAngle) * 0.3;
  }

  const leafCount = 7;
  const leafGroup = new THREE.Group();
  leafGroup.position.set(currentX, currentY, 0);

  for (let i = 0; i < leafCount; i++) {
    const angle = (i / leafCount) * Math.PI * 2;
    const leafGeo = new THREE.ConeGeometry(0.7, 2.2, 5);
    const leaf = new THREE.Mesh(leafGeo, MATS.palmLeaves);

    leaf.position.set(Math.cos(angle) * 1.0, -0.4, Math.sin(angle) * 1.0);
    leaf.rotation.x = Math.sin(angle) * 1.1;
    leaf.rotation.z = -Math.cos(angle) * 1.1;
    leaf.scale.set(0.8, 1, 0.25);
    leafGroup.add(leaf);
  }

  tree.add(leafGroup);
  return tree;
}

/**
 * Creates 3D stylized low-poly rock boulder
 */
export function createRock(scale: number = 1.0): THREE.Mesh {
  const geo = new THREE.DodecahedronGeometry(0.8 * scale, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + (Math.random() - 0.5) * 0.15 * scale,
      pos.getY(i) + (Math.random() - 0.5) * 0.15 * scale,
      pos.getZ(i) + (Math.random() - 0.5) * 0.15 * scale
    );
  }
  geo.computeVertexNormals();

  const rock = new THREE.Mesh(geo, MATS.rockGrey);
  rock.castShadow = true;
  rock.receiveShadow = true;
  return rock;
}

/**
 * Creates 3D explosive barrel
 */
export function createBarrel(x: number, y: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, y, 0);

  const barrelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.9, 10);
  const barrel = new THREE.Mesh(barrelGeo, MATS.barrelRed);
  group.add(barrel);

  const ringGeo = new THREE.TorusGeometry(0.41, 0.03, 6, 12);
  const ring1 = new THREE.Mesh(ringGeo, MATS.jetNozzle);
  ring1.rotation.x = Math.PI / 2;
  ring1.position.y = 0.25;
  group.add(ring1);

  const ring2 = ring1.clone();
  ring2.position.y = -0.25;
  group.add(ring2);

  group.userData = {
    type: 'barrel',
    health: 30,
    radius: 0.45
  };

  return group;
}

/**
 * Creates 3D floating pickup item (Health pack, Jetpack boost, or Weapon)
 */
export function createPickupItem(type: string, x: number, y: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, y, 0);

  if (type === 'healthpack') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.25), MATS.healthWhite);
    group.add(box);

    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.26), MATS.healthCross);
    group.add(crossH);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.26), MATS.healthCross);
    group.add(crossV);
  } else if (type === 'boosttank') {
    const canister = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.55, 8), MATS.boostBlue);
    group.add(canister);
  } else {
    const wepMesh = createWeaponMesh(type);
    wepMesh.scale.set(1.1, 1.1, 1.1);
    group.add(wepMesh);
  }

  const ringGeo = new THREE.RingGeometry(0.35, 0.45, 16);
  const ringMat = new THREE.MeshBasicMaterial({
    color: type === 'healthpack' ? 0xff4d8d : (type === 'boosttank' ? 0x00f5d4 : 0xffbe0b),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.6
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.35;
  group.add(ring);

  group.userData = {
    type,
    radius: 0.8,
    startY: y,
    hoverTime: Math.random() * Math.PI * 2
  };

  return group;
}
