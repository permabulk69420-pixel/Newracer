import * as THREE from 'three';

// Everything visible here is generated at load time. There are no downloaded
// meshes, texture atlases or per-frame terrain updates.
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = THREE.MathUtils.lerp;
let seed = 917263;
const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
const hash = (x, z) => { let n = Math.imul(x, 374761393) + Math.imul(z, 668265263); n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967296; };
function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return mix(mix(hash(ix, iz), hash(ix + 1, iz), u), mix(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v);
}
const points = [
  [44, 42, 334], [209, 55, 277], [336, 68, 138], [352, 66, -36],
  [287, 77, -208], [139, 87, -318], [-39, 80, -360], [-218, 62, -300],
  [-347, 53, -165], [-378, 60, 16], [-304, 72, 196], [-166, 54, 306]
].map(p => new THREE.Vector3(...p));
export const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.48);
const N = 960;
export const routeLength = curve.getLength();
export const route = Array.from({ length: N }, (_, i) => {
  const t = i / N, p = curve.getPointAt(t), tangent = curve.getTangentAt(t).normalize();
  const side = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
  return { t, p, tangent, side, distance: t * routeLength };
});
const cell = 44, roadCells = new Map();
const cellKey = (a, b) => `${a},${b}`;
for (const s of route) {
  const k = cellKey(Math.floor(s.p.x / cell), Math.floor(s.p.z / cell));
  if (!roadCells.has(k)) roadCells.set(k, []);
  roadCells.get(k).push(s);
}
export function nearestRoad(x, z) {
  const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
  let sq = Infinity, closest = null;
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    const entries = roadCells.get(cellKey(cx + dx, cz + dz));
    if (!entries) continue;
    for (const s of entries) {
      const d = (s.p.x - x) ** 2 + (s.p.z - z) ** 2;
      if (d < sq) { sq = d; closest = s; }
    }
  }
  return { distance: Math.sqrt(sq), sample: closest };
}
function coastRadius(x, z) {
  const a = Math.atan2(z, x);
  return 474 + 22 * Math.sin(5 * a + .6) + 13 * Math.sin(9 * a - 1.8) + 8 * Math.sin(17 * a);
}
function rawHeight(x, z) {
  const radius = Math.hypot(x * .985, z * 1.025), inland = coastRadius(x, z) - radius;
  const massif = 91 * Math.exp(-((x + 33) ** 2 / 44000 + (z - 30) ** 2 / 70000));
  const ribs = (noise(x * .009, z * .009) - .5) * 24 + (noise(x * .025, z * .025) - .5) * 8;
  const cliff = -12 + Math.max(inland + 4, 0) * .55 + massif * smooth(-25, 125, inland);
  return inland < -5 ? -13 : cliff + ribs * smooth(0, 65, inland);
}
export function groundHeight(x, z) {
  const base = rawHeight(x, z);
  const near = nearestRoad(x, z);
  if (!near.sample || near.distance > 58) return base;
  const roadbed = near.sample.p.y - .48;
  return mix(roadbed, base, smooth(12, 58, near.distance));
}
const color = hex => new THREE.Color(hex);
const dune = color('#c8a978'), chalk = color('#ead0a0'), ochre = color('#a87755');
const rock = color('#9b6e56'), dark = color('#68594c'), green = color('#81856c');
const reusableColor = new THREE.Color();
function terrainColor(x, z, y, steep) {
  const inland = coastRadius(x, z) - Math.hypot(x * .985, z * 1.025);
  const strata = Math.sin(y * .19 + noise(x * .012, z * .012) * 5) * .5 + .5;
  const grain = noise(x * .045, z * .045), broad = noise(x * .007, z * .007);
  reusableColor.copy(dune).lerp(chalk, smooth(.49, .86, grain) * .43);
  reusableColor.lerp(ochre, smooth(.38, .77, broad) * .36);
  reusableColor.lerp(rock, smooth(.22, .76, steep) * (.42 + strata * .31));
  reusableColor.lerp(dark, smooth(110, 260, y) * .32 + smooth(.67, .95, steep) * .13);
  reusableColor.lerp(green, smooth(45, 70, inland) * (1 - smooth(120, 185, y)) * smooth(.64, .84, grain) * .27);
  reusableColor.lerp(chalk, (1 - smooth(0, 32, inland)) * .27);
  return reusableColor;
}
function texture(type) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(512, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const k = (y * 512 + x) * 4;
    const v = hash(x, y), v2 = noise(x / 14, y / 14), v3 = noise(x / 58, y / 58);
    if (type === 'asphalt') {
      const grit = 33 + v * 30 + v2 * 13 + v3 * 5;
      pixels.data[k] = grit * .93; pixels.data[k + 1] = grit * .96; pixels.data[k + 2] = grit;
      if (v > .987) pixels.data[k] = pixels.data[k + 1] = pixels.data[k + 2] = 113;
    } else {
      const grain = 189 + v * 38 + (v2 - .5) * 35 + (v3 - .5) * 21;
      pixels.data[k] = grain; pixels.data[k + 1] = grain * .985; pixels.data[k + 2] = grain * .96;
    }
    pixels.data[k + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4; return t;
}
function terrain(scene, detail) {
  const mat = new THREE.MeshStandardMaterial({ map: texture('sand'), vertexColors: true, roughness: 1, metalness: 0 });
  const chunks = detail ? 5 : 4, resolution = detail ? 52 : 42, size = 1170 / chunks;
  for (let cz = 0; cz < chunks; cz++) for (let cx = 0; cx < chunks; cx++) {
    const pos = [], cols = [], uvs = [], ids = [], heights = [];
    for (let j = 0; j <= resolution; j++) for (let i = 0; i <= resolution; i++) {
      const x = -585 + (cx + i / resolution) * size, z = -585 + (cz + j / resolution) * size;
      const y = groundHeight(x, z); heights.push(y); pos.push(x, y, z);
      uvs.push(x / 26, z / 26);
    }
    for (let j = 0; j <= resolution; j++) for (let i = 0; i <= resolution; i++) {
      const a = heights[j * (resolution + 1) + Math.max(i - 1, 0)], b = heights[j * (resolution + 1) + Math.min(i + 1, resolution)];
      const c = heights[Math.max(j - 1, 0) * (resolution + 1) + i], d = heights[Math.min(j + 1, resolution) * (resolution + 1) + i];
      const steep = Math.hypot((a - b) / (2 * size / resolution), (c - d) / (2 * size / resolution));
      const ix = j * (resolution + 1) + i;
      const col = terrainColor(pos[ix * 3], pos[ix * 3 + 2], heights[ix], steep);
      cols.push(col.r, col.g, col.b);
      if (i < resolution && j < resolution) {
        const v = ix; ids.push(v, v + resolution + 1, v + 1, v + 1, v + resolution + 1, v + resolution + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setIndex(ids); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = true; scene.add(mesh);
  }
}
function makeRibbon(offsets, vertical, uvScale, material, scene, colorFn = null) {
  const vertices = [], colors = [], uvs = [], indices = [];
  const width = offsets.length;
  for (let i = 0; i <= N; i++) {
    const s = route[i % N];
    for (let j = 0; j < width; j++) {
      const v = s.p.clone().addScaledVector(s.side, offsets[j]);
      v.y += typeof vertical === 'function' ? vertical(i, j) : vertical;
      vertices.push(v.x, v.y, v.z); uvs.push(j / (width - 1), s.distance / uvScale);
      if (colorFn) { const c = colorFn(i, j); colors.push(c.r, c.g, c.b); }
      if (i < N && j < width - 1) {
        const a = i * width + j;
        indices.push(a, a + width, a + 1, a + 1, a + width, a + width + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (colorFn) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material); scene.add(mesh); return mesh;
}
function road(scene) {
  const shoulderMat = new THREE.MeshStandardMaterial({ color: '#9f8c70', map: texture('sand'), roughness: 1, side: THREE.DoubleSide });
  makeRibbon([-7.4, -5.85], -.005, 16, shoulderMat, scene);
  makeRibbon([5.85, 7.4], -.005, 16, shoulderMat, scene);
  const asphalt = new THREE.MeshStandardMaterial({ map: texture('asphalt'), color: '#e2e5e3', roughness: .95, side: THREE.DoubleSide });
  makeRibbon([-5.85, 0, 5.85], (i, j) => j === 1 ? .1 : .015, 9, asphalt, scene);
  const edge = new THREE.MeshBasicMaterial({ color: '#e5e3d1', side: THREE.DoubleSide });
  makeRibbon([-5.38, -5.24], .057, 40, edge, scene);
  makeRibbon([5.24, 5.38], .057, 40, edge, scene);
  const lineMat = new THREE.MeshBasicMaterial({ color: '#e6c779', side: THREE.DoubleSide });
  // Broken centre marking: one BufferGeometry keeps all the dashes in one draw call.
  const pos = [], ids = [];
  for (let i = 0; i < N; i += 6) {
    const j = i + 3;
    for (const k of [i, j]) for (const side of [-.095, .095]) {
      const s = route[k % N], p = s.p.clone().addScaledVector(s.side, side);
      pos.push(p.x, p.y + .13, p.z);
    }
    const b = pos.length / 3 - 4; ids.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(ids); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, lineMat));
}
function guardrail(scene) {
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(.13, 1.1, .16), new THREE.MeshStandardMaterial({ color: '#8a9696', metalness: .65, roughness: .43 }), Math.ceil(N / 4));
  const reflector = new THREE.InstancedMesh(new THREE.BoxGeometry(.17, .1, .025), new THREE.MeshBasicMaterial({ color: '#fff5cc' }), Math.ceil(N / 4));
  const beamPos = [], beamCol = [], beamIds = [], dummy = new THREE.Object3D(); let count = 0;
  const silver = color('#a9b6b3'), pale = color('#d3d7cc'), shadow = color('#717c7b');
  for (let i = 0; i <= N; i++) {
    const s = route[i % N];
    const sign = Math.sign(s.side.x * s.p.x + s.side.z * s.p.z) || 1;
    const p = s.p.clone().addScaledVector(s.side, sign * 7.72);
    // The folded steel profile catches light without transparent or shadow passes.
    const cross = [[.52, 0], [.79, -.055], [.99, .01], [1.15, -.045], [1.27, 0]];
    for (let j = 0; j < cross.length; j++) {
      const q = p.clone().addScaledVector(s.side, sign * cross[j][1]);
      beamPos.push(q.x, q.y + cross[j][0], q.z);
      const c = j === 1 || j === 3 ? shadow : j === 2 ? pale : silver;
      beamCol.push(c.r, c.g, c.b);
      if (i < N && j < cross.length - 1) {
        const k = i * cross.length + j;
        beamIds.push(k, k + cross.length, k + 1, k + 1, k + cross.length, k + cross.length + 1);
      }
    }
    if (i < N && i % 4 === 0) {
      dummy.position.set(p.x, p.y + .48, p.z);
      dummy.rotation.set(0, -Math.atan2(s.tangent.z, s.tangent.x), 0);
      dummy.scale.set(1, 1, 1); dummy.updateMatrix(); posts.setMatrixAt(count, dummy.matrix);
      dummy.position.y = p.y + .86;
      dummy.position.addScaledVector(s.side, sign * .075); dummy.updateMatrix(); reflector.setMatrixAt(count, dummy.matrix);
      count++;
    }
  }
  posts.count = reflector.count = count; posts.instanceMatrix.needsUpdate = reflector.instanceMatrix.needsUpdate = true;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(beamPos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(beamCol, 3)); g.setIndex(beamIds); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: .58, roughness: .44, side: THREE.DoubleSide })), posts, reflector);
}
function rockGeometry(subdivisions) {
  const geo = new THREE.IcosahedronGeometry(1, subdivisions).toNonIndexed();
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const modifier = 1 + .12 * noise(x * 9 + 11, z * 9 - y * 7);
    p.setXYZ(i, x * modifier, (y * .75 + .04) * modifier, z * modifier);
  }
  geo.computeVertexNormals(); return geo;
}
function shrubsGeometry() {
  const p = [], ids = [];
  for (let n = 0; n < 8; n++) {
    const a = n * TAU / 8, r = .45 + ((n * 31) % 7) * .065;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const b = p.length / 3;
    p.push(0, .12, 0, x * .65, .46 + (n % 3) * .12, z * .65,
      x * .8 - z * .15, .22, z * .8 + x * .15, x * 1.65, .04, z * 1.65);
    ids.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    ids.push(b + 1, b + 2, b, b + 3, b + 2, b + 1);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(ids); g.computeVertexNormals(); return g;
}
function scatter(scene, detail) {
  const dummy = new THREE.Object3D();
  const categories = [
    { limit: detail ? 850 : 430, geo: rockGeometry(1), mat: new THREE.MeshStandardMaterial({ color: '#ded2b6', flatShading: true, roughness: 1 }), kind: 'rocks' },
    { limit: detail ? 2200 : 1100, geo: rockGeometry(0), mat: new THREE.MeshStandardMaterial({ color: '#c5aa89', flatShading: true, roughness: 1 }), kind: 'stones' },
    { limit: detail ? 3200 : 1450, geo: shrubsGeometry(), mat: new THREE.MeshStandardMaterial({ color: '#aab38b', side: THREE.DoubleSide, roughness: 1 }), kind: 'shrubs' }
  ];
  for (const c of categories) {
    const mesh = new THREE.InstancedMesh(c.geo, c.mat, c.limit);
    let count = 0, attempts = 0;
    while (count < c.limit && attempts++ < c.limit * 11) {
      const x = (random() - .5) * 1040, z = (random() - .5) * 1040;
      const y = groundHeight(x, z), near = nearestRoad(x, z).distance;
      if (y < -3 || y > 194 || near < (c.kind === 'shrubs' ? 11 : 10.5)) continue;
      if (random() > (c.kind === 'shrubs' ? .84 : .75)) continue;
      let size;
      if (c.kind === 'rocks') size = .75 + random() ** 2 * 3.7;
      else if (c.kind === 'stones') size = .17 + random() ** 3 * 1.15;
      else size = .65 + random() * 2.4;
      dummy.position.set(x, y - (c.kind === 'shrubs' ? .07 : size * .2), z);
      dummy.rotation.set((random() - .5) * .15, random() * TAU, (random() - .5) * .16);
      dummy.scale.set(size * (.7 + random() * .8), size * (.58 + random() * .55), size * (.7 + random() * .7));
      dummy.updateMatrix(); mesh.setMatrixAt(count, dummy.matrix);
      const tint = new THREE.Color();
      if (c.kind === 'shrubs') tint.setHSL(.19 + random() * .07, .12 + random() * .12, .42 + random() * .22);
      else tint.setHSL(.055 + random() * .06, .15 + random() * .1, .38 + random() * .24);
      mesh.setColorAt(count, tint); count++;
    }
    mesh.count = count; mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.userData.fullCount = count;
    (scene.userData.scatter ||= []).push(mesh);
    scene.add(mesh);
  }
}
function shoreline(scene) {
  const white = new THREE.MeshBasicMaterial({ color: '#dcece2', transparent: true, opacity: .43, depthWrite: false, side: THREE.DoubleSide });
  const pos = [], ids = [];
  for (let i = 0; i < 450; i++) {
    const a = i / 450 * TAU, x = Math.cos(a), z = Math.sin(a), r = coastRadius(x * 450, z * 450) + 2;
    const w = 1.1 + noise(i * .07, 2) * 2.2;
    for (const radius of [r, r + w]) pos.push(x * radius, -8.88, z * radius);
    if (i < 449 && i % 13 !== 0 && random() > .09) { const b = i * 2; ids.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(ids);
  scene.add(new THREE.Mesh(g, white));
}
function distantIslands(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: '#607d7f', roughness: 1, flatShading: true });
  const islands = [[-1120, -620, 280, 108], [1200, -860, 335, 160], [-1780, 430, 400, 142], [650, 1510, 210, 92]];
  for (const [cx, cz, radius, height] of islands) {
    const p = [], ids = [], seg = 28;
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * TAU, jitter = .78 + .32 * hash(i, radius);
      const x = Math.cos(a), z = Math.sin(a);
      p.push(cx + x * radius * jitter, -13, cz + z * radius * jitter);
      p.push(cx + x * radius * .65 * jitter, -5 + height * (.18 + .14 * hash(i, 1)), cz + z * radius * .65 * jitter);
      p.push(cx + x * radius * .31 * jitter, -4 + height * (.73 + .25 * hash(i, 2)), cz + z * radius * .31 * jitter);
      if (i < seg) for (let row = 0; row < 2; row++) { const k = i * 3 + row; ids.push(k, k + 3, k + 1, k + 1, k + 3, k + 4); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(ids); g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, mat));
  }
}
function signs(scene) {
  const s = route[16], outer = Math.sign(s.side.x * s.p.x + s.side.z * s.p.z) || 1;
  const group = new THREE.Group();
  group.position.copy(s.p).addScaledVector(s.side, outer * 13);
  const poleMat = new THREE.MeshStandardMaterial({ color: '#798480', metalness: .4, roughness: .7 });
  for (const x of [-1.45, 1.45]) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(.11, 3.2, .1), poleMat);
    pole.position.set(x, 1.55, 0); group.add(pole);
  }
  const bg = new THREE.Mesh(new THREE.BoxGeometry(4.1, 1.25, .11), new THREE.MeshStandardMaterial({ color: '#123c42', roughness: .7 }));
  bg.position.y = 2.83; group.add(bg);
  const can = document.createElement('canvas'); can.width = 1024; can.height = 320;
  const ctx = can.getContext('2d'); ctx.fillStyle = '#163f43'; ctx.fillRect(0, 0, 1024, 320);
  ctx.strokeStyle = '#d6d9bc'; ctx.lineWidth = 8; ctx.strokeRect(23, 20, 978, 280);
  ctx.fillStyle = '#f2ecd7'; ctx.textAlign = 'center';
  ctx.font = '700 105px sans-serif'; ctx.fillText('AZURE PASS', 512, 147);
  ctx.font = '500 41px sans-serif'; ctx.fillText(`COAST ROAD    •    ${(routeLength / 1000).toFixed(1)} KM LOOP`, 512, 238);
  const map = new THREE.CanvasTexture(can); map.colorSpace = THREE.SRGBColorSpace;
  const faceMat = new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(4.04, 1.21), faceMat); face.position.set(0, 2.83, .066); group.add(face);
  group.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
  scene.add(group);
}
function skyAndSea(scene) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3400, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { sunDirection: { value: new THREE.Vector3(-.56, .37, -.76).normalize() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDirection;
      void main(){ vec3 d=normalize(vDir); float y=clamp(d.y,0.,1.);
        vec3 horizon=vec3(.81,.85,.81), mid=vec3(.38,.64,.76), zenith=vec3(.16,.42,.65);
        vec3 c=mix(horizon,mid,smoothstep(0.,.3,y)); c=mix(c,zenith,smoothstep(.14,.94,y));
        float toward=dot(d,sunDirection); c+=vec3(.96,.57,.28)*pow(max(toward,0.),18.)*.24;
        c+=vec3(1.,.89,.67)*pow(max(toward,0.),160.)*.24;
        c=mix(c,vec3(1.,.91,.69),smoothstep(.99967,.99991,toward));
        gl_FragColor=vec4(c,1.); }`
  })); sky.frustumCulled = false; scene.add(sky);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(6200, 6200), new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, sunDirection: { value: new THREE.Vector3(-.56, .37, -.76).normalize() } },
    vertexShader: `varying vec2 vWorld; varying vec3 vView;
      void main(){ vec4 world=modelMatrix*vec4(position,1.); vWorld=world.xz; vView=cameraPosition-world.xyz;
        gl_Position=projectionMatrix*viewMatrix*world; }`,
    fragmentShader: `uniform float time; uniform vec3 sunDirection; varying vec2 vWorld; varying vec3 vView;
      void main(){ vec2 p=vWorld; float r=length(p); float coast=475.+22.*sin(5.*atan(p.y,p.x)+.6)+13.*sin(9.*atan(p.y,p.x)-1.8);
        float shallows=1.-smoothstep(coast+5.,coast+195.,r);
        vec3 deep=vec3(.055,.285,.39), shallow=vec3(.10,.56,.57);
        vec3 c=mix(deep,shallow,shallows*.8);
        float a=sin(p.x*.085+p.y*.04+time*.61)*sin(p.y*.12-p.x*.05-time*.45);
        float b=sin(p.x*.24-p.y*.09+time*.94);
        vec3 n=normalize(vec3((a+b*.3)*.13, 1., (a-b*.35)*.13));
        float glint=pow(max(dot(reflect(-sunDirection,n),normalize(vView)),0.),95.);
        c+=vec3(.75,.78,.65)*glint*.72;
        c+=vec3(.036,.07,.061)*a;
        float fog=smoothstep(700.,2300.,length(vView.xz)); c=mix(c,vec3(.66,.77,.77),fog*.81);
        gl_FragColor=vec4(c,1.); }`
  }));
  water.rotation.x = -Math.PI / 2; water.position.y = -8.95; scene.add(water);
  return water.material.uniforms.time;
}
export function buildWorld(scene, detail = true) {
  scene.background = color('#cbd9d3');
  scene.fog = new THREE.FogExp2('#becfca', .00072);
  scene.add(new THREE.HemisphereLight('#e1eeed', '#9b755a', 2.15));
  const sun = new THREE.DirectionalLight('#fff0d6', 2.75); sun.position.set(-470, 420, -640); scene.add(sun);
  const time = skyAndSea(scene);
  terrain(scene, detail); road(scene); guardrail(scene); shoreline(scene); scatter(scene, detail); distantIslands(scene); signs(scene);
  return { time, routeLength, drawCalls: scene.children.length };
}
