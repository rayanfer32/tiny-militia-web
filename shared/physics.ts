// Tiny Militia Web - 2.5D Swept Collision & Raycasting Physics Engine (TypeScript)

export interface Point2D {
  x: number;
  y: number;
}

export interface CollisionSegment {
  p1: Point2D;
  p2: Point2D;
  dx: number;
  dy: number;
  len: number;
  nx: number;
  ny: number;
}

export interface RaycastHit {
  x: number;
  y: number;
  dist: number;
  nx: number;
  ny: number;
}

import { MapDataJson, MAP_SCALE } from './mapData.js';
export type { MapDataJson };
export { MAP_SCALE };

export class PhysicsEngine {
  public segments: CollisionSegment[] = [];
  public polygons: Point2D[][] = [];
  public scale: number = MAP_SCALE;
  public mapPixelWidth: number = 3328;
  public mapPixelHeight: number = 1152;
  public lastGroundNormal: Point2D = { x: 0, y: 1 };

  public toWorldX(px: number): number {
    return (px - this.mapPixelWidth / 2) * this.scale;
  }

  public toWorldY(py: number): number {
    return (this.mapPixelHeight / 2 - py) * this.scale;
  }

  public loadMapGeometry(mapData: MapDataJson): void {
    this.segments = [];
    this.polygons = [];
    this.mapPixelWidth = mapData.width || 3328;
    this.mapPixelHeight = mapData.height || 1152;

    for (const poly of mapData.collision_polys) {
      const worldPts: Point2D[] = poly.points.map(pt => ({
        x: this.toWorldX(pt[0]),
        y: this.toWorldY(pt[1])
      }));

      this.polygons.push(worldPts);

      // Create line segments for each edge
      for (let i = 0; i < worldPts.length; i++) {
        const p1 = worldPts[i];
        const p2 = worldPts[(i + 1) % worldPts.length];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        if (len > 0.001) {
          this.segments.push({
            p1,
            p2,
            dx,
            dy,
            len,
            nx: -dy / len,
            ny: dx / len
          });
        }
      }
    }

    // Add map boundary walls on left, right, and top (NO bottom floor so entities freefall into the abyss)
    const hw = (this.mapPixelWidth / 2) * this.scale + 2;
    const hh = (this.mapPixelHeight / 2) * this.scale + 2;
    const bounds: [Point2D, Point2D][] = [
      [{ x: hw, y: -hh - 40 }, { x: hw, y: hh }],   // right wall
      [{ x: hw, y: hh }, { x: -hw, y: hh }],         // top ceiling
      [{ x: -hw, y: hh }, { x: -hw, y: -hh - 40 }]  // left wall
    ];
    for (const [p1, p2] of bounds) {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      this.segments.push({
        p1,
        p2,
        dx,
        dy,
        len,
        nx: -dy / len,
        ny: dx / len
      });
    }

    console.log(`Loaded ${this.polygons.length} polygons and ${this.segments.length} collision segments.`);
  }

