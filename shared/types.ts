// Tiny Militia Web - Shared network + state types (isomorphic)

export interface PlayerState {
  id: string;
  nickname: string;
  x: number; y: number;
  vx: number; vy: number;
  aimAngle: number;
  health: number;
  boost: number;
  weaponSlot: number;
  ammo: number; reserve: number;
  reloading: boolean;
  reloadingUntil: number;
  alive: boolean;
  respawnAt: number | null;
  kills: number; deaths: number;
  onGround: boolean;
  isBoosting: boolean;
}

export interface ProjectileState {
  id: string;
  ownerId: string;
  kind: 'rocket' | 'grenade';
  x: number; y: number;
  vx: number; vy: number;
  fuse: number;
  exploded: boolean;
}

export interface InputState {
  seq: number;
  moveX: number;
  moveY: number;
  aimAngle: number;
  firing: boolean;
  weaponSlot?: number;
  reload?: boolean;
  grenade?: boolean;
  melee?: boolean;
}