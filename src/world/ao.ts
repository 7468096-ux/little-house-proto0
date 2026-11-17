import * as THREE from 'three';
import { onVisualChange, VIS } from '../visual';

// Запасной «ambient occlusion»: мягкие тёмные пятна-декали на земле под домом, елями, пнями и грядками.
// Настоящего AO в проекте нет; пятна темнят стыки предметов с землёй. Параметры — visual.json → ao.

export interface AoSpot {
  x: number;
  z: number;
  /** Полуразмеры пятна по X и Z, метры. */
  rx: number;
  rz: number;
}

let tex: THREE.CanvasTexture | null = null;
function blobTexture() {
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  tex = new THREE.CanvasTexture(c);
  return tex;
}

const mats = new Set<THREE.MeshBasicMaterial>();
function sync() {
  for (const m of mats) {
    m.color.set(VIS.ao.color);
    m.opacity = VIS.ao.opacity;
  }
}
const meshes = new Set<THREE.Object3D>();
onVisualChange('ao', sync);

/** Слой пятен; set() заменяет набор пятен целиком. */
export function aoLayer(root: THREE.Object3D) {
  const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const m = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false });
  mats.add(m);
  sync();
  let mesh: THREE.InstancedMesh | null = null;
  const dummy = new THREE.Object3D();
  let last: AoSpot[] = [];
  onVisualChange('ao', () => layer.set(last));
  const layer = {
    set(spots: AoSpot[]) {
      last = spots;
      if (mesh) {
        root.remove(mesh);
        meshes.delete(mesh);
        mesh.dispose();
      }
      mesh = new THREE.InstancedMesh(geo, m, Math.max(1, spots.length));
      spots.forEach((s, i) => {
        dummy.position.set(s.x, 0.014, s.z);
        dummy.scale.set(s.rx * VIS.ao.spread, 1, s.rz * VIS.ao.spread);
        dummy.updateMatrix();
        mesh!.setMatrixAt(i, dummy.matrix);
      });
      mesh.count = spots.length;
      mesh.renderOrder = 1;
      mesh.visible = VIS.ao.enabled;
      meshes.add(mesh);
      root.add(mesh);
    },
  };
  return layer;
}
