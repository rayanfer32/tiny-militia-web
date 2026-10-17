// Tiny Militia Web - Core Game Engine & Wave Survival Manager (TypeScript)
import * as THREE from 'three';
import { PhysicsEngine, Point2D } from './physics.js';
import { OutpostMap } from './map.js';
import { ParticleSystem } from './particles.js';
import { SoldierModel, createSoldierModel, createWeaponMesh } from './proceduralModels.js';
import { WeaponInstance, WEAPON_TYPES } from './weapons.js';
import { Bot, BulletSpawnOptions } from './bot.js';
import { sounds } from './audio.js';

export interface PlayerEntity {
  pos: Point2D;
  vel: Point2D;
  radius: number;
  onGround: boolean;
  facingRight: boolean;
  aimAngle: number;
  health: number;
  maxHealth: number;
  jetpackFuel: number;
  maxFuel: number;
  isBoosting: boolean;
  grenades: number;
  weapon: WeaponInstance;
  secondaryWeapon: WeaponInstance;
  model: SoldierModel;
  weaponMesh: THREE.Group;
  takeDamage(amount: number, attacker: string): void;
}

export interface BulletEntity {
  mesh: THREE.Mesh;
  owner: 'player' | 'bot';
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  isRocket: boolean;
  life: number;
}

export interface GrenadeEntity {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fuse: number;
  radius: number;
}

export interface JoystickState {
  active: boolean;
  x: number;
  y: number;
}

export class Game {
  public canvas: HTMLCanvasElement;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;

  public physics: PhysicsEngine;
  public particles: ParticleSystem;
  public map: OutpostMap;

  public player: PlayerEntity | null = null;
  public bots: Bot[] = [];
  public bullets: BulletEntity[] = [];
  public grenades: GrenadeEntity[] = [];

  public wave: number = 1;
  public score: number = 0;
  public kills: number = 0;
  public matchTime: number = 300;
  public isGameOver: boolean = false;
  public isPaused: boolean = false;
  public waveInProgress: boolean = false;
  public testMode: boolean = false;

  public screenShake: number = 0;
  public camTarget: THREE.Vector3 = new THREE.Vector3(0, 0, 32);

  public keys: Record<string, boolean> = {};
  public mouse = { x: 0, y: 0, worldX: 0, worldY: 0, down: false };
  public joysticks: { move: JoystickState; aim: JoystickState } = {
    move: { active: false, x: 0, y: 0 },
    aim: { active: false, x: 0, y: 0 }
  };

  private lastTime: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x70b4e0);
    this.scene.fog = new THREE.FogExp2(0x70b4e0, 0.008);

    this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(0, 0, 32);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.physics = new PhysicsEngine();
    this.particles = new ParticleSystem(this.scene);
    this.map = new OutpostMap(this.scene, this.physics);

    this.initLights();
    this.setupEventListeners();
    this.setupHUD();
  }

  private initLights(): void {
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 0.95);
    hemiLight.position.set(0, 50, 0);
    this.scene.add(hemiLight);

    const sun = new THREE.DirectionalLight(0xfff3b0, 1.4);
    sun.position.set(20, 35, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
  }

  public async start(): Promise<void> {
    sounds.init();
    await this.map.load();

    this.spawnPlayer();
    this.startWave(1);

    sounds.play('readyup', { volume: 0.9, isVoice: true });
    this.showSargeCallout("Come on boy! Show 'em what you got!", 'cmonboy');

    this.lastTime = performance.now();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  private spawnPlayer(): void {
    let spawnX = 0, spawnY = 8;
    if (this.map.spawns.length > 0) {
      const centerSp = this.map.spawns.reduce((closest, s) =>
        Math.hypot(s.x, s.y) < Math.hypot(closest.x, closest.y) ? s : closest
      );
      spawnX = centerSp.x;
      spawnY = centerSp.y;
    }

    this.player = {
      pos: { x: spawnX, y: spawnY },
      vel: { x: 0, y: 0 },
      radius: 0.65,
      onGround: false,
      facingRight: true,
      aimAngle: 0,

      health: 100,
      maxHealth: 100,
      jetpackFuel: 100,
      maxFuel: 100,
      isBoosting: false,
      grenades: 3,

      weapon: new WeaponInstance('ak47'),
      secondaryWeapon: new WeaponInstance('magnum'),

      model: createSoldierModel({ isBot: false, helmetColor: 'beret' }),
      weaponMesh: createWeaponMesh('ak47'),

      takeDamage: (amount: number, _attacker: string) => {
        if (this.isGameOver || !this.player) return;
        if (this.testMode) return; // Immune to all damage in Test Mode
        this.player.health = Math.max(0, this.player.health - amount);
        this.particles.emitBloodSplatter(this.player.pos.x, this.player.pos.y + 0.6, 0);
        this.addScreenShake(0.3);
        this.updateHUD();

        if (this.player.health <= 0) {
          this.triggerGameOver();
        }
      }
    };

    this.player.model.root.position.set(spawnX, spawnY, 0);
    this.player.model.weaponMount.add(this.player.weaponMesh);
    this.scene.add(this.player.model.root);
  }

  public startWave(waveNum: number): void {
    this.wave = waveNum;
    this.waveInProgress = true;
    this.updateHUD();

    this.showBanner(`WAVE ${this.wave}`, `INCOMING ${this.wave * 2 + 1} ENEMY MILITIA BOTS!`);

    if (this.wave > 1) {
      this.showSargeCallout("Wave cleared! More hostiles coming in hot!", 'bringit');
    }

    const botCount = 2 + waveNum * 2;
    for (let i = 0; i < botCount; i++) {
      setTimeout(() => {
        if (this.isGameOver) return;
        const spIdx = (i + 1) % Math.max(1, this.map.spawns.length);
        const sp = this.map.spawns[spIdx] || { x: (Math.random() - 0.5) * 40, y: 8 };

        const bot = new Bot(
          this.scene,
          this.physics,
          this.particles,
          sp.x + (Math.random() - 0.5) * 2,
          sp.y,
          this.wave
        );
        this.bots.push(bot);
      }, i * 650);
    }
  }

  public showBanner(title: string, desc: string): void {
    const banner = document.getElementById('event-banner');
    const tElem = document.getElementById('banner-title');
    const dElem = document.getElementById('banner-desc');
    if (!banner || !tElem || !dElem) return;

    tElem.textContent = title;
    dElem.textContent = desc;
    banner.classList.remove('hidden');

    setTimeout(() => {
      banner.classList.add('hidden');
    }, 2800);
  }

  public showSargeCallout(text: string, soundKey: string = 'cmonboy'): void {
    const sarge = document.getElementById('sarge-box');
    const txt = document.getElementById('sarge-text');
    if (sarge && txt) {
      txt.textContent = text;
      sarge.classList.remove('hidden');
      if (soundKey) sounds.play(soundKey, { isVoice: true, volume: 0.95 });

      setTimeout(() => {
        sarge.classList.add('hidden');
      }, 3500);
    }
  }

  public addKillfeed(killer: string, victim: string, weaponName: string): void {
    const feed = document.getElementById('killfeed');
    if (!feed) return;

    const item = document.createElement('div');
    item.className = 'killfeed-item';
    item.textContent = `${killer} ➔ [${weaponName}] ➔ ${victim}`;
    feed.appendChild(item);

    setTimeout(() => {
      if (item.parentNode) item.parentNode.removeChild(item);
    }, 4000);
  }

  public addScreenShake(intensity: number = 0.4): void {
    this.screenShake = Math.min(1.2, this.screenShake + intensity);
  }

  public spawnBullet(opts: BulletSpawnOptions): void {
    const isRocket = !!opts.isRocket;
    let mesh: THREE.Mesh;

    if (isRocket) {
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.5, 6),
        new THREE.MeshBasicMaterial({ color: 0xf77f00 })
      );
      mesh.rotation.z = Math.atan2(opts.vy, opts.vx) - Math.PI / 2;
    } else {
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.45, 4),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(opts.color || 0xffd166) })
      );
      mesh.rotation.z = Math.atan2(opts.vy, opts.vx) - Math.PI / 2;
    }

    mesh.position.set(opts.x, opts.y, 0);
    this.scene.add(mesh);

    this.bullets.push({
      mesh,
      owner: opts.owner,
      x: opts.x,
      y: opts.y,
      vx: opts.vx,
      vy: opts.vy,
      damage: opts.damage,
      isRocket,
      life: isRocket ? 3.5 : 1.2
    });
  }

  public throwGrenade(startX: number, startY: number, angle: number, power: number = 18): void {
    if (!this.player || this.player.grenades <= 0) return;
    this.player.grenades--;
    this.updateHUD();

    sounds.play('throw', { volume: 0.85 });

    const nadeGeo = new THREE.DodecahedronGeometry(0.18, 1);
    const nadeMat = new THREE.MeshToonMaterial({ color: 0x386641 });
    const mesh = new THREE.Mesh(nadeGeo, nadeMat);
    mesh.position.set(startX, startY, 0);
    this.scene.add(mesh);

    this.grenades.push({
      mesh,
      x: startX,
      y: startY,
      vx: Math.cos(angle) * power,
      vy: Math.sin(angle) * power,
      fuse: 2.5,
      radius: 0.2
    });
  }

  public triggerExplosion(x: number, y: number, radius: number = 4.2, maxDamage: number = 130): void {
    sounds.play('explode', { volume: 1.0 });
    this.particles.emitExplosion(x, y, 0, radius / 3.5);
    this.addScreenShake(0.85);

    if (this.player) {
      const pDist = Math.hypot(this.player.pos.x - x, this.player.pos.y - y);
      if (pDist < radius) {
        const dmg = Math.round(maxDamage * (1 - pDist / radius));
        this.player.takeDamage(dmg, 'Explosion');
        const angle = Math.atan2(this.player.pos.y - y, this.player.pos.x - x);
        this.player.vel.x += Math.cos(angle) * 18;
        this.player.vel.y += Math.sin(angle) * 18;
      }
    }

    for (const bot of this.bots) {
      if (bot.isDead) continue;
      const bDist = Math.hypot(bot.pos.x - x, bot.pos.y - y);
      if (bDist < radius) {
        const dmg = Math.round(maxDamage * (1 - bDist / radius));
        bot.takeDamage(dmg, this.map, (deadBot) => this.onBotKilled(deadBot, 'Grenade/Rocket'));
        const angle = Math.atan2(bot.pos.y - y, bot.pos.x - x);
        bot.vel.x += Math.cos(angle) * 16;
        bot.vel.y += Math.sin(angle) * 16;
      }
    }

    for (let i = this.map.barrels.length - 1; i >= 0; i--) {
      const b = this.map.barrels[i];
      const dist = Math.hypot(b.position.x - x, b.position.y - y);
      if (dist < radius) {
        b.userData.health -= maxDamage;
        if (b.userData.health <= 0) {
          const bx = b.position.x;
          const by = b.position.y;
          this.map.removeBarrel(b);
          this.triggerExplosion(bx, by, 4.8, 140);
        }
      }
    }
  }

  public onBotKilled(_bot: Bot, weaponName: string = 'AK-47'): void {
    this.kills++;
    this.score += 150 + this.wave * 50;
    this.addKillfeed('You', 'Militia Bot', weaponName);
    this.updateHUD();

    const activeBots = this.bots.filter(b => !b.isDead);
    if (activeBots.length <= 1 && this.waveInProgress) {
      this.waveInProgress = false;
      setTimeout(() => {
        if (!this.isGameOver) {
          this.startWave(this.wave + 1);
        }
      }, 3000);
    }
  }

  public executeMeleeStrike(): void {
    if (!this.player) return;
    sounds.play('melee', { volume: 0.9 });
    const punchReach = 2.4;
    const punchX = this.player.pos.x + (this.player.facingRight ? 1.2 : -1.2);
    const punchY = this.player.pos.y + 0.5;

    this.particles.emitBulletImpact(punchX, punchY, 0);

    for (const bot of this.bots) {
      if (bot.isDead) continue;
      const d = Math.hypot(bot.pos.x - punchX, bot.pos.y - punchY);
      if (d < punchReach) {
        bot.takeDamage(45, this.map, (b) => this.onBotKilled(b, 'Combat Knife'));
        bot.vel.x += (this.player.facingRight ? 1 : -1) * 14;
        bot.vel.y += 6;
      }
    }
  }

  public swapOrPickupWeapon(): void {
    if (!this.player) return;

    for (let i = this.map.pickups.length - 1; i >= 0; i--) {
      const p = this.map.pickups[i];
      const dist = Math.hypot(p.position.x - this.player.pos.x, p.position.y - this.player.pos.y);
      if (dist < 1.8) {
        const type: string = p.userData.type;
        sounds.play('pickup', { volume: 0.85 });

        if (type === 'healthpack') {
          this.player.health = Math.min(this.player.maxHealth, this.player.health + 40);
          this.map.removePickup(p);
          this.updateHUD();
          return;
        } else if (type === 'boosttank') {
          this.player.jetpackFuel = this.player.maxFuel;
          this.map.removePickup(p);
          this.updateHUD();
          return;
        } else if (WEAPON_TYPES[type]) {
          this.player.weapon = new WeaponInstance(type);
          this.player.model.weaponMount.remove(this.player.weaponMesh);
          this.player.weaponMesh = createWeaponMesh(type);
          this.player.model.weaponMount.add(this.player.weaponMesh);
          this.map.removePickup(p);
          this.updateHUD();
          return;
        }
      }
    }

    sounds.play('switch', { volume: 0.8 });
    const temp = this.player.weapon;
    this.player.weapon = this.player.secondaryWeapon;
    this.player.secondaryWeapon = temp;

    this.player.model.weaponMount.remove(this.player.weaponMesh);
    this.player.weaponMesh = createWeaponMesh(this.player.weapon.def.id);
    this.player.model.weaponMount.add(this.player.weaponMesh);
    this.updateHUD();
  }

  private updatePlayer(dt: number): void {
    if (!this.player) return;
    const p = this.player;
    p.weapon.update(dt);

    let moveX = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveX -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveX += 1;
    if (this.joysticks.move.active) moveX += this.joysticks.move.x;

    let boostThrust = (this.keys['KeyW'] || this.keys['Space'] || this.keys['ArrowUp']);
    if (this.joysticks.move.active && this.joysticks.move.y > 0.3) {
      boostThrust = true;
    }

    if (this.testMode) {
      p.health = p.maxHealth;
      p.jetpackFuel = p.maxFuel;
    }

    if (boostThrust && (p.jetpackFuel > 0 || this.testMode)) {
      p.isBoosting = true;
      p.vel.y += 44 * dt;
      if (!this.testMode) {
        p.jetpackFuel = Math.max(0, p.jetpackFuel - 38 * dt);
      } else {
        p.jetpackFuel = p.maxFuel;
      }

      sounds.startLoop('jet', 'player_jet', 0.4);

      const nozzleOffset = p.facingRight ? -0.2 : 0.2;
      this.particles.emitJetpackFlame(
        p.pos.x + nozzleOffset,
        p.pos.y + 0.35,
        -0.2
      );
    } else {
      p.isBoosting = false;
      sounds.stopLoop('jet', 'player_jet');
      if (p.onGround) {
        p.jetpackFuel = Math.min(p.maxFuel, p.jetpackFuel + 32 * dt);
      }
    }

    let aimAngle = 0;
    if (this.joysticks.aim.active) {
      aimAngle = Math.atan2(this.joysticks.aim.y, this.joysticks.aim.x);
      p.facingRight = this.joysticks.aim.x >= 0;
    } else {
      this.updateMouseWorldPos();
      const dx = this.mouse.worldX - p.pos.x;
      const dy = this.mouse.worldY - (p.pos.y + 0.7);
      aimAngle = Math.atan2(dy, dx);
      p.facingRight = dx >= 0;
    }

    p.aimAngle = aimAngle;
    p.model.root.scale.x = p.facingRight ? 1 : -1;
    // Rotate arm in local space: in flipped root space, X is inverted
    p.model.armPivot.rotation.z = Math.atan2(
      Math.sin(aimAngle),
      p.facingRight ? Math.cos(aimAngle) : -Math.cos(aimAngle)
    );

    const wantsToShoot = this.mouse.down || (this.joysticks.aim.active && Math.hypot(this.joysticks.aim.x, this.joysticks.aim.y) > 0.45);
    const now = performance.now() / 1000;

    if (wantsToShoot && p.weapon.canShoot(now)) {
      p.weapon.consumeAmmo(now);
      this.updateHUD();

      sounds.play(p.weapon.def.sound, { volume: 0.95 });
      this.addScreenShake(p.weapon.def.isRocket ? 0.45 : 0.12);

      const worldAim = p.aimAngle;
      const muzzleX = p.pos.x + Math.cos(worldAim) * 0.95;
      const muzzleY = p.pos.y + 0.7 + Math.sin(worldAim) * 0.95;

      this.particles.emitMuzzleFlash(muzzleX, muzzleY, 0, worldAim);

      for (let i = 0; i < p.weapon.def.pellets; i++) {
        const spreadAngle = worldAim + (Math.random() - 0.5) * p.weapon.def.spread;
        this.spawnBullet({
          owner: 'player',
          x: muzzleX,
          y: muzzleY,
          vx: Math.cos(spreadAngle) * p.weapon.def.bulletSpeed,
          vy: Math.sin(spreadAngle) * p.weapon.def.bulletSpeed,
          damage: p.weapon.def.damage,
          isRocket: p.weapon.def.isRocket,
          color: p.weapon.def.trailColor
        });
      }

      p.vel.x -= Math.cos(worldAim) * 2.5;
      p.vel.y -= Math.sin(worldAim) * 2.5;
    } else if (wantsToShoot && p.weapon.ammoInClip <= 0 && !p.weapon.isReloading) {
      if (p.weapon.reserveAmmo > 0) {
        sounds.play('reload', { volume: 0.8 });
        p.weapon.startReload();
      } else {
        sounds.play('dryfire', { volume: 0.5 });
      }
    }
    // Movement integration & slope traversal
    const walkSpeed = 9.0;
    if (p.onGround && !p.isBoosting) {
      if (Math.abs(moveX) > 0.05) {
        // Walking along ground / slope: compute slope tangent pointing in move direction
        const gn = this.physics.lastGroundNormal;
        const tLen = Math.hypot(gn.y, -gn.x) || 1;
        const tx = gn.y / tLen;
        const ty = -gn.x / tLen;

        // Drive velocity smoothly along the slope surface
        p.vel.x = moveX * walkSpeed * tx;
        p.vel.y = moveX * walkSpeed * ty;

        // If moving flat or downhill, add a small downward bias to maintain ground contact
        if (moveX * ty <= 0.05) {
          p.vel.y -= 2.5;
        }
      } else {
        // Standing still on slope: strong soldier footing to prevent downhill sliding
        p.vel.x = 0;
        p.vel.y = 0;
      }
    } else {
      // In air (flying or falling)
      p.vel.x += moveX * 24 * dt;
      p.vel.x = Math.max(-10, Math.min(10, p.vel.x));
      p.vel.y -= 28 * dt;
      p.vel.x *= 0.96;
    }

    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;

    p.onGround = this.physics.resolveCircle(p.pos, p.radius, p.vel);

    p.model.root.position.set(p.pos.x, p.pos.y, 0);
    p.model.animateWalk(p.vel.x, p.isBoosting || !p.onGround);

    this.updateHUD();
  }

  private updateBullets(dt: number): void {
    if (!this.player) return;

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;

      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        this.bullets.splice(i, 1);
        continue;
      }

      const prevX = b.x;
      const prevY = b.y;

      if (b.isRocket) {
        b.vx *= 1.03;
        b.vy *= 1.03;
        this.particles.emitJetpackFlame(b.x, b.y, 0, -b.vx / 30, -b.vy / 30);
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.mesh.position.set(b.x, b.y, 0);

      const hit = this.physics.raycast(prevX, prevY, b.x, b.y);
      if (hit) {
        if (b.isRocket) {
          this.triggerExplosion(hit.x, hit.y, 4.5, 140);
        } else {
          sounds.play('ricochet', { volume: 0.4 });
          this.particles.emitBulletImpact(hit.x, hit.y, 0, hit.nx, hit.ny);
        }
        this.scene.remove(b.mesh);
        this.bullets.splice(i, 1);
        continue;
      }

      if (b.owner === 'bot') {
        const d = Math.hypot(this.player.pos.x - b.x, (this.player.pos.y + 0.6) - b.y);
        if (d < this.player.radius) {
          if (b.isRocket) {
            this.triggerExplosion(b.x, b.y, 4.2, 130);
          } else {
            this.player.takeDamage(b.damage, 'Militia Bot');
          }
          this.scene.remove(b.mesh);
          this.bullets.splice(i, 1);
          continue;
        }
      }

      if (b.owner === 'player') {
        let hitBot = false;
        for (const bot of this.bots) {
          if (bot.isDead) continue;
          const d = Math.hypot(bot.pos.x - b.x, (bot.pos.y + 0.6) - b.y);
          if (d < bot.radius) {
            if (b.isRocket) {
              this.triggerExplosion(b.x, b.y, 4.5, 140);
            } else {
              bot.takeDamage(b.damage, this.map, (deadBot) => this.onBotKilled(deadBot, this.player?.weapon.def.name || 'Rifle'));
            }
            this.scene.remove(b.mesh);
            this.bullets.splice(i, 1);
            hitBot = true;
            break;
          }
        }
        if (hitBot) continue;
      }

      for (const barrel of this.map.barrels) {
        const d = Math.hypot(barrel.position.x - b.x, barrel.position.y - b.y);
        if (d < barrel.userData.radius) {
          barrel.userData.health -= b.damage;
          if (barrel.userData.health <= 0) {
            const bx = barrel.position.x;
            const by = barrel.position.y;
            this.map.removeBarrel(barrel);
            this.triggerExplosion(bx, by, 4.8, 140);
          }
          this.scene.remove(b.mesh);
          this.bullets.splice(i, 1);
          break;
        }
      }
    }
  }

  private updateGrenades(dt: number): void {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;

      if (g.fuse <= 0) {
        this.triggerExplosion(g.x, g.y, 4.5, 130);
        this.scene.remove(g.mesh);
        this.grenades.splice(i, 1);
        continue;
      }

      g.vy -= 26 * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;

      const pos = { x: g.x, y: g.y };
      const vel = { x: g.vx, y: g.vy };
      this.physics.resolveCircle(pos, g.radius, vel);

      g.x = pos.x;
      g.y = pos.y;
      g.vx = vel.x * 0.7;
      g.vy = vel.y * 0.7;

      g.mesh.position.set(g.x, g.y, 0);
      g.mesh.rotation.z += g.vx * 0.1;
    }
  }

  private updateCamera(dt: number): void {
    if (!this.player) return;

    const leadX = Math.cos(this.player.aimAngle) * 2.0;
    const leadY = Math.sin(this.player.aimAngle) * 1.2;

    this.camTarget.x = THREE.MathUtils.lerp(this.camTarget.x, this.player.pos.x + leadX, 0.14);
    this.camTarget.y = THREE.MathUtils.lerp(this.camTarget.y, this.player.pos.y + leadY + 1.2, 0.14);

    let shakeOffsetX = 0, shakeOffsetY = 0;
    if (this.screenShake > 0) {
      shakeOffsetX = (Math.random() - 0.5) * this.screenShake * 1.5;
      shakeOffsetY = (Math.random() - 0.5) * this.screenShake * 1.5;
      this.screenShake = Math.max(0, this.screenShake - dt * 2.2);
    }

    this.camera.position.set(
      this.camTarget.x + shakeOffsetX,
      this.camTarget.y + shakeOffsetY,
      28
    );
    this.camera.lookAt(this.camTarget.x, this.camTarget.y, 0);
  }

  public updateHUD(): void {
    if (!this.player) return;

    const hpBar = document.getElementById('health-bar');
    if (hpBar) {
      hpBar.style.width = `${Math.max(0, this.player.health)}%`;
      if (this.testMode) hpBar.classList.add('infinite-mode');
      else hpBar.classList.remove('infinite-mode');
    }

    const boostBar = document.getElementById('boost-bar');
    if (boostBar) {
      boostBar.style.width = `${Math.max(0, this.player.jetpackFuel)}%`;
      if (this.testMode) boostBar.classList.add('infinite-mode');
      else boostBar.classList.remove('infinite-mode');
    }

    const currAmmo = document.getElementById('current-ammo');
    const resAmmo = document.getElementById('reserve-ammo');
    const wepName = document.getElementById('weapon-name');
    if (currAmmo && resAmmo && wepName) {
      wepName.textContent = this.player.weapon.def.name;
      currAmmo.textContent = String(this.player.weapon.ammoInClip).padStart(3, '0');
      resAmmo.textContent = String(this.player.weapon.reserveAmmo).padStart(3, '0');
    }

    const gCount = document.getElementById('grenade-count');
    if (gCount) {
      gCount.textContent = String(this.player.grenades);
    }

    const sElem = document.getElementById('score-val');
    const kElem = document.getElementById('kills-val');
    if (sElem && kElem) {
      sElem.textContent = String(this.score);
      kElem.textContent = String(this.kills);
    }

    const wTitle = document.getElementById('wave-title');
    if (wTitle) {
      wTitle.textContent = `WAVE ${this.wave}`;
    }
  }

  private triggerGameOver(): void {
    this.isGameOver = true;
    sounds.playRandomDeath();

    const goModal = document.getElementById('gameover-overlay');
    const goWaves = document.getElementById('go-waves');
    const goKills = document.getElementById('go-kills');
    const goScore = document.getElementById('go-score');

    if (goWaves) goWaves.textContent = String(this.wave);
    if (goKills) goKills.textContent = String(this.kills);
    if (goScore) goScore.textContent = String(this.score);

    if (goModal) goModal.classList.remove('hidden');
  }

  public animate(currentTime: number): void {
    requestAnimationFrame(this.animate);

    const dt = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    if (this.isPaused) return;

    if (!this.isGameOver) {
      this.matchTime -= dt;
      const mins = Math.floor(Math.max(0, this.matchTime) / 60);
      const secs = Math.floor(Math.max(0, this.matchTime) % 60);
      const timerElem = document.getElementById('match-timer');
      if (timerElem) {
        timerElem.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
    }

    if (this.player && !this.isGameOver) {
      this.updatePlayer(dt);
    }

    if (this.player) {
      for (const bot of this.bots) {
        bot.update(dt, this.player, (opts) => this.spawnBullet(opts), this.map);
      }
    }

    this.updateBullets(dt);
    this.updateGrenades(dt);

    this.particles.update(dt);
    this.map.update(dt);

    this.updateCamera(dt);

    this.renderer.render(this.scene, this.camera);
  }

  private updateMouseWorldPos(): void {
    const vec = new THREE.Vector3(
      (this.mouse.x / window.innerWidth) * 2 - 1,
      -(this.mouse.y / window.innerHeight) * 2 + 1,
      0.5
    );
    vec.unproject(this.camera);
    vec.sub(this.camera.position).normalize();
    const distance = -this.camera.position.z / vec.z;
    const worldPos = this.camera.position.clone().add(vec.multiplyScalar(distance));
    this.mouse.worldX = worldPos.x;
    this.mouse.worldY = worldPos.y;
  }

  private setupEventListeners(): void {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      this.keys[e.code] = true;

      if (e.code === 'KeyG' || e.code === 'KeyQ') {
        if (this.player) {
          this.throwGrenade(this.player.pos.x, this.player.pos.y + 0.8, this.player.aimAngle);
        }
      }
      if (e.code === 'KeyF') {
        this.executeMeleeStrike();
      }
      if (e.code === 'KeyR') {
        if (this.player && !this.player.weapon.isReloading) {
          sounds.play('reload', { volume: 0.8 });
          this.player.weapon.startReload();
        }
      }
      if (e.code === 'KeyE') {
        this.swapOrPickupWeapon();
      }
      if (e.code === 'KeyT') {
        this.toggleTestMode();
      }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      this.keys[e.code] = false;
    });

    window.addEventListener('mousemove', (e: MouseEvent) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.updateMouseWorldPos();
    });

    window.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 0) {
        this.mouse.down = true;
      } else if (e.button === 2) {
        e.preventDefault();
        if (this.player) {
          this.throwGrenade(this.player.pos.x, this.player.pos.y + 0.8, this.player.aimAngle);
        }
      }
    });

    window.addEventListener('mouseup', (e: MouseEvent) => {
      if (e.button === 0) {
        this.mouse.down = false;
      }
    });

    window.addEventListener('contextmenu', (e: MouseEvent) => e.preventDefault());

    this.setupTouchJoysticks();
  }

  private setupTouchJoysticks(): void {
    const leftZone = document.getElementById('joystick-left');
    const rightZone = document.getElementById('joystick-right');
    const nubLeft = document.getElementById('nub-left');
    const nubRight = document.getElementById('nub-right');

    const handleStick = (zone: HTMLElement | null, nub: HTMLElement | null, stickData: JoystickState) => {
      if (!zone || !nub) return;
      let touchId: number | null = null;

      const onTouchMove = (e: TouchEvent) => {
        for (let i = 0; i < e.touches.length; i++) {
          const t = e.touches[i];
          if (t.identifier === touchId) {
            const rect = zone.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            const dx = t.clientX - centerX;
            const dy = t.clientY - centerY;
            const maxRadius = rect.width / 2;
            const dist = Math.hypot(dx, dy);

            const normX = dist > 0 ? (dx / dist) * Math.min(dist, maxRadius) : 0;
            const normY = dist > 0 ? (dy / dist) * Math.min(dist, maxRadius) : 0;

            nub.style.transform = `translate(${normX}px, ${normY}px)`;
            stickData.active = true;
            stickData.x = normX / maxRadius;
            stickData.y = -normY / maxRadius;
            break;
          }
        }
      };

      const onTouchEnd = (e: TouchEvent) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === touchId) {
            touchId = null;
            stickData.active = false;
            stickData.x = 0;
            stickData.y = 0;
            nub.style.transform = `translate(0px, 0px)`;
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onTouchEnd);
            break;
          }
        }
      };

      zone.addEventListener('touchstart', (e: TouchEvent) => {
        e.preventDefault();
        if (touchId === null && e.changedTouches.length > 0) {
          touchId = e.changedTouches[0].identifier;
          window.addEventListener('touchmove', onTouchMove);
          window.addEventListener('touchend', onTouchEnd);
          onTouchMove(e);
        }
      }, { passive: false });
    };

    handleStick(leftZone, nubLeft, this.joysticks.move);
    handleStick(rightZone, nubRight, this.joysticks.aim);
  }

  private setupHUD(): void {
    const btnMelee = document.getElementById('btn-touch-melee');
    if (btnMelee) btnMelee.addEventListener('click', () => this.executeMeleeStrike());

    const btnReload = document.getElementById('btn-touch-reload');
    if (btnReload) btnReload.addEventListener('click', () => {
      if (this.player && !this.player.weapon.isReloading) {
        sounds.play('reload', { volume: 0.8 });
        this.player.weapon.startReload();
      }
    });

    const btnSwap = document.getElementById('btn-touch-swap');
    if (btnSwap) btnSwap.addEventListener('click', () => this.swapOrPickupWeapon());

    const btnNade = document.getElementById('btn-throw-grenade');
    if (btnNade) btnNade.addEventListener('click', () => {
      if (this.player) {
        this.throwGrenade(this.player.pos.x, this.player.pos.y + 0.8, this.player.aimAngle);
      }
    });

    const btnPause = document.getElementById('btn-pause');
    const pauseModal = document.getElementById('pause-overlay');
    const btnResume = document.getElementById('btn-resume');
    const btnRestart = document.getElementById('btn-restart');

    if (btnPause && pauseModal) {
      btnPause.addEventListener('click', () => {
        this.isPaused = true;
        pauseModal.classList.remove('hidden');
      });
    }
    if (btnResume && pauseModal) {
      btnResume.addEventListener('click', () => {
        this.isPaused = false;
        pauseModal.classList.add('hidden');
      });
    }
    if (btnRestart) {
      btnRestart.addEventListener('click', () => window.location.reload());
    }

    const btnTestMode = document.getElementById('btn-test-mode');
    if (btnTestMode) {
      btnTestMode.addEventListener('click', () => this.toggleTestMode());
    }

    const btnPlayAgain = document.getElementById('btn-play-again');
    if (btnPlayAgain) {
      btnPlayAgain.addEventListener('click', () => window.location.reload());
    }
  }

  public toggleTestMode(): void {
    this.testMode = !this.testMode;
    const btn = document.getElementById('btn-test-mode');
    const state = document.getElementById('test-mode-state');
    if (btn && state) {
      if (this.testMode) {
        btn.classList.add('active');
        state.textContent = 'ON';
        this.showBanner('TEST MODE ACTIVATED', 'UNLIMITED HEALTH & JETPACK GAS ENABLED!');
        sounds.play('boost', { volume: 0.9 });
      } else {
        btn.classList.remove('active');
        state.textContent = 'OFF';
        this.showBanner('TEST MODE DEACTIVATED', 'Standard survival rules restored.');
      }
    }
    if (this.player && this.testMode) {
      this.player.health = this.player.maxHealth;
      this.player.jetpackFuel = this.player.maxFuel;
    }
    this.updateHUD();
  }
}
