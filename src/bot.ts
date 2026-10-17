// Tiny Militia Web - AI Bot Controller for Wave Survival Mode (TypeScript)
import * as THREE from 'three';
import { PhysicsEngine, Point2D } from './physics.js';
import { ParticleSystem } from './particles.js';
import { OutpostMap } from './map.js';
import { SoldierModel, createSoldierModel, createWeaponMesh, createPickupItem } from './proceduralModels.js';
import { WeaponInstance } from './weapons.js';
import { sounds } from './audio.js';

export interface BulletSpawnOptions {
  owner: 'player' | 'bot';
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  isRocket?: boolean;
  color?: string;
}

export interface PlayerTarget {
  pos: Point2D;
  vel: Point2D;
  radius: number;
  takeDamage(amount: number, attacker: string): void;
}

export type BotAIState = 'HUNT' | 'FLANK' | 'RETREAT';

export class Bot {
  public scene: THREE.Scene;
  public physics: PhysicsEngine;
  public particles: ParticleSystem;
  public waveNumber: number;

  public pos: Point2D;
  public vel: Point2D;
  public radius: number = 0.65;
  public onGround: boolean = false;
  public facingRight: boolean = true;

  public health: number;
  public maxHealth: number;
  public isDead: boolean = false;

  public jetpackFuel: number = 100;
  public isBoosting: boolean = false;

  public thinkTimer: number;
  public aimAngle: number = 0;
  public state: BotAIState = 'HUNT';
  public strafeDir: number;
  public strafeTimer: number;
  public meleeCooldown: number = 0;

  public weapon: WeaponInstance;
  public model: SoldierModel;
  public weaponMesh: THREE.Group;

  public hpBarGroup?: THREE.Group;
  public hpBarMesh?: THREE.Mesh;
  public hpBarMat?: THREE.MeshBasicMaterial;

  constructor(
    scene: THREE.Scene,
    physics: PhysicsEngine,
    particles: ParticleSystem,
    x: number,
    y: number,
    waveNumber: number = 1
  ) {
    this.scene = scene;
    this.physics = physics;
    this.particles = particles;
    this.waveNumber = waveNumber;

    this.pos = { x, y };
    this.vel = { x: 0, y: 0 };

    const baseHealth = 70 + Math.min(80, waveNumber * 15);
    this.health = baseHealth;
    this.maxHealth = baseHealth;

    this.thinkTimer = Math.random() * 0.5;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = 1 + Math.random() * 2;

    const weaponPool = ['deagle', 'magnum'];
    if (waveNumber >= 2) weaponPool.push('ak47', 'shotgun');
    if (waveNumber >= 3) weaponPool.push('m16', 'ak47');
    if (waveNumber >= 4) weaponPool.push('sniper', 'rocket');

    const chosenWeapon = weaponPool[Math.floor(Math.random() * weaponPool.length)];
    this.weapon = new WeaponInstance(chosenWeapon);

    this.model = createSoldierModel({ isBot: true, helmetColor: 'red' });
    this.model.root.position.set(x, y, 0);
    this.scene.add(this.model.root);

    this.weaponMesh = createWeaponMesh(chosenWeapon);
    this.model.weaponMount.add(this.weaponMesh);

    this.buildHealthBar();
  }