  // Point in polygon test (ray casting algorithm)
  public isPointInPolygon(p: Point2D, poly: Point2D[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x;
      const yi = poly[i].y;
      const xj = poly[j].x;
      const yj = poly[j].y;
      const intersect =
        yi > p.y !== yj > p.y &&
        p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Resolve circle vs segments and polygons collision
  public resolveCircle(pos: Point2D, radius: number, vel: Point2D | null = null): boolean {
    let onGround = false;
    let groundNormalX = 0;
    let groundNormalY = 1;
    let foundGround = false;
    const iterations = 4;

    for (let it = 0; it < iterations; it++) {
      let collided = false;

      // 1. Eject if center has penetrated inside any terrain polygon
      for (const poly of this.polygons) {
        if (poly.length >= 3 && this.isPointInPolygon(pos, poly)) {
          let bestDistSq = Infinity;
          let bestCx = pos.x;
          let bestCy = pos.y;
          let bestNx = 0;
          let bestNy = 1;

          for (let i = 0; i < poly.length; i++) {
            const p1 = poly[i];
            const p2 = poly[(i + 1) % poly.length];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const lenSq = dx * dx + dy * dy;
            if (lenSq < 0.0001) continue;
            const t = Math.max(0, Math.min(1, ((pos.x - p1.x) * dx + (pos.y - p1.y) * dy) / lenSq));
            const cx = p1.x + t * dx;
            const cy = p1.y + t * dy;
            const dSq = (pos.x - cx) ** 2 + (pos.y - cy) ** 2;
            if (dSq < bestDistSq) {
              bestDistSq = dSq;
              bestCx = cx;
              bestCy = cy;
              const len = Math.sqrt(lenSq);
              bestNx = -dy / len;
              bestNy = dx / len;
            }
          }

          pos.x = bestCx + bestNx * (radius + 0.05);
          pos.y = bestCy + bestNy * (radius + 0.05);

          if (bestNy > 0.25) {
            onGround = true;
            foundGround = true;
            groundNormalX = bestNx;
            groundNormalY = bestNy;
          }

          if (vel) {
            const dot = vel.x * bestNx + vel.y * bestNy;
            if (dot < 0) {
              vel.x -= dot * bestNx;
              vel.y -= dot * bestNy;
            }
          }
          collided = true;
        }
      }

      // 2. Segment boundary collision
      for (const seg of this.segments) {
        const vx = pos.x - seg.p1.x;
        const vy = pos.y - seg.p1.y;
        const t = Math.max(0, Math.min(1, (vx * seg.dx + vy * seg.dy) / (seg.len * seg.len)));
        const closestX = seg.p1.x + t * seg.dx;
        const closestY = seg.p1.y + t * seg.dy;

        const diffX = pos.x - closestX;
        const diffY = pos.y - closestY;
        const distSq = diffX * diffX + diffY * diffY;

        if (distSq < radius * radius) {
          const dist = Math.sqrt(distSq);
          let nx = dist > 0.0001 ? diffX / dist : seg.nx;
          let ny = dist > 0.0001 ? diffY / dist : seg.ny;

          // Crucial: ensure normal always pushes outwards away from rock
          if (nx * seg.nx + ny * seg.ny < 0) {
            nx = seg.nx;
            ny = seg.ny;
          }

          const pen = radius - dist;
          pos.x += nx * pen;
          pos.y += ny * pen;

          if (ny > 0.25) {
            onGround = true;
            // Prefer upward slopes or ground contact normals
            if (!foundGround || Math.abs(nx) > Math.abs(groundNormalX) || ny > 0.5) {
              foundGround = true;
              groundNormalX = nx;
              groundNormalY = ny;
            }
          }

          if (vel) {
            const dot = vel.x * nx + vel.y * ny;
            if (dot < 0) {
              vel.x -= dot * nx;
              vel.y -= dot * ny;
            }
          }
          collided = true;
        }
      }

      if (!collided) break;
    }

    if (onGround) {
      this.lastGroundNormal.x = groundNormalX;
      this.lastGroundNormal.y = groundNormalY;
    }

    return onGround;
  }

  // Raycast against all collision segments
  public raycast(startX: number, startY: number, endX: number, endY: number): RaycastHit | null {
    const rx = endX - startX;
    const ry = endY - startY;
    const rLen = Math.hypot(rx, ry);
    if (rLen <= 0.0001) return null;

    let closestHit: RaycastHit | null = null;
    let minT = 1.0;

    for (const seg of this.segments) {
      const sx = seg.dx;
      const sy = seg.dy;

      // 2D line intersection: start + t * r = seg.p1 + u * s
      const denom = rx * sy - ry * sx;
      if (Math.abs(denom) < 0.000001) continue;

      const qpx = seg.p1.x - startX;
      const qpy = seg.p1.y - startY;

      const t = (qpx * sy - qpy * sx) / denom;
      const u = (qpx * ry - qpy * rx) / denom;

      if (t >= 0 && t <= minT && u >= 0 && u <= 1) {
        minT = t;
        closestHit = {
          x: startX + t * rx,
          y: startY + t * ry,
          dist: t * rLen,
          nx: seg.nx,
          ny: seg.ny
        };
      }
    }

    return closestHit;
  }
}
