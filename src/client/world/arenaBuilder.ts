import * as THREE from 'three';
import gameConfig from '../../config/gameConfig.json' with { type: 'json' };
import {
  BIOME_DEFINITIONS,
  BiomeId,
  OUTER_BIOMES,
  type CollapseState,
  type HelicopterState,
  type LootNode,
} from '../../shared/types.ts';
import {
  ARENA_RADIUS,
  BASE_CAMP_RADIUS,
  generateArenaLayout,
  getBiomeAt,
  getGroundHeightAt,
} from '../../shared/worldGen.ts';
import type { ProceduralTextureSet } from './textures.ts';

export interface LootNodeVisual {
  id: string;
  group: THREE.Group;
  lidPivot: THREE.Group | null;
  beaconRing: THREE.Mesh;
  opened: boolean;
}

export interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
}

export interface ArenaSceneObjects {
  worldGroup: THREE.Group;
  collidableMeshes: THREE.Object3D[];
  lootVisuals: Map<string, LootNodeVisual>;
  helicopterGroup: THREE.Group;
  mainRotor: THREE.Group;
  tailRotor: THREE.Group;
  flareBeacon: THREE.Mesh;
  collapseBarriers: Map<BiomeId, THREE.Mesh>;
  spawnBurst: (x: number, y: number, z: number, colorHex: number, count: number) => void;
  update: (dt: number, elapsed: number, collapse: CollapseState, helicopter: HelicopterState, playerBiome: BiomeId) => void;
  syncLoot: (nodes: LootNode[]) => void;
  dispose: () => void;
}

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

