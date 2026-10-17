// Tiny Militia Web - 2.5D Swept Collision & Raycasting Physics Engine
export class PhysicsEngine {
  constructor() {
    this.segments = []; // All line segments from collision polygons
    this.polygons = []; // Raw polygon point arrays
    this.scale = 0.045; // Pixel to World coordinate scale
    this.mapPixelWidth = 3328;
    this.mapPixelHeight = 1152;
  }

  toWorldX(px) {
    return (px - this.mapPixelWidth / 2) * this.scale;
  }

  toWorldY(py) {
    return (this.mapPixelHeight / 2 - py) * this.scale;
  }

  loadMapGeometry(mapData) {
    this.segments = [];
    this.polygons = [];
    this.mapPixelWidth = mapData.width || 3328;
    this.mapPixelHeight = mapData.height || 1152;

    for (const poly of mapData.collision_polys) {
      const worldPts = poly.points.map(pt => ({
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
          // Normal pointing outwards (assuming CW or CCW order)
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

    // Add map boundary walls so players/bullets don't escape outside
    const hw = (this.mapPixelWidth / 2) * this.scale + 2;
    const hh = (this.mapPixelHeight / 2) * this.scale + 2;
    const bounds = [
      [{ x: -hw, y: -hh }, { x: hw, y: -hh }], // bottom
      [{ x: hw, y: -hh }, { x: hw, y: hh }],   // right
      [{ x: hw, y: hh }, { x: -hw, y: hh }],   // top
      [{ x: -hw, y: hh }, { x: -hw, y: -hh }]  // left
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

  // Resolve circle vs segments collision
  resolveCircle(pos, radius, vel = null) {
    let onGround = false;
    const iterations = 3;

    for (let it = 0; it < iterations; it++) {
      let collided = false;

      for (const seg of this.segments) {
        // Find closest point on segment to circle center
        const vx = pos.x - seg.p1.x;
        const vy = pos.y - seg.p1.y;
        const t = Math.max(0, Math.min(1, (vx * seg.dx + vy * seg.dy) / (seg.len * seg.len)));
        const closestX = seg.p1.x + t * seg.dx;
        const closestY = seg.p1.y + t * seg.dy;

        const distSq = (pos.x - closestX) ** 2 + (pos.y - closestY) ** 2;
        if (distSq < radius * radius && distSq > 0.00001) {
          const dist = Math.sqrt(distSq);
          const pen = radius - dist;
          const nx = (pos.x - closestX) / dist;
          const ny = (pos.y - closestY) / dist;

          // Push out
          pos.x += nx * pen;
          pos.y += ny * pen;

          if (ny > 0.5) {
            onGround = true;
          }

          if (vel) {
            // Cancel velocity into wall
            const dot = vel.x * nx + vel.y * ny;
            if (dot < 0) {
              vel.x -= dot * nx * 1.1; // small bounce
              vel.y -= dot * ny * 1.1;
            }
          }
          collided = true;
        }
      }

      if (!collided) break;
    }

    return onGround;
  }

  // Raycast against all collision segments
  raycast(startX, startY, endX, endY) {
    const rx = endX - startX;
    const ry = endY - startY;
    const rLen = Math.hypot(rx, ry);
    if (rLen <= 0.0001) return null;

    let closestHit = null;
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