  private buildHealthBar(): void {
    this.hpBarGroup = new THREE.Group();
    this.hpBarGroup.position.set(0, 1.6, 0);

    const bgGeo = new THREE.PlaneGeometry(1.2, 0.16);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 });
    const bg = new THREE.Mesh(bgGeo, bgMat);
    this.hpBarGroup.add(bg);

    const barGeo = new THREE.PlaneGeometry(1.15, 0.12);
    this.hpBarMat = new THREE.MeshBasicMaterial({ color: 0xff4d8d });
    this.hpBarMesh = new THREE.Mesh(barGeo, this.hpBarMat);
    this.hpBarMesh.position.z = 0.01;
    this.hpBarGroup.add(this.hpBarMesh);

    this.model.root.add(this.hpBarGroup);
  }

  public update(
    dt: number,
    player: PlayerTarget,
    spawnBullet: (opts: BulletSpawnOptions) => void,
    map: OutpostMap
  ): void {
    if (this.isDead) {
      this.vel.y -= 25 * dt;
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;
      this.physics.resolveCircle(this.pos, this.radius, this.vel);
      this.model.root.position.set(this.pos.x, this.pos.y, 0);
      this.model.root.rotation.z += this.vel.x * 0.08;
      return;
    }

    this.weapon.update(dt);
    if (this.meleeCooldown > 0) this.meleeCooldown -= dt;

    const dx = player.pos.x - this.pos.x;
    const dy = player.pos.y - this.pos.y;
    const dist = Math.hypot(dx, dy);

    this.facingRight = dx > 0;
    this.model.root.scale.x = this.facingRight ? 1 : -1;

    const angleToPlayer = Math.atan2(dy, this.facingRight ? dx : -dx);
    this.aimAngle = THREE.MathUtils.lerp(this.aimAngle, angleToPlayer, 0.15);
    this.model.armPivot.rotation.z = this.aimAngle;

    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = 0.2 + Math.random() * 0.15;
      this.updateAIState(dx, dy, dist);
    }

    this.handleMovement(dt, dx, dy, dist);
    this.handleCombat(dt, player, dist, spawnBullet);

    this.vel.y -= 28 * dt;
    this.vel.x *= 0.94;

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;

    this.onGround = this.physics.resolveCircle(this.pos, this.radius, this.vel);

    if (this.onGround && !this.isBoosting) {
      this.jetpackFuel = Math.min(100, this.jetpackFuel + 30 * dt);
    }

    this.model.root.position.set(this.pos.x, this.pos.y, 0);
    this.model.animateWalk(this.vel.x, this.isBoosting || !this.onGround);

    if (this.hpBarMesh) {
      const hpRatio = Math.max(0, this.health / this.maxHealth);
      this.hpBarMesh.scale.x = hpRatio;
    }
  }

  private updateAIState(_dx: number, _dy: number, dist: number): void {
    if (this.health < this.maxHealth * 0.35 && dist < 12) {
      this.state = 'RETREAT';
    } else {
      this.state = 'HUNT';
    }
  }

  private handleMovement(dt: number, dx: number, dy: number, dist: number): void {
    const moveSpeed = 16;
    this.isBoosting = false;

    let moveDir = 0;
    if (this.state === 'HUNT') {
      if (dist > 8) moveDir = dx > 0 ? 1 : -1;
      else if (dist < 4) moveDir = dx > 0 ? -0.5 : 0.5;
      else moveDir = this.strafeDir;
    } else {
      moveDir = dx > 0 ? -1 : 1;
    }

    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = 1.2 + Math.random() * 2.5;
      this.strafeDir *= -1;
    }

    this.vel.x += moveDir * moveSpeed * dt;

    const needsVerticalLift = dy > 1.5 || (!this.onGround && this.vel.y < -2);
    if (needsVerticalLift && this.jetpackFuel > 15) {
      this.isBoosting = true;
      this.vel.y += 42 * dt;
      this.jetpackFuel -= 35 * dt;

      this.particles.emitJetpackFlame(
        this.pos.x + (this.facingRight ? -0.2 : 0.2),
        this.pos.y + 0.35,
        -0.2
      );
    }
  }

  private handleCombat(
    _dt: number,
    player: PlayerTarget,
    dist: number,
    spawnBullet: (opts: BulletSpawnOptions) => void
  ): void {
    if (dist < 2.0 && this.meleeCooldown <= 0) {
      this.meleeCooldown = 0.8;
      sounds.play('melee', { volume: 0.8 });
      player.takeDamage(28, 'Militia Bot (Melee)');
      this.particles.emitBulletImpact(player.pos.x, player.pos.y + 0.6, 0);
      return;
    }

    if (dist < 28) {
      const now = performance.now() / 1000;
      if (this.weapon.canShoot(now)) {
        this.weapon.consumeAmmo(now);

        const pan = Math.max(-1, Math.min(1, (this.pos.x - player.pos.x) / 20));
        sounds.play(this.weapon.def.sound, { pan, volume: 0.7 });

        const worldAim = this.facingRight ? this.aimAngle : Math.PI - this.aimAngle;
        const muzzleX = this.pos.x + Math.cos(worldAim) * 0.9;
        const muzzleY = this.pos.y + 0.7 + Math.sin(worldAim) * 0.9;

        this.particles.emitMuzzleFlash(muzzleX, muzzleY, 0, worldAim);

        for (let p = 0; p < this.weapon.def.pellets; p++) {
          const spreadAngle = worldAim + (Math.random() - 0.5) * this.weapon.def.spread;
          spawnBullet({
            owner: 'bot',
            x: muzzleX,
            y: muzzleY,
            vx: Math.cos(spreadAngle) * this.weapon.def.bulletSpeed,
            vy: Math.sin(spreadAngle) * this.weapon.def.bulletSpeed,
            damage: this.weapon.def.damage,
            isRocket: this.weapon.def.isRocket,
            color: this.weapon.def.trailColor
          });
        }
      } else if (this.weapon.ammoInClip <= 0 && !this.weapon.isReloading) {
        this.weapon.startReload();
      }
    }
  }

  public takeDamage(amount: number, map: OutpostMap, onKilled?: (bot: Bot) => void): void {
    if (this.isDead) return;
    this.health -= amount;
    this.particles.emitBloodSplatter(this.pos.x, this.pos.y + 0.7, 0);

    if (this.health <= 0) {
      this.die(map, onKilled);
    }
  }

  private die(map: OutpostMap, onKilled?: (bot: Bot) => void): void {
    this.isDead = true;
    sounds.playRandomDeath();

    if (this.hpBarGroup) {
      this.model.root.remove(this.hpBarGroup);
    }

    this.vel.x = (this.facingRight ? -1 : 1) * (4 + Math.random() * 6);
    this.vel.y = 8 + Math.random() * 4;

    if (Math.random() < 0.65) {
      const dropType = Math.random() < 0.3 ? 'healthpack' : this.weapon.def.id;
      const pickup = createPickupItem(dropType, this.pos.x, this.pos.y + 0.5);
      this.scene.add(pickup);
      map.pickups.push(pickup);
    }

    if (onKilled) onKilled(this);

    setTimeout(() => {
      this.scene.remove(this.model.root);
    }, 4000);
  }
}
