// Tiny Militia Web - Shared map data helpers (isomorphic, no DOM/Three.js)

export interface MapDataJson {
  width?: number;
  height?: number;
  collision_polys: Array<{
    id: string;
    points: [number, number][];
  }>;
  spawns: Array<{ name: string; x: number; y: number }>;
  weapon_spawns: Array<{ name: string; x: number; y: number; weapon: string }>;
  decorations: Array<{ type: string; x: number; y: number }>;
}

export const MAP_SCALE = 0.045;
export const DEFAULT_MAP_PIXEL_WIDTH = 3328;
export const DEFAULT_MAP_PIXEL_HEIGHT = 1152;

export function toWorldX(px: number, mapPixelWidth: number = DEFAULT_MAP_PIXEL_WIDTH): number {
  return (px - mapPixelWidth / 2) * MAP_SCALE;
}

export function toWorldY(py: number, mapPixelHeight: number = DEFAULT_MAP_PIXEL_HEIGHT): number {
  return (mapPixelHeight / 2 - py) * MAP_SCALE;
}