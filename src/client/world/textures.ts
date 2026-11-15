import * as THREE from 'three';

export interface ProceduralTextureSet {
  paperAlbedo: THREE.CanvasTexture;
  paperBump: THREE.CanvasTexture;
  terrainBump: THREE.CanvasTexture;
  helipadMap: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  // 1. Handmade paper fiber & crease texture
  const pCanvas = document.createElement('canvas');
  pCanvas.width = 256;
  pCanvas.height = 256;
  const pCtx = pCanvas.getContext('2d')!;
  pCtx.fillStyle = '#f6f1e7';
  pCtx.fillRect(0, 0, 256, 256);

  // Subtle paper fibers
  for (let i = 0; i < 650; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const len = 4 + Math.random() * 14;
    const ang = Math.random() * Math.PI * 2;
    pCtx.strokeStyle = i % 2 === 0 ? 'rgba(180,165,142,0.16)' : 'rgba(255,255,255,0.22)';
    pCtx.lineWidth = 0.8;
    pCtx.beginPath();
    pCtx.moveTo(x, y);
    pCtx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    pCtx.stroke();
  }
  // Origami fold creases
  pCtx.strokeStyle = 'rgba(130, 114, 92, 0.14)';
  pCtx.lineWidth = 1.5;
  pCtx.beginPath();
  pCtx.moveTo(0, 128);
  pCtx.lineTo(256, 128);
  pCtx.moveTo(128, 0);
  pCtx.lineTo(128, 256);
  pCtx.moveTo(0, 0);
  pCtx.lineTo(256, 256);
  pCtx.stroke();

  const paperAlbedo = new THREE.CanvasTexture(pCanvas);
  paperAlbedo.colorSpace = THREE.SRGBColorSpace;
  paperAlbedo.wrapS = THREE.RepeatWrapping;
  paperAlbedo.wrapT = THREE.RepeatWrapping;
  paperAlbedo.anisotropy = maxAnisotropy;

  // 2. Grayscale paper bump map (linear space)
  const bCanvas = document.createElement('canvas');
  bCanvas.width = 256;
  bCanvas.height = 256;
  const bCtx = bCanvas.getContext('2d')!;
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    bCtx.fillStyle = i % 2 === 0 ? 'rgba(210,210,210,0.18)' : 'rgba(50,50,50,0.18)';
    bCtx.fillRect(x, y, 2 + Math.random() * 6, 1.5);
  }
  const paperBump = new THREE.CanvasTexture(bCanvas);
  paperBump.wrapS = THREE.RepeatWrapping;
  paperBump.wrapT = THREE.RepeatWrapping;

  // 3. Terrain grain bump
  const tCanvas = document.createElement('canvas');
  tCanvas.width = 256;
  tCanvas.height = 256;
  const tCtx = tCanvas.getContext('2d')!;
  tCtx.fillStyle = '#7f7f7f';
  tCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 1 + Math.random() * 4;
    tCtx.fillStyle = i % 2 === 0 ? 'rgba(235,235,235,0.14)' : 'rgba(30,30,30,0.14)';
    tCtx.beginPath();
    tCtx.arc(x, y, r, 0, Math.PI * 2);
    tCtx.fill();
  }
  const terrainBump = new THREE.CanvasTexture(tCanvas);
  terrainBump.wrapS = THREE.RepeatWrapping;
  terrainBump.wrapT = THREE.RepeatWrapping;
  terrainBump.repeat.set(22, 22);

  // 4. Helipad painted deck texture
  const hCanvas = document.createElement('canvas');
  hCanvas.width = 512;
  hCanvas.height = 512;
  const hCtx = hCanvas.getContext('2d')!;
  hCtx.fillStyle = '#3c3934';
  hCtx.fillRect(0, 0, 512, 512);
  hCtx.strokeStyle = '#d4a853';
  hCtx.lineWidth = 18;
  hCtx.beginPath();
  hCtx.arc(256, 256, 210, 0, Math.PI * 2);
  hCtx.stroke();
  hCtx.setLineDash([28, 18]);
  hCtx.strokeStyle = '#d96b38';
  hCtx.lineWidth = 10;
  hCtx.beginPath();
  hCtx.arc(256, 256, 175, 0, Math.PI * 2);
  hCtx.stroke();
  hCtx.setLineDash([]);
  // Bold 'H'
  hCtx.fillStyle = '#f2ede4';
  hCtx.fillRect(172, 136, 36, 240);
  hCtx.fillRect(304, 136, 36, 240);
  hCtx.fillRect(172, 236, 168, 40);

  const helipadMap = new THREE.CanvasTexture(hCanvas);
  helipadMap.colorSpace = THREE.SRGBColorSpace;
  helipadMap.anisotropy = maxAnisotropy;

  return {
    paperAlbedo,
    paperBump,
    terrainBump,
    helipadMap,
    dispose: () => {
      paperAlbedo.dispose();
      paperBump.dispose();
      terrainBump.dispose();
      helipadMap.dispose();
    },
  };
}
