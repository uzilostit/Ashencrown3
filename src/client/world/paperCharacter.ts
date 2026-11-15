import * as THREE from 'three';
import {
  HEARTHS,
  type PaperAppearance,
  type PlayerAnimState,
} from '../../shared/types.ts';
import type { ProceduralTextureSet } from './textures.ts';

export interface PaperCharacterRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  headGroup: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  cloakMesh: THREE.Mesh;
  weaponGroup: THREE.Group;
  daggerMesh: THREE.Group;
  bowMesh: THREE.Group;
  pistolMesh: THREE.Group;
  contactShadow: THREE.Mesh;
  nameSprite: THREE.Sprite | null;
  materials: THREE.Material[];
  walkPhase: number;
  flashTimer: number;
  squashY: number;
  prevAnim: PlayerAnimState;
  setAppearance: (app: PaperAppearance, hearthId: string) => void;
  setEquippedWeapon: (weaponId: string) => void;
  setNameLabel: (name: string, isAlly: boolean) => void;
  updateAnimation: (
    dt: number,
    animState: PlayerAnimState,
    horizSpeed: number,
    ceremonyDaggerDrawn?: boolean
  ) => void;
  triggerFlash: () => void;
  dispose: () => void;
}

const _tmpColor = new THREE.Color();

function makeLabelTexture(text: string, isAlly: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 64);

  ctx.fillStyle = isAlly ? 'rgba(42, 74, 48, 0.86)' : 'rgba(20, 19, 17, 0.82)';
  ctx.strokeStyle = isAlly ? '#83c987' : 'rgba(212, 168, 83, 0.65)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(16, 12, 224, 38, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#f2ede4';
  ctx.font = '600 21px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.slice(0, 16), 128, 32);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createPaperCharacter(
  appearance: PaperAppearance,
  hearthId: string,
  textures: ProceduralTextureSet,
  showNameplate = false,
  playerName = ''
): PaperCharacterRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // Inked contour pass: crisp edges make the folded-paper silhouettes read
  // clearly against busy terrain instead of disappearing into soft lighting.
  const addInkOutline = (mesh: THREE.Mesh, opacity = 0.62) => {
    const edgeGeo = trackGeo(new THREE.EdgesGeometry(mesh.geometry, 24));
    const edgeMat = trackMat(new THREE.LineBasicMaterial({
      color: 0x17120f,
      transparent: true,
      opacity,
      depthWrite: false,
    }));
    const outline = new THREE.LineSegments(edgeGeo, edgeMat);
    outline.position.copy(mesh.position);
    outline.quaternion.copy(mesh.quaternion);
    outline.scale.copy(mesh.scale);
    outline.renderOrder = 2;
    mesh.parent?.add(outline);
  };

  // Grounding contact shadow disc
  const shadowGeo = trackGeo(new THREE.CircleGeometry(0.52, 20));
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x0b0a08,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    })
  );
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.02;
  root.add(contactShadow);

  const paperMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(appearance.paperTone),
      map: textures.paperAlbedo,
      bumpMap: textures.paperBump,
      bumpScale: 0.025,
      roughness: 0.88,
      metalness: 0.04,
      flatShading: true,
    })
  );

  const cloakMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(appearance.cloakColor),
      map: textures.paperAlbedo,
      bumpMap: textures.paperBump,
      bumpScale: 0.03,
      roughness: 0.78,
      metalness: 0.06,
      flatShading: true,
      side: THREE.DoubleSide,
    })
  );

  const trimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(appearance.trimColor),
      roughness: 0.38,
      metalness: 0.45,
      flatShading: true,
    })
  );

  const bootMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2c2620,
      roughness: 0.92,
      metalness: 0.05,
      flatShading: true,
    })
  );

  // 1. Folded Torso (beveled hexagonal origami chest)
  const torsoGeo = trackGeo(new THREE.CylinderGeometry(0.26, 0.21, 0.62, 6));
  const torsoMesh = new THREE.Mesh(torsoGeo, cloakMat);
  torsoMesh.position.y = 0.96;
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  bodyPivot.add(torsoMesh);
  addInkOutline(torsoMesh, 0.72);

  // 2. Layered Origami Skirt / Tunic Hem
  const hemGeo = trackGeo(new THREE.CylinderGeometry(0.22, 0.34, 0.34, 6));
  const hemMesh = new THREE.Mesh(hemGeo, cloakMat);
  hemMesh.position.y = 0.64;
  hemMesh.castShadow = true;
  bodyPivot.add(hemMesh);
  addInkOutline(hemMesh, 0.58);

  // 3. Folded Paper Collar + Hearth Crest
  const collarGeo = trackGeo(new THREE.CylinderGeometry(0.29, 0.25, 0.14, 6));
  const collarMesh = new THREE.Mesh(collarGeo, trimMat);
  collarMesh.position.y = 1.27;
  collarMesh.castShadow = true;
  bodyPivot.add(collarMesh);
  addInkOutline(collarMesh, 0.68);

  const hearth = HEARTHS.find((h) => h.id === hearthId) || HEARTHS[5];
  const crestMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(hearth.crestColor),
      roughness: 0.32,
      metalness: 0.55,
      flatShading: true,
    })
  );
  const crestGeo = trackGeo(new THREE.OctahedronGeometry(0.09, 0));
  const crestMesh = new THREE.Mesh(crestGeo, crestMat);
  crestMesh.position.set(0, 1.06, 0.24);
  crestMesh.scale.set(0.9, 1.2, 0.45);
  bodyPivot.add(crestMesh);

  // 4. Back Draped Paper Cloak
  const capeShape = new THREE.Shape();
  capeShape.moveTo(-0.24, 0);
  capeShape.lineTo(0.24, 0);
  capeShape.lineTo(0.36, -0.78);
  capeShape.lineTo(0, -0.88);
  capeShape.lineTo(-0.36, -0.78);
  capeShape.closePath();
  const cloakGeo = trackGeo(
    new THREE.ExtrudeGeometry(capeShape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 })
  );
  const cloakMesh = new THREE.Mesh(cloakGeo, cloakMat);
  cloakMesh.position.set(0, 1.24, -0.2);
  cloakMesh.rotation.x = 0.14;
  cloakMesh.castShadow = true;
  bodyPivot.add(cloakMesh);
  addInkOutline(cloakMesh, 0.5);

  // 5. Head & Paper Mask/Face + Hat
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.48, 0);
  bodyPivot.add(headGroup);

  const headGeo = trackGeo(new THREE.DodecahedronGeometry(0.21, 0));
  const headMesh = new THREE.Mesh(headGeo, paperMat);
  headMesh.castShadow = true;
  headGroup.add(headMesh);
  addInkOutline(headMesh, 0.72);

  // Charcoal ink eyes
  const eyeGeo = trackGeo(new THREE.BoxGeometry(0.045, 0.035, 0.02));
  const eyeMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1c1814, roughness: 0.7 }));
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.07, 0.02, 0.185);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(0.07, 0.02, 0.185);
  headGroup.add(leftEye, rightEye);

  // Hat variations
  const hatContainer = new THREE.Group();
  headGroup.add(hatContainer);

  const buildHat = (hatStyle: PaperAppearance['hatStyle']) => {
    while (hatContainer.children.length > 0) {
      const c = hatContainer.children[0] as THREE.Mesh;
      hatContainer.remove(c);
    }
    if (hatStyle === 'crown') {
      const crownGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.19, 0.18, 6, 1, true));
      const crown = new THREE.Mesh(crownGeo, trimMat);
      crown.position.y = 0.17;
      hatContainer.add(crown);
    } else if (hatStyle === 'tricorn') {
      const brimGeo = trackGeo(new THREE.CylinderGeometry(0.36, 0.38, 0.04, 3));
      const brim = new THREE.Mesh(brimGeo, cloakMat);
      brim.position.y = 0.14;
      const topGeo = trackGeo(new THREE.ConeGeometry(0.18, 0.24, 4));
      const top = new THREE.Mesh(topGeo, cloakMat);
      top.position.y = 0.25;
      hatContainer.add(brim, top);
    } else if (hatStyle === 'cap') {
      const capGeo = trackGeo(new THREE.ConeGeometry(0.25, 0.34, 5));
      const cap = new THREE.Mesh(capGeo, cloakMat);
      cap.position.set(0, 0.24, -0.02);
      cap.rotation.x = -0.15;
      hatContainer.add(cap);
    } else {
      // Folded origami hood
      const hoodGeo = trackGeo(new THREE.ConeGeometry(0.29, 0.42, 6));
      const hood = new THREE.Mesh(hoodGeo, cloakMat);
      hood.position.set(0, 0.16, -0.04);
      hood.rotation.x = -0.24;
      hatContainer.add(hood);
    }
  };
  buildHat(appearance.hatStyle);

  // 6. Articulated Arms
  const makeArm = (side: -1 | 1) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.31, 1.2, 0);
    const sleeveGeo = trackGeo(new THREE.CylinderGeometry(0.085, 0.07, 0.36, 5));
    const sleeve = new THREE.Mesh(sleeveGeo, cloakMat);
    sleeve.position.y = -0.18;
    sleeve.castShadow = true;
    const handGeo = trackGeo(new THREE.DodecahedronGeometry(0.068, 0));
    const hand = new THREE.Mesh(handGeo, paperMat);
    hand.position.y = -0.39;
    pivot.add(sleeve, hand);
    bodyPivot.add(pivot);
    return pivot;
  };
  const leftArmPivot = makeArm(-1);
  const rightArmPivot = makeArm(1);

  // 7. Weapon Rig mounted on Right Hand
  const weaponGroup = new THREE.Group();
  weaponGroup.position.set(0, -0.4, 0.08);
  rightArmPivot.add(weaponGroup);

  const bladeMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xcad0d6, roughness: 0.25, metalness: 0.78, flatShading: true }));
  const woodMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x5c432d, roughness: 0.85, flatShading: true }));

  const daggerMesh = new THREE.Group();
  const blade = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.038, 0.36, 4)), bladeMat);
  blade.rotation.x = Math.PI / 2;
  blade.position.z = 0.22;
  const guard = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 0.025, 0.03)), trimMat);
  guard.position.z = 0.05;
  const hilt = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.022, 0.024, 0.12, 5)), woodMat);
  hilt.rotation.x = Math.PI / 2;
  daggerMesh.add(blade, guard, hilt);
  weaponGroup.add(daggerMesh);

  const bowMesh = new THREE.Group();
  const bowArc = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.36, 0.022, 5, 12, Math.PI)), woodMat);
  bowArc.rotation.z = -Math.PI / 2;
  bowArc.position.z = 0.08;
  bowMesh.add(bowArc);
  bowMesh.visible = false;
  weaponGroup.add(bowMesh);

  const pistolMesh = new THREE.Group();
  const barrel = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.024, 0.028, 0.32, 6)), bladeMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.04, 0.16);
  const grip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.04, 0.13, 0.05)), woodMat);
  grip.rotation.x = 0.3;
  pistolMesh.add(barrel, grip);
  pistolMesh.visible = false;
  weaponGroup.add(pistolMesh);

  // 8. Articulated Legs
  const makeLeg = (side: -1 | 1) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.12, 0.52, 0);
    const legGeo = trackGeo(new THREE.CylinderGeometry(0.078, 0.062, 0.38, 5));
    const leg = new THREE.Mesh(legGeo, paperMat);
    leg.position.y = -0.19;
    leg.castShadow = true;
    const bootGeo = trackGeo(new THREE.BoxGeometry(0.13, 0.12, 0.2));
    const boot = new THREE.Mesh(bootGeo, bootMat);
    boot.position.set(0, -0.44, 0.03);
    boot.castShadow = true;
    pivot.add(leg, boot);
    bodyPivot.add(pivot);
    return pivot;
  };
  const leftLegPivot = makeLeg(-1);
  const rightLegPivot = makeLeg(1);

  // 9. Optional floating nameplate
  let nameSprite: THREE.Sprite | null = null;
  let labelTex: THREE.CanvasTexture | null = null;
  if (showNameplate && playerName) {
    labelTex = makeLabelTexture(playerName, false);
    const spriteMat = trackMat(new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthTest: true }));
    nameSprite = new THREE.Sprite(spriteMat);
    nameSprite.position.set(0, 2.15, 0);
    nameSprite.scale.set(1.65, 0.42, 1);
    root.add(nameSprite);
  }

  const rig: PaperCharacterRig = {
    root,
    bodyPivot,
    headGroup,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    cloakMesh,
    weaponGroup,
    daggerMesh,
    bowMesh,
    pistolMesh,
    contactShadow,
    nameSprite,
    materials,
    walkPhase: 0,
    flashTimer: 0,
    squashY: 1,
    prevAnim: 'idle',
    setAppearance(app: PaperAppearance, nextHearthId: string) {
      paperMat.color.set(app.paperTone);
      cloakMat.color.set(app.cloakColor);
      trimMat.color.set(app.trimColor);
      const h = HEARTHS.find((x) => x.id === nextHearthId) || HEARTHS[5];
      crestMat.color.set(h.crestColor);
      buildHat(app.hatStyle);
    },
    setEquippedWeapon(weaponId: string) {
      daggerMesh.visible = weaponId === 'dagger';
      bowMesh.visible = weaponId === 'longbow';
      pistolMesh.visible = weaponId === 'flintlock';
    },
    setNameLabel(name: string, isAlly: boolean) {
      if (!nameSprite) return;
      if (labelTex) labelTex.dispose();
      labelTex = makeLabelTexture(name, isAlly);
      (nameSprite.material as THREE.SpriteMaterial).map = labelTex;
      (nameSprite.material as THREE.SpriteMaterial).needsUpdate = true;
    },
    triggerFlash() {
      rig.flashTimer = 0.14;
    },
    updateAnimation(dt: number, animState: PlayerAnimState, horizSpeed: number, ceremonyDaggerDrawn = false) {
      const k = 1 - Math.exp(-14 * dt);

      // Squash-and-stretch on jump/land transitions
      if (animState === 'jumping' && rig.prevAnim !== 'jumping') rig.squashY = 1.16;
      if (animState === 'landing' && rig.prevAnim !== 'landing') rig.squashY = 0.82;
      rig.prevAnim = animState;
      rig.squashY = THREE.MathUtils.lerp(rig.squashY, 1, 1 - Math.exp(-10 * dt));
      const xzSquash = 1 / Math.sqrt(rig.squashY);
      bodyPivot.scale.set(xzSquash, rig.squashY, xzSquash);

      // Hit flash emissive feedback
      if (rig.flashTimer > 0) {
        rig.flashTimer = Math.max(0, rig.flashTimer - dt);
        _tmpColor.setHex(0x882211);
        paperMat.emissive.copy(_tmpColor);
        cloakMat.emissive.copy(_tmpColor);
      } else {
        paperMat.emissive.setHex(0x000000);
        cloakMat.emissive.setHex(0x000000);
      }

      // Distance-synced stride cycle (zero skating)
      if (horizSpeed > 0.2) {
        rig.walkPhase += horizSpeed * dt * 2.55;
      }

      let targetBodyY = 0;
      let targetBodyRotX = 0;
      let targetBodyRotZ = 0;
      let targetLArmX = 0;
      let targetRArmX = 0;
      let targetLArmZ = 0.08;
      let targetRArmZ = -0.08;
      let targetLLegX = 0;
      let targetRLegX = 0;
      let targetCloakX = 0.14;

      if (animState === 'death') {
        targetBodyY = -0.35;
        targetBodyRotX = -Math.PI / 2;
        targetLArmZ = 0.7;
        targetRArmZ = -0.7;
        contactShadow.material.opacity = 0.15;
      } else {
        contactShadow.material.opacity = 0.42;
        if (ceremonyDaggerDrawn || animState === 'victory') {
          targetRArmX = -2.4;
          targetRArmZ = -0.25;
          targetLArmX = -0.3;
        } else if (animState === 'attacking') {
          targetRArmX = -1.65;
          targetRArmZ = 0.3;
          targetBodyRotX = 0.18;
        } else if (animState === 'blocking') {
          targetRArmX = -1.15;
          targetRArmZ = 0.65;
          targetLArmX = -0.9;
          targetLArmZ = -0.45;
          targetBodyY = -0.06;
        } else if (animState === 'collecting' || animState === 'interacting') {
          targetBodyY = -0.22;
          targetBodyRotX = 0.45;
          targetRArmX = -0.9;
          targetLArmX = -0.9;
        } else if (animState === 'jumping' || animState === 'falling') {
          targetLArmX = -0.7;
          targetRArmX = -0.7;
          targetLArmZ = 0.55;
          targetRArmZ = -0.55;
          targetLLegX = 0.35;
          targetRLegX = -0.25;
          targetCloakX = 0.45;
        } else if (animState === 'crouching') {
          targetBodyY = -0.26;
          targetBodyRotX = 0.22;
          targetLLegX = -0.45;
          targetRLegX = 0.45;
        } else if (horizSpeed > 0.25) {
          const swingAmp = animState === 'sprinting' ? 0.92 : animState === 'running' ? 0.72 : 0.52;
          const s = Math.sin(rig.walkPhase);
          targetLLegX = s * swingAmp;
          targetRLegX = -s * swingAmp;
          targetLArmX = -s * swingAmp * 0.85;
          targetRArmX = s * swingAmp * 0.85;
          targetBodyY = Math.abs(Math.cos(rig.walkPhase)) * 0.055;
          targetBodyRotX = animState === 'sprinting' ? 0.22 : 0.09;
          targetCloakX = 0.2 + Math.min(0.45, horizSpeed * 0.045) + Math.abs(s) * 0.08;
        } else {
          // Idle subtle breathing
          const t = performance.now() * 0.0022;
          targetBodyY = Math.sin(t) * 0.015;
          targetLArmZ = 0.1 + Math.sin(t) * 0.03;
          targetRArmZ = -0.1 - Math.sin(t) * 0.03;
        }

        if (animState === 'damage') {
          targetBodyRotZ = 0.28;
        }
      }

      bodyPivot.position.y = THREE.MathUtils.lerp(bodyPivot.position.y, targetBodyY, k);
      bodyPivot.rotation.x = THREE.MathUtils.lerp(bodyPivot.rotation.x, targetBodyRotX, k);
      bodyPivot.rotation.z = THREE.MathUtils.lerp(bodyPivot.rotation.z, targetBodyRotZ, k);
      leftArmPivot.rotation.x = THREE.MathUtils.lerp(leftArmPivot.rotation.x, targetLArmX, k);
      rightArmPivot.rotation.x = THREE.MathUtils.lerp(rightArmPivot.rotation.x, targetRArmX, k);
      leftArmPivot.rotation.z = THREE.MathUtils.lerp(leftArmPivot.rotation.z, targetLArmZ, k);
      rightArmPivot.rotation.z = THREE.MathUtils.lerp(rightArmPivot.rotation.z, targetRArmZ, k);
      leftLegPivot.rotation.x = THREE.MathUtils.lerp(leftLegPivot.rotation.x, targetLLegX, k);
      rightLegPivot.rotation.x = THREE.MathUtils.lerp(rightLegPivot.rotation.x, targetRLegX, k);
      cloakMesh.rotation.x = THREE.MathUtils.lerp(cloakMesh.rotation.x, targetCloakX, k);
    },
    dispose() {
      if (labelTex) labelTex.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };

  return rig;
}
