// Tiny Militia Web - 3D Particle System for Visual Effects (TypeScript)
import * as THREE from 'three';

export interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  gravity?: number;
}

export interface Shockwave {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
}

export class ParticleSystem {
  public scene: THREE.Scene;
  public particles: Particle[] = [];
  public shockwaves: Shockwave[] = [];
  public group: THREE.Group;

  private smokeGeo: THREE.DodecahedronGeometry;
  private sparkGeo: THREE.BoxGeometry;
  private flameGeo: THREE.SphereGeometry;
  private ringGeo: THREE.RingGeometry;

  private smokeMat: THREE.MeshBasicMaterial;
  private flameMat: THREE.MeshBasicMaterial;
  private sparkMat: THREE.MeshBasicMaterial;
  private bloodMat: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.smokeGeo = new THREE.DodecahedronGeometry(0.18, 1);
    this.sparkGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    this.flameGeo = new THREE.SphereGeometry(0.12, 6, 6);
    this.ringGeo = new THREE.RingGeometry(0.2, 0.4, 24);

    this.smokeMat = new THREE.MeshBasicMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0.6
    });

    this.flameMat = new THREE.MeshBasicMaterial({
      color: 0xff6b35,
      transparent: true,
      opacity: 0.85
    });

    this.sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffd166
    });

    this.bloodMat = new THREE.MeshBasicMaterial({
      color: 0xc1121f
    });

    this.group = new THREE.Group();
    this.scene.add(this.group);
  }

  public emitJetpackFlame(x: number, y: number, z: number, dirX: number = 0, dirY: number = -1): void {
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh(this.flameGeo, this.flameMat.clone());
      mesh.position.set(
        x + (Math.random() - 0.5) * 0.1,
        y + (Math.random() - 0.5) * 0.1,
        z
      );
      this.group.add(mesh);

      const speed = 4 + Math.random() * 4;
      const vx = dirX * speed + (Math.random() - 0.5) * 1.5;
      const vy = dirY * speed + (Math.random() - 0.5) * 1.5;

      this.particles.push({
        mesh,
        vx,
        vy,
        vz: 0,
        life: 0.22,
        maxLife: 0.22,
        startScale: 0.8 + Math.random() * 0.4,
        endScale: 0.1
      });
    }

    if (Math.random() < 0.3) {
      const sMesh = new THREE.Mesh(this.smokeGeo, this.smokeMat.clone());
      sMesh.position.set(x, y - 0.2, z);
      this.group.add(sMesh);
      this.particles.push({
        mesh: sMesh,
        vx: (Math.random() - 0.5) * 0.8,
        vy: -1.5 - Math.random() * 1.2,
        vz: 0,
        life: 0.45,
        maxLife: 0.45,
        startScale: 0.5,
        endScale: 1.5
      });
    }
  }

  public emitMuzzleFlash(x: number, y: number, z: number, angle: number): void {
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
    const flash = new THREE.Mesh(this.smokeGeo, flashMat);
    flash.position.set(x, y, z);
    flash.scale.set(1.4, 0.7, 0.7);
    flash.rotation.z = angle;
    this.group.add(flash);

    this.particles.push({
      mesh: flash,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0.05,
      maxLife: 0.05,
      startScale: 1.2,
      endScale: 0.1
    });
  }

  public emitBulletImpact(x: number, y: number, z: number, normalX: number = 0, normalY: number = 1): void {
    for (let i = 0; i < 6; i++) {
      const spark = new THREE.Mesh(this.sparkGeo, this.sparkMat.clone());
      spark.position.set(x, y, z);
      this.group.add(spark);

      const angle = Math.atan2(normalY, normalX) + (Math.random() - 0.5) * 1.5;
      const speed = 4 + Math.random() * 6;
      this.particles.push({
        mesh: spark,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vz: (Math.random() - 0.5) * 2,
        gravity: -12,
        life: 0.3,
        maxLife: 0.3,
        startScale: 0.6,
        endScale: 0.1
      });
    }

    const dust = new THREE.Mesh(this.smokeGeo, this.smokeMat.clone());
    dust.position.set(x, y, z);
    this.group.add(dust);
    this.particles.push({
      mesh: dust,
      vx: normalX * 0.8,
      vy: normalY * 0.8,
      vz: 0,
      life: 0.4,
      maxLife: 0.4,
      startScale: 0.8,
      endScale: 1.8
    });
  }

  public emitBloodSplatter(x: number, y: number, z: number): void {
    for (let i = 0; i < 8; i++) {
      const drop = new THREE.Mesh(this.sparkGeo, this.bloodMat.clone());
      drop.position.set(x, y, z);
      this.group.add(drop);

      this.particles.push({
        mesh: drop,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.2) * 6,
        vz: (Math.random() - 0.5) * 2,
        gravity: -15,
        life: 0.35,
        maxLife: 0.35,
        startScale: 0.7,
        endScale: 0.1
      });
    }
  }

  public emitExplosion(x: number, y: number, z: number, scale: number = 1.0): void {
    for (let i = 0; i < 16; i++) {
      const flame = new THREE.Mesh(this.smokeGeo, this.flameMat.clone());
      flame.position.set(x, y, z);
      this.group.add(flame);

      const angle = Math.random() * Math.PI * 2;
      const speed = (3 + Math.random() * 8) * scale;
      this.particles.push({
        mesh: flame,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vz: (Math.random() - 0.5) * 4,
        life: 0.45 + Math.random() * 0.2,
        maxLife: 0.65,
        startScale: 1.2 * scale,
        endScale: 0.2
      });
    }

    for (let i = 0; i < 12; i++) {
      const smokeMat = new THREE.MeshBasicMaterial({
        color: 0x444444,
        transparent: true,
        opacity: 0.8
      });
      const smoke = new THREE.Mesh(this.smokeGeo, smokeMat);
      smoke.position.set(x, y, z);
      this.group.add(smoke);

      const angle = Math.random() * Math.PI * 2;
      const speed = (1 + Math.random() * 4) * scale;
      this.particles.push({
        mesh: smoke,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 1.5,
        vz: (Math.random() - 0.5) * 3,
        life: 0.8 + Math.random() * 0.4,
        maxLife: 1.2,
        startScale: 1.0 * scale,
        endScale: 3.0 * scale
      });
    }

    const shockMat = new THREE.MeshBasicMaterial({
      color: 0xffe6a7,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    });
    const shockRing = new THREE.Mesh(this.ringGeo, shockMat);
    shockRing.position.set(x, y, z);
    this.group.add(shockRing);

    this.shockwaves.push({
      mesh: shockRing,
      life: 0.35,
      maxLife: 0.35,
      startScale: 0.4,
      endScale: 6.5 * scale
    });
  }

  public update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;

      if (p.life <= 0) {
        this.group.remove(p.mesh);
        p.mesh.geometry?.dispose();
        if (Array.isArray(p.mesh.material)) {
          p.mesh.material.forEach(m => m.dispose());
        } else {
          p.mesh.material?.dispose();
        }
        this.particles.splice(i, 1);
        continue;
      }

      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += (p.vz || 0) * dt;

      if (p.gravity) {
        p.vy += p.gravity * dt;
      }

      const progress = 1 - (p.life / p.maxLife);
      const scale = THREE.MathUtils.lerp(p.startScale, p.endScale, progress);
      p.mesh.scale.set(scale, scale, scale);

      const mat = p.mesh.material as THREE.Material;
      if (mat && 'opacity' in mat) {
        (mat as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - progress);
      }
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.life -= dt;

      if (s.life <= 0) {
        this.group.remove(s.mesh);
        s.mesh.geometry?.dispose();
        if (Array.isArray(s.mesh.material)) {
          s.mesh.material.forEach(m => m.dispose());
        } else {
          s.mesh.material?.dispose();
        }
        this.shockwaves.splice(i, 1);
        continue;
      }

      const progress = 1 - (s.life / s.maxLife);
      const scale = THREE.MathUtils.lerp(s.startScale, s.endScale, Math.pow(progress, 0.6));
      s.mesh.scale.set(scale, scale, 1);
      const mat = s.mesh.material as THREE.MeshBasicMaterial;
      if (mat) {
        mat.opacity = Math.max(0, (1 - progress) * 0.85);
      }
    }
  }
}
