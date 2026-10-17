// Tiny Militia Web - Weapons Definitions and Balancing
export const WEAPON_TYPES = {
  ak47: {
    id: 'ak47',
    name: 'AK-47',
    type: 'auto',
    damage: 24,
    fireRate: 0.11, // seconds between shots
    bulletSpeed: 46,
    spread: 0.045,
    pellets: 1,
    clipSize: 30,
    maxReserve: 120,
    reloadTime: 1.4,
    sound: 'ak47',
    color: '#e0a96d',
    trailColor: '#ffe8a3'
  },
  m16: {
    id: 'm16',
    name: 'M16',
    type: 'burst',
    burstCount: 3,
    burstInterval: 0.07,
    damage: 26,
    fireRate: 0.38,
    bulletSpeed: 52,
    spread: 0.025,
    pellets: 1,
    clipSize: 30,
    maxReserve: 120,
    reloadTime: 1.3,
    sound: 'm16',
    color: '#343a40',
    trailColor: '#74c0fc'
  },
  shotgun: {
    id: 'shotgun',
    name: 'Pump Shotgun',
    type: 'semi',
    damage: 18, // per pellet
    fireRate: 0.65,
    bulletSpeed: 40,
    spread: 0.2,
    pellets: 6,
    clipSize: 6,
    maxReserve: 30,
    reloadTime: 1.8,
    sound: 'shotgun',
    color: '#8b5a2b',
    trailColor: '#ffa94d'
  },
  magnum: {
    id: 'magnum',
    name: 'Magnum .44',
    type: 'semi',
    damage: 55,
    fireRate: 0.42,
    bulletSpeed: 52,
    spread: 0.02,
    pellets: 1,
    clipSize: 6,
    maxReserve: 36,
    reloadTime: 1.5,
    sound: 'magnum',
    color: '#ced4da',
    trailColor: '#ffd43b'
  },
  deagle: {
    id: 'deagle',
    name: 'Desert Eagle',
    type: 'semi',
    damage: 42,
    fireRate: 0.28,
    bulletSpeed: 48,
    spread: 0.03,
    pellets: 1,
    clipSize: 7,
    maxReserve: 35,
    reloadTime: 1.2,
    sound: 'deagle',
    color: '#495057',
    trailColor: '#fcc419'
  },
  sniper: {
    id: 'sniper',
    name: 'M93BA Sniper',
    type: 'semi',
    damage: 120,
    fireRate: 1.25,
    bulletSpeed: 75,
    spread: 0.005,
    pellets: 1,
    clipSize: 5,
    maxReserve: 20,
    reloadTime: 2.0,
    sound: 'bolt',
    color: '#212529',
    trailColor: '#ff6b6b',
    laserSight: true
  },
  rocket: {
    id: 'rocket',
    name: 'SMAW Launcher',
    type: 'semi',
    damage: 150,
    blastRadius: 4.5,
    fireRate: 1.5,
    bulletSpeed: 24,
    spread: 0.01,
    pellets: 1,
    clipSize: 1,
    maxReserve: 5,
    reloadTime: 2.2,
    sound: 'rocket',
    color: '#495057',
    trailColor: '#f77f00',
    isRocket: true
  }
};

export class WeaponInstance {
  constructor(typeKey) {
    this.def = WEAPON_TYPES[typeKey] || WEAPON_TYPES.ak47;
    this.ammoInClip = this.def.clipSize;
    this.reserveAmmo = this.def.maxReserve;
    this.lastShotTime = 0;
    this.isReloading = false;
    this.reloadProgress = 0;
  }

  canShoot(now) {
    if (this.isReloading) return false;
    if (this.ammoInClip <= 0) return false;
    return (now - this.lastShotTime) >= this.def.fireRate;
  }

  consumeAmmo(now) {
    this.ammoInClip--;
    this.lastShotTime = now;
  }

  startReload() {
    if (this.isReloading) return;
    if (this.ammoInClip >= this.def.clipSize) return;
    if (this.reserveAmmo <= 0) return;
    this.isReloading = true;
    this.reloadProgress = 0;
  }

  update(dt) {
    if (this.isReloading) {
      this.reloadProgress += dt;
      if (this.reloadProgress >= this.def.reloadTime) {
        const needed = this.def.clipSize - this.ammoInClip;
        const take = Math.min(needed, this.reserveAmmo);
        this.ammoInClip += take;
        this.reserveAmmo -= take;
        this.isReloading = false;
        this.reloadProgress = 0;
      }
    }
  }
}