export function buildArenaScene(
  seed: number,
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
  quality: 'low' | 'medium' | 'high'
): ArenaSceneObjects {
  const worldGroup = new THREE.Group();
  const collidableMeshes: THREE.Object3D[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // 1. Continuous Vertex-Colored Terrain Mesh covering the hexagonal arena + extended rim
  const segs = quality === 'low' ? 68 : quality === 'medium' ? 92 : 112;
  const terrainSize = ARENA_RADIUS * 2.35;
  const terrainGeo = trackGeo(new THREE.PlaneGeometry(terrainSize, terrainSize, segs, segs));
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = getGroundHeightAt(x, z, seed);
    posAttr.setY(i, y);

    const biome = getBiomeAt(x, z);
    _color.set(BIOME_DEFINITIONS[biome].groundColor);
    // Subtle paper fold shading variation
    const n = (Math.sin(x * 0.25) * Math.cos(z * 0.25)) * 0.05;
    _color.offsetHSL(0, 0, n);
    colors[i * 3] = _color.r;
    colors[i * 3 + 1] = _color.g;
    colors[i * 3 + 2] = _color.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = trackMat(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      bumpMap: textures.terrainBump,
      bumpScale: 0.08,
      roughness: 0.9,
      metalness: 0.04,
      flatShading: true,
    })
  );
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  worldGroup.add(terrainMesh);
  collidableMeshes.push(terrainMesh);

  // 2. Marsh Shallow Water Wedge (Sector 0: 0..60 deg)
  const waterGeo = trackGeo(new THREE.CircleGeometry(ARENA_RADIUS - 6, 12, 0, Math.PI / 3));
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x263b34,
      roughness: 0.2,
      metalness: 0.25,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
    })
  );
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.y = -0.22;
  waterMesh.rotation.y = -Math.PI / 3;
  worldGroup.add(waterMesh);

  // 3. Base Camp Central Gathering Pavilion, Ceremonial Pedestal & Helipad
  const stoneMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5d574e,
      bumpMap: textures.paperBump,
      bumpScale: 0.04,
      roughness: 0.88,
      flatShading: true,
    })
  );
  const goldMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd4a853,
      roughness: 0.28,
      metalness: 0.65,
      flatShading: true,
    })
  );
  const timberMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x4f3b2a,
      roughness: 0.85,
      flatShading: true,
    })
  );

  // Base Camp central plaza stone ring
  const plazaRing = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(11.5, 12.2, 0.22, 6)), stoneMat);
  plazaRing.position.set(0, 0.12, 0);
  plazaRing.receiveShadow = true;
  worldGroup.add(plazaRing);

  // Ceremonial Pedestal at (0, 0)
  const pedGroup = new THREE.Group();
  const pedBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(2.1, 2.5, 0.55, 6)), stoneMat);
  pedBase.position.y = 0.45;
  const pedAltar = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.65, 0.9, 1.15, 6)), stoneMat);
  pedAltar.position.y = 1.2;
  const pedCrown = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.42, 0)), goldMat);
  pedCrown.position.y = 2.15;
  const pedEmber = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 6)),
    trackMat(new THREE.MeshBasicMaterial({ color: 0xd96b38 }))
  );
  pedEmber.position.y = 1.79;
  pedGroup.add(pedBase, pedAltar, pedCrown, pedEmber);
  worldGroup.add(pedGroup);

  // Helipad Deck at (0, -13)
  const heliPos = gameConfig.world.helipadPos;
  const heliBaseY = getGroundHeightAt(heliPos.x, heliPos.z, seed);
  const heliDeck = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(5.6, 6.2, 0.35, 16)),
    trackMat(new THREE.MeshStandardMaterial({ map: textures.helipadMap, color: 0xffffff, roughness: 0.72 }))
  );
  heliDeck.position.set(heliPos.x, heliBaseY + 0.14, heliPos.z);
  heliDeck.receiveShadow = true;
  worldGroup.add(heliDeck);

  // Flare Beacon Terminal beside Helipad
  const consoleGroup = new THREE.Group();
  consoleGroup.position.set(heliPos.x + 4.4, heliBaseY + 0.1, heliPos.z + 2.2);
  const consolePost = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.55, 1.3, 0.55)), stoneMat);
  consolePost.position.y = 0.65;
  const flareBeacon = new THREE.Mesh(
    trackGeo(new THREE.OctahedronGeometry(0.24, 0)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xd96b38, emissive: 0xd96b38, emissiveIntensity: 0.6, roughness: 0.3 }))
  );
  flareBeacon.position.y = 1.55;
  consoleGroup.add(consolePost, flareBeacon);
  worldGroup.add(consoleGroup);

  // 4. Deterministic Obstacles & Multi-Part Biome Architecture
  const layout = generateArenaLayout(seed);

  // Instanced Pine Trees & Rocks for high mobile/desktop performance
  const treePositions: Array<{ x: number; y: number; z: number; scale: number; rot: number; color: number }> = [];
  const rockPositions: Array<{ x: number; y: number; z: number; scale: number; rot: number; color: number }> = [];

  for (const obs of layout.obstacles) {
    if (obs.kind === 'pavilion_pillar') {
      const pGroup = new THREE.Group();
      pGroup.position.set(obs.x, obs.y, obs.z);
      const col = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.55, 0.7, obs.height, 6)), stoneMat);
      col.position.y = obs.height / 2;
      col.castShadow = true;
      col.receiveShadow = true;
      const cap = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.95, 0.65, 0.45, 6)), timberMat);
      cap.position.y = obs.height + 0.2;
      const band = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.62, 0.62, 0.2, 6)), goldMat);
      band.position.y = obs.height - 0.6;
      pGroup.add(col, cap, band);
      worldGroup.add(pGroup);
      collidableMeshes.push(col);
    } else if (obs.kind === 'tree') {
      const tint =
        obs.biome === BiomeId.MARSH
          ? 0x4b5343
          : obs.biome === BiomeId.ORCHARD_RUINS
            ? 0x765a3e
            : 0x2f5336;
      treePositions.push({ x: obs.x, y: obs.y, z: obs.z, scale: obs.scale, rot: obs.rotation, color: tint });
    } else if (obs.kind === 'ruin' || obs.kind === 'fence') {
      // Composite 3-part ruined paper-and-timber structure
      const rGroup = new THREE.Group();
      rGroup.position.set(obs.x, obs.y, obs.z);
      rGroup.rotation.y = obs.rotation;
      rGroup.scale.setScalar(obs.scale);
      const wall1 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.6, 2.4, 0.45)), stoneMat);
      wall1.position.set(0, 1.2, -0.8);
      wall1.castShadow = true;
      wall1.receiveShadow = true;
      const wall2 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.45, 1.9, 2.2)), stoneMat);
      wall2.position.set(-1.1, 0.95, 0.2);
      wall2.castShadow = true;
      const beam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.9, 0.26, 0.35)), timberMat);
      beam.position.set(0.1, 2.35, -0.4);
      beam.rotation.z = -0.14;
      rGroup.add(wall1, wall2, beam);
      worldGroup.add(rGroup);
      collidableMeshes.push(wall1, wall2);
    } else {
      const tint =
        obs.biome === BiomeId.FROST_RIDGE
          ? 0xa4c6dc
          : obs.biome === BiomeId.SALT_DUNES
            ? 0xe8dfd0
            : obs.biome === BiomeId.CINDER_FLATS
              ? 0x2c2220
              : 0x625d56;
      rockPositions.push({ x: obs.x, y: obs.y, z: obs.z, scale: obs.scale, rot: obs.rotation, color: tint });
    }
  }

  // Build Instanced Trees (trunk + 2 origami cone tiers)
  if (treePositions.length > 0) {
    const trunkMesh = new THREE.InstancedMesh(
      trackGeo(new THREE.CylinderGeometry(0.22, 0.36, 2.6, 5)),
      timberMat,
      treePositions.length
    );
    const canopyMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }));
    const tier1 = new THREE.InstancedMesh(trackGeo(new THREE.ConeGeometry(1.75, 3.0, 6)), canopyMat, treePositions.length);
    const tier2 = new THREE.InstancedMesh(trackGeo(new THREE.ConeGeometry(1.25, 2.4, 6)), canopyMat, treePositions.length);

    treePositions.forEach((t, i) => {
      _dummy.position.set(t.x, t.y + 1.3 * t.scale, t.z);
      _dummy.rotation.set(0, t.rot, 0);
      _dummy.scale.setScalar(t.scale);
      _dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, _dummy.matrix);

      _dummy.position.set(t.x, t.y + 3.1 * t.scale, t.z);
      _dummy.updateMatrix();
      tier1.setMatrixAt(i, _dummy.matrix);
      tier1.setColorAt(i, _color.setHex(t.color));

      _dummy.position.set(t.x, t.y + 4.7 * t.scale, t.z);
      _dummy.updateMatrix();
      tier2.setMatrixAt(i, _dummy.matrix);
      tier2.setColorAt(i, _color.setHex(t.color).offsetHSL(0, 0, 0.05));
    });
    trunkMesh.castShadow = !isSoftwareGl;
    tier1.castShadow = !isSoftwareGl;
    trunkMesh.computeBoundingSphere();
    tier1.computeBoundingSphere();
    tier2.computeBoundingSphere();
    worldGroup.add(trunkMesh, tier1, tier2);
  }

  // Build Instanced Rocks & Crystal Pillars
  if (rockPositions.length > 0) {
    const rockMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        bumpMap: textures.paperBump,
        bumpScale: 0.05,
        roughness: 0.82,
        flatShading: true,
      })
    );
    const rockInst = new THREE.InstancedMesh(trackGeo(new THREE.DodecahedronGeometry(1.35, 0)), rockMat, rockPositions.length);
    rockPositions.forEach((r, i) => {
      _dummy.position.set(r.x, r.y + 0.9 * r.scale, r.z);
      _dummy.rotation.set(0.2, r.rot, 0.15);
      _dummy.scale.set(r.scale, r.scale * 1.45, r.scale);
      _dummy.updateMatrix();
      rockInst.setMatrixAt(i, _dummy.matrix);
      rockInst.setColorAt(i, _color.setHex(r.color));
    });
    rockInst.castShadow = !isSoftwareGl;
    rockInst.receiveShadow = true;
    rockInst.computeBoundingSphere();
    worldGroup.add(rockInst);
  }

  // Natural Hexagonal Perimeter Cliffs / Rim Spires (so arena never looks like an indoor wall in a void)
  const rimCount = 36;
  const rimMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x3b352f, roughness: 0.92, flatShading: true }));
  const rimInst = new THREE.InstancedMesh(trackGeo(new THREE.ConeGeometry(8.5, 18, 5)), rimMat, rimCount);
  for (let i = 0; i < rimCount; i++) {
    const a = (i / rimCount) * Math.PI * 2;
    const rad = ARENA_RADIUS + 4;
    _dummy.position.set(Math.cos(a) * rad, 5.5, Math.sin(a) * rad);
    _dummy.rotation.set(0, a, 0);
    _dummy.scale.set(1 + (i % 3) * 0.25, 0.9 + (i % 2) * 0.35, 1.2);
    _dummy.updateMatrix();
    rimInst.setMatrixAt(i, _dummy.matrix);
  }
  rimInst.computeBoundingSphere();
  worldGroup.add(rimInst);

  // 5. Loot Node Visuals (Composite Chests & Ground Satchels)
  const lootVisuals = new Map<string, LootNodeVisual>();
  const chestWoodMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x6f4b2b, roughness: 0.8, flatShading: true }));
  const satchelMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x9b7a4f, roughness: 0.85, flatShading: true }));
  const beaconMat = trackMat(
    new THREE.MeshBasicMaterial({ color: 0xd4a853, transparent: true, opacity: 0.72, side: THREE.DoubleSide })
  );

  const createLootVisual = (node: LootNode) => {
    const group = new THREE.Group();
    group.position.set(node.x, node.y, node.z);
    let lidPivot: THREE.Group | null = null;

    if (node.kind === 'container') {
      const base = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.05, 0.52, 0.72)), chestWoodMat);
      base.position.y = 0.26;
      base.castShadow = true;
      lidPivot = new THREE.Group();
      lidPivot.position.set(0, 0.52, -0.35);
      const lid = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.08, 0.2, 0.74)), goldMat);
      lid.position.set(0, 0.1, 0.35);
      lidPivot.add(lid);
      group.add(base, lidPivot);
    } else {
      const bag = new THREE.Mesh(trackGeo(new THREE.DodecahedronGeometry(0.42, 0)), satchelMat);
      bag.position.y = 0.26;
      bag.scale.set(1.2, 0.75, 1);
      const strap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.5, 0.1, 0.55)), goldMat);
      strap.position.y = 0.32;
      group.add(bag, strap);
    }

    const beaconRing = new THREE.Mesh(trackGeo(new THREE.RingGeometry(0.55, 0.72, 16)), beaconMat);
    beaconRing.rotation.x = -Math.PI / 2;
    beaconRing.position.y = 0.04;
    group.add(beaconRing);

    worldGroup.add(group);
    lootVisuals.set(node.id, { id: node.id, group, lidPivot, beaconRing, opened: node.opened });
  };
  layout.lootNodes.forEach(createLootVisual);

  // 6. Collapse Ash Barriers (6 outer wedge curtains)
  const collapseBarriers = new Map<BiomeId, THREE.Mesh>();
  OUTER_BIOMES.forEach((biome, sector) => {
    const startAngle = (sector * Math.PI * 2) / 6;
    const arcGeo = trackGeo(new THREE.CylinderGeometry(ARENA_RADIUS - 2, BASE_CAMP_RADIUS, 16, 8, 1, true, -startAngle - Math.PI / 3 + Math.PI / 2, Math.PI / 3));
    const arcMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xd96b38,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    const mesh = new THREE.Mesh(arcGeo, arcMat);
    mesh.position.y = 7.5;
    mesh.visible = false;
    worldGroup.add(mesh);
    collapseBarriers.set(biome, mesh);
  });

  // 7. Composite 3D Extraction Helicopter
  const helicopterGroup = new THREE.Group();
  helicopterGroup.position.set(heliPos.x, 26, heliPos.z);
  helicopterGroup.visible = false;

  const heliBodyMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x3b403c, roughness: 0.45, metalness: 0.4, flatShading: true }));
  const cockpitMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x9ec5d8, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.72 }));

  const hull = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.4, 1.8, 4.8)), heliBodyMat);
  hull.position.y = 1.3;
  const cockpit = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(1.25, 1.8, 5)), cockpitMat);
  cockpit.rotation.x = Math.PI / 2;
  cockpit.position.set(0, 1.25, 2.8);
  const tailBoom = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.55, 0.55, 3.8)), heliBodyMat);
  tailBoom.position.set(0, 1.5, -3.8);
  const skidL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 0.14, 4.4)), goldMat);
  skidL.position.set(-1.15, 0.12, 0.2);
  const skidR = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 0.14, 4.4)), goldMat);
  skidR.position.set(1.15, 0.12, 0.2);

  const mainRotor = new THREE.Group();
  mainRotor.position.set(0, 2.35, 0.2);
  const blade1 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.2, 0.06, 0.28)), goldMat);
  const blade2 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.28, 0.06, 7.2)), goldMat);
  mainRotor.add(blade1, blade2);

  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.38, 1.6, -5.5);
  const tBlade = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.06, 1.4, 0.18)), goldMat);
  tailRotor.add(tBlade);

  helicopterGroup.add(hull, cockpit, tailBoom, skidL, skidR, mainRotor, tailRotor);
  worldGroup.add(helicopterGroup);

  // 8. Pooled Particle Ring Buffer (180 ash/snow/ember/combat particles)
  const MAX_PARTICLES = isSoftwareGl ? 70 : quality === 'low' ? 90 : 180;
  const particles: PooledParticle[] = Array.from({ length: MAX_PARTICLES }, () => ({
    active: false,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    life: 0,
    maxLife: 1,
    scale: 1,
  }));
  let particleCursor = 0;

  const pGeo = trackGeo(new THREE.OctahedronGeometry(0.12, 0));
  const pMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const pMesh = new THREE.InstancedMesh(pGeo, pMat, MAX_PARTICLES);
  pMesh.frustumCulled = false;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    _dummy.position.set(0, -100, 0);
    _dummy.scale.setScalar(0.001);
    _dummy.updateMatrix();
    pMesh.setMatrixAt(i, _dummy.matrix);
    pMesh.setColorAt(i, _color.setHex(0xd4a853));
  }
  worldGroup.add(pMesh);

  const spawnBurst = (x: number, y: number, z: number, colorHex: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const idx = particleCursor;
      particleCursor = (particleCursor + 1) % MAX_PARTICLES;
      const p = particles[idx];
      p.active = true;
      p.x = x + (Math.random() - 0.5) * 0.5;
      p.y = y + Math.random() * 0.4;
      p.z = z + (Math.random() - 0.5) * 0.5;
      p.vx = (Math.random() - 0.5) * 5;
      p.vy = 1.5 + Math.random() * 4;
      p.vz = (Math.random() - 0.5) * 5;
      p.life = 0;
      p.maxLife = 0.45 + Math.random() * 0.45;
      p.scale = 0.8 + Math.random() * 0.9;
      pMesh.setColorAt(idx, _color.setHex(colorHex));
    }
    if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
  };

  return {
    worldGroup,
    collidableMeshes,
    lootVisuals,
    helicopterGroup,
    mainRotor,
    tailRotor,
    flareBeacon,
    collapseBarriers,
    spawnBurst,
    syncLoot(nodes: LootNode[]) {
      for (const node of nodes) {
        let vis = lootVisuals.get(node.id);
        if (!vis) {
          createLootVisual(node);
          vis = lootVisuals.get(node.id);
        }
        if (!vis) continue;
        vis.opened = node.opened;
        if (node.opened) {
          vis.beaconRing.visible = false;
          if (vis.lidPivot) vis.lidPivot.rotation.x = -1.1;
        }
      }
    },
    update(dt: number, elapsed: number, collapse: CollapseState, helicopter: HelicopterState, playerBiome: BiomeId) {
      pedCrown.rotation.y = elapsed * 0.9;
      pedCrown.position.y = 2.15 + Math.sin(elapsed * 2) * 0.08;
      flareBeacon.rotation.y = elapsed * 1.4;

      // Collapse barrier visibility
      for (const [biome, mesh] of collapseBarriers.entries()) {
        const mat = mesh.material as THREE.MeshBasicMaterial;
        if (collapse.collapsedBiomes.includes(biome)) {
          mesh.visible = true;
          mat.color.setHex(0x8e2a1b);
          mat.opacity = 0.34;
        } else if (collapse.warningBiome === biome) {
          mesh.visible = true;
          mat.color.setHex(0xd96b38);
          mat.opacity = 0.14 + Math.sin(elapsed * 4) * 0.06;
        } else {
          mesh.visible = false;
        }
      }

      // Helicopter animation
      if (helicopter.phase !== 'idle') {
        helicopterGroup.visible = true;
        helicopterGroup.position.set(helicopter.x, helicopter.y + heliBaseY, helicopter.z);
        mainRotor.rotation.y += dt * 18;
        tailRotor.rotation.x += dt * 24;
      } else {
        helicopterGroup.visible = false;
      }

      // Ambient biome snow / ash / ember particle trickle
      if (Math.random() < (isSoftwareGl ? 0.15 : 0.45)) {
        const hex =
          playerBiome === BiomeId.FROST_RIDGE
            ? 0xeef6fc
            : playerBiome === BiomeId.CINDER_FLATS
              ? 0xd96b38
              : 0xb8ad9a;
        const idx = particleCursor;
        particleCursor = (particleCursor + 1) % MAX_PARTICLES;
        const p = particles[idx];
        p.active = true;
        p.x = (Math.random() - 0.5) * 60;
        p.y = 9 + Math.random() * 6;
        p.z = (Math.random() - 0.5) * 60;
        p.vx = (Math.random() - 0.5) * 1.4;
        p.vy = playerBiome === BiomeId.CINDER_FLATS ? 1.2 : -1.8;
        p.vz = (Math.random() - 0.5) * 1.4;
        p.life = 0;
        p.maxLife = 2.8;
        p.scale = 0.65;
        pMesh.setColorAt(idx, _color.setHex(hex));
        if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
      }

      // Update pooled particles in-place
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = particles[i];
        if (!p.active) continue;
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          _dummy.position.set(0, -100, 0);
          _dummy.scale.setScalar(0.001);
          _dummy.updateMatrix();
          pMesh.setMatrixAt(i, _dummy.matrix);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const s = p.scale * (1 - p.life / p.maxLife);
        _dummy.position.set(p.x, p.y, p.z);
        _dummy.rotation.set(p.life * 2, p.life * 3, 0);
        _dummy.scale.setScalar(Math.max(0.01, s));
        _dummy.updateMatrix();
        pMesh.setMatrixAt(i, _dummy.matrix);
      }
      pMesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
