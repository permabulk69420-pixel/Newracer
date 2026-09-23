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
  const warp = (noise(x * .004, z * .004) - .5) * 74;
  const massif = 86 * Math.exp(-((x + 30) ** 2 / 56000 + (z - 30) ** 2 / 76000));
  const ridges = (noise((x + warp) * .009, z * .009) - .5) * 29
    + (noise(x * .026, (z - warp) * .026) - .5) * 11
    + (noise(x * .075, z * .075) - .5) * 3;
  const cliff = -12 + Math.max(inland + 4, 0) * .52 + massif * smooth(-25, 125, inland);
  return inland < -5 ? -13 : cliff + ridges * smooth(0, 65, inland);
}
export function groundHeight(x, z) {
  const base = rawHeight(x, z);
  const near = nearestRoad(x, z);
  if (!near.sample || near.distance > 125) return base;
  // The terrain triangles interpolate between vertices several metres apart.
  // This clearance keeps those triangles below the asphalt even at a crest.
  const roadbed = near.sample.p.y - .15;
  const outwardSign = Math.sign(near.sample.side.x * near.sample.p.x + near.sample.side.z * near.sample.p.z) || 1;
  const outward = ((x - near.sample.p.x) * near.sample.side.x + (z - near.sample.p.z) * near.sample.side.z) * outwardSign;
  // Lower the sea-facing slope after the shoulder. The first long view then
  // looks over a cliff to water instead of into a raised earthen berm.
  const hillside = outward > 0 ? Math.min(base, near.sample.p.y - Math.max(0, near.distance - 13) * .71) : base;
  return mix(roadbed, hillside, smooth(12, 68, near.distance));
}
const color = hex => new THREE.Color(hex);
const dune = color('#b5a087'), chalk = color('#d8c9a8'), ochre = color('#917866');
const rock = color('#847367'), dark = color('#554e4a'), green = color('#69765e');
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
  const erosion = noise(x * .016 + y * .028, z * .016) - noise(x * .053, z * .053) * .4;
  reusableColor.multiplyScalar(.83 + erosion * .24);
  return reusableColor;
}
const textureCache = new Map();
const photograph = { asphalt: 'asphalt', sand: 'dry-ground', rock: 'rock' };
const textureLoader = new THREE.TextureLoader();
function texture(type) {
  if (textureCache.has(type)) return textureCache.get(type);
  if (photograph[type]) {
    const t = textureLoader.load(`${import.meta.env.BASE_URL}assets/${photograph[type]}-color.jpg`);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    textureCache.set(type, t);
    return t;
  }
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(512, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const k = (y * 512 + x) * 4;
    const v = hash(x, y), v2 = noise(x / 14, y / 14), v3 = noise(x / 58, y / 58);
    if (type === 'asphalt') {
      const grit = 33 + v * 30 + v2 * 13 + v3 * 5;
      pixels.data[k] = grit * .93; pixels.data[k + 1] = grit * .96; pixels.data[k + 2] = grit;
      if (v > .987) pixels.data[k] = pixels.data[k + 1] = pixels.data[k + 2] = 113;
    } else if (type === 'rock') {
      const layer = Math.sin(y * .095 + noise(x / 48, y / 80) * 1.1) * .5 + .5;
      const broken = noise(x / 19, y / 23), weather = noise(x / 75, y / 80);
      const grain = 222 + (v - .5) * 22 + (v2 - .5) * 24 + (v3 - .5) * 17 - layer * 7 - (1 - broken) * weather * 10;
      pixels.data[k] = grain; pixels.data[k + 1] = grain * .985; pixels.data[k + 2] = grain * .96;
    } else if (type === 'normal') {
      const nx = (noise((x + 2) / 10, y / 10) - noise((x - 2) / 10, y / 10)) * .9;
      const ny = (noise(x / 10, (y + 2) / 10) - noise(x / 10, (y - 2) / 10)) * .9;
      pixels.data[k] = (nx * .5 + .5) * 255;
      pixels.data[k + 1] = (ny * .5 + .5) * 255;
      pixels.data[k + 2] = 245;
    } else {
      const grain = 189 + v * 38 + (v2 - .5) * 35 + (v3 - .5) * 21;
      pixels.data[k] = grain; pixels.data[k + 1] = grain * .985; pixels.data[k + 2] = grain * .96;
    }
    pixels.data[k + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  if (type !== 'normal') t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4; textureCache.set(type, t); return t;
}
function terrain(scene, detail) {
  const mat = new THREE.MeshStandardMaterial({ map: texture('sand'), normalMap: texture('normal'), normalScale: new THREE.Vector2(.26, .26), vertexColors: true, roughness: 1, metalness: 0 });
  const chunks = detail ? 5 : 4, resolution = detail ? 76 : 55, size = 1170 / chunks;
  for (let cz = 0; cz < chunks; cz++) for (let cx = 0; cx < chunks; cx++) {
    const pos = [], cols = [], uvs = [], ids = [], heights = [];
    for (let j = 0; j <= resolution; j++) for (let i = 0; i <= resolution; i++) {
      const x = -585 + (cx + i / resolution) * size, z = -585 + (cz + j / resolution) * size;
      const y = groundHeight(x, z); heights.push(y); pos.push(x, y, z);
      uvs.push(x / 6, z / 6);
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
  const shoulderMat = new THREE.MeshStandardMaterial({ color: '#a2937c', map: texture('sand'), roughness: 1, side: THREE.DoubleSide });
  makeRibbon([-8.5, -5.85], -.135, 4, shoulderMat, scene);
  makeRibbon([5.85, 8.5], -.135, 4, shoulderMat, scene);
  const asphalt = new THREE.MeshStandardMaterial({ map: texture('asphalt'), color: '#e2e5e3', roughness: .95, side: THREE.DoubleSide });
  // Road edge has thickness, so it meets the gravel shoulder instead of floating.
  makeRibbon([-5.85, -5.85, -5.4, 0, 5.4, 5.85, 5.85],
    (i, j) => [ -.14, .015, .043, .1, .043, .015, -.14 ][j], 9, asphalt, scene);
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
  const geo = new THREE.IcosahedronGeometry(1, subdivisions);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const fracture = noise(x * 3.7 + y * 1.9 + 11, z * 3.7 - y * 2.7) - .5;
    const grit = noise(x * 11 + z * 3, y * 8 - x * 2) - .5;
    const modifier = 1 + fracture * .29 + grit * .07;
    const bed = y < -.45 ? -.45 + (y + .45) * .23 : y;
    p.setXYZ(i, x * modifier, bed * .72 * modifier, z * modifier);
  }
  geo.computeVertexNormals(); return geo;
}
function shrubsGeometry() {
  const p = [], cols = [], ids = [];
  for (let n = 0; n < 16; n++) {
    const a = n * TAU / 16, r = .12 + .12 * hash(n, 8), length = .48 + hash(n, 13) * .54;
    const dx = Math.cos(a), dz = Math.sin(a), width = .036 + hash(n, 1) * .024;
    const x = dx * r, z = dz * r, b = p.length / 3;
    p.push(x - dz * width, .02, z + dx * width, x + dz * width, .02, z - dx * width,
      x + dx * length, length * (.52 + .17 * hash(n, 2)), z + dz * length);
    const base = color('#828372'), tip = color(n % 4 ? '#b7ad85' : '#8b9b75');
    for (const c of [base, base, tip]) cols.push(c.r, c.g, c.b);
    ids.push(b, b + 1, b + 2);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(ids); g.computeVertexNormals(); return g;
}
function scatter(scene, detail) {
  const dummy = new THREE.Object3D();
  const categories = [
    { limit: detail ? 850 : 430, geo: rockGeometry(2), mat: new THREE.MeshStandardMaterial({ color: '#b9ad9b', roughness: 1 }), kind: 'rocks' },
    { limit: detail ? 2200 : 1100, geo: rockGeometry(1), mat: new THREE.MeshStandardMaterial({ color: '#aa9e8c', roughness: 1 }), kind: 'stones' },
    { limit: detail ? 3900 : 1700, geo: shrubsGeometry(), mat: new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 }), kind: 'shrubs' }
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
      if (c.kind === 'shrubs') tint.setHSL(.15 + random() * .08, .18 + random() * .10, .72 + random() * .18);
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
function pineCrownGeometry() {
  const p = [], cols = [], ids = [], sides = 24;
  const rows = [[0, .12], [.12, .62], [.31, .93], [.51, 1], [.7, .83], [.87, .55], [1, .05]];
  for (let j = 0; j < rows.length; j++) for (let i = 0; i <= sides; i++) {
    const a = i / sides * TAU, lobe = 1 + .13 * Math.sin(a * 7 + .5 + j * .18) + .09 * Math.sin(a * 13 - j * .8);
    p.push(Math.cos(a) * rows[j][1] * lobe, rows[j][0] + .055 * Math.sin(a * 9 + j * 3), Math.sin(a) * rows[j][1] * lobe);
    const c = color('#b2c2a3').multiplyScalar(.67 + rows[j][0] * .39 + .07 * Math.sin(a * 7));
    cols.push(c.r, c.g, c.b);
    if (j < rows.length - 1 && i < sides) {
      const k = j * (sides + 1) + i;
      ids.push(k, k + sides + 1, k + 1, k + 1, k + sides + 1, k + sides + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(ids); g.computeVertexNormals(); return g;
}
function coastalPines(scene, detail) {
  const total = detail ? 265 : 125;
  const wood = new THREE.InstancedMesh(new THREE.CylinderGeometry(.14, .26, 1, 9), new THREE.MeshStandardMaterial({ color: '#776e5e', roughness: 1 }), total);
  const branch = new THREE.InstancedMesh(new THREE.CylinderGeometry(.045, .13, 1, 6), wood.material, total * 3);
  const foliage = new THREE.InstancedMesh(pineCrownGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 }), total * 3);
  const dummy = new THREE.Object3D(), axis = new THREE.Vector3(0, 1, 0);
  const from = new THREE.Vector3(), to = new THREE.Vector3(), direction = new THREE.Vector3();
  let count = 0, attempts = 0;
  while (count < total && attempts++ < total * 50) {
    const x = (random() - .5) * 940, z = (random() - .5) * 940;
    const y = groundHeight(x, z), near = nearestRoad(x, z);
    if (y < 16 || y > 154 || near.distance < 18 || near.distance > 205) continue;
    if (noise(x * .012, z * .012) < .44) continue;
    const h = 6 + random() * 6, span = 2.6 + random() * 2.4, angle = random() * TAU;
    dummy.rotation.set(0, angle, (random() - .5) * .065);
    dummy.position.set(x, y + h * .4, z);
    dummy.scale.set(1, h * .8, 1); dummy.updateMatrix(); wood.setMatrixAt(count, dummy.matrix);
    for (let k = 0; k < 3; k++) {
      const a = angle + k * TAU / 3 + .3, reach = span * (k === 0 ? .38 : .55);
      const cx = x + Math.cos(a) * reach, cz = z + Math.sin(a) * reach;
      const cy = y + h * (.55 + .05 * k);
      from.set(x, y + h * (.51 + .055 * k), z);
      to.set(cx, cy + .2, cz);
      direction.subVectors(to, from);
      dummy.position.copy(from).add(to).multiplyScalar(.5);
      dummy.quaternion.setFromUnitVectors(axis, direction.clone().normalize());
      dummy.scale.set(1, direction.length(), 1); dummy.updateMatrix(); branch.setMatrixAt(count * 3 + k, dummy.matrix);
      dummy.position.set(cx, cy, cz); dummy.quaternion.identity(); dummy.rotation.y = a;
      dummy.scale.set(span * (k === 0 ? 1 : .82), h * .46, span * (k === 0 ? .87 : .79));
      dummy.updateMatrix(); foliage.setMatrixAt(count * 3 + k, dummy.matrix);
      foliage.setColorAt(count * 3 + k, color('#8a9a81').multiplyScalar(.83 + random() * .25));
    }
    count++;
  }
  wood.count = count; branch.count = foliage.count = count * 3;
  for (const mesh of [wood, branch, foliage]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.fullCount = mesh.count; (scene.userData.scatter ||= []).push(mesh);
    scene.add(mesh);
  }
  foliage.instanceColor.needsUpdate = true;
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
  const mat = new THREE.MeshBasicMaterial({ color: '#779398', fog: false, side: THREE.DoubleSide });
  const islands = [[-1120, -620, 245, 74], [1200, -860, 270, 89], [-1780, 430, 330, 78], [650, 1510, 195, 62]];
  for (const [cx, cz, radius, height] of islands) {
    const p = [], ids = [], seg = 28;
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * TAU, jitter = .73 + .47 * hash(i, radius);
      const x = Math.cos(a), z = Math.sin(a);
      p.push(cx + x * radius * jitter, -13, cz + z * radius * jitter);
      p.push(cx + x * radius * .65 * jitter, -5 + height * (.08 + .21 * hash(i, 1)), cz + z * radius * .65 * jitter);
      p.push(cx + x * radius * .31 * jitter, -4 + height * (.25 + .69 * hash(i, 2)), cz + z * radius * .31 * jitter);
      if (i < seg) for (let row = 0; row < 2; row++) { const k = i * 3 + row; ids.push(k, k + 3, k + 1, k + 1, k + 3, k + 4); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(ids); g.computeVertexNormals();
    const island = new THREE.Mesh(g, mat); island.name = 'distant-island'; scene.add(island);
  }
}
function seaStacks(scene) {
  // Broad, layered headlands continue the island's geology into the water.
  // The earlier narrow towers read as fantasy pillars at road level.
  const mat = new THREE.MeshStandardMaterial({ map: texture('rock'), normalMap: texture('normal'), normalScale: new THREE.Vector2(.42, .42), vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  const entries = [
    [-1.56, 632, 128, 95, false], [-1.77, 707, 145, 86, false],
    [-2.00, 778, 162, 85, false], [-1.92, 616, 42, 35, false],
    [-1.37, 540, 31, 33, false], [-1.55, 582, 26, 24, false],
    [-.48, 544, 29, 32, false], [2.58, 538, 37, 38, false],
    [1.17, 556, 31, 31, false]
  ];
  for (const [angle, radius, height, width, onSlope] of entries) {
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    const y0 = onSlope ? Math.min(-9, groundHeight(x, z) - 11) : -12;
    const pos = [], cols = [], uvs = [], ids = [], sides = 64, rings = 36;
    const phase = radius * .19;
    for (let j = 0; j < rings; j++) {
      const h = j / (rings - 1);
      const taper = 1.16 - .35 * h + .045 * Math.sin(h * 31 + phase) - .08 * smooth(.82, 1, h);
      for (let i = 0; i <= sides; i++) {
        const a = i / sides * TAU;
        const longFissure = Math.sin(a * 5 + phase) * .085 + Math.sin(a * 11 + phase * 2) * .035;
        const crags = (noise(Math.cos(a) * 5 + phase, Math.sin(a) * 5 + h * 8) - .5) * .18;
        const jag = 1 + longFissure + crags + (noise(Math.cos(a) * 19 + phase, Math.sin(a) * 19 + h * 27) - .5) * .055;
        const brokenTop = smooth(.82, 1, h) * (noise(Math.cos(a) * 4 + phase, Math.sin(a) * 4) - .5) * height * .09;
        pos.push(x + Math.cos(a) * width * taper * jag, y0 + h * height + brokenTop, z + Math.sin(a) * width * taper * jag);
        const bed = Math.sin(h * height * .21 + Math.sin(a * 4 + phase) * .65);
        const stain = noise(Math.cos(a) * 7 + phase, Math.sin(a) * 7 + h * 11);
        const c = color('#827367').lerp(color('#cbbca3'), .23 + .26 * smooth(-.25, .55, bed) + stain * .12 + h * .08);
        c.multiplyScalar(.76 + .25 * smooth(.1, .8, stain));
        cols.push(c.r, c.g, c.b);
        uvs.push(i / sides * 32, h * height / 8);
        if (j < rings - 1 && i < sides) {
          const k = j * (sides + 1) + i;
          ids.push(k, k + sides + 1, k + 1, k + 1, k + sides + 1, k + sides + 2);
        }
      }
    }
    const top = pos.length / 3;
    pos.push(x, y0 + height - 3, z);
    const capColor = color('#a99a80'); cols.push(capColor.r, capColor.g, capColor.b); uvs.push(16, height / 8);
    for (let i = 0; i < sides; i++) {
      const k = (rings - 1) * (sides + 1) + i;
      ids.push(top, k + 1, k);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(ids); geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo, mat));
  }
}
function signs(scene) {
  const s = route[437], outer = Math.sign(s.side.x * s.p.x + s.side.z * s.p.z) || 1;
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
  const reverse = new THREE.Mesh(face.geometry, faceMat); reverse.position.set(0, 2.83, -.066); reverse.rotation.y = Math.PI; group.add(reverse);
  group.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
  scene.add(group);
}
function skyAndSea(scene) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2900, 96, 48), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false,
    uniforms: { sunDirection: { value: new THREE.Vector3(-.56, .37, -.76).normalize() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDirection;
      float hash2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash2(i),hash2(i+vec2(1.,0.)),f.x),mix(hash2(i+vec2(0.,1.)),hash2(i+1.),f.x),f.y); }
      void main(){ vec3 d=normalize(vDir); float y=clamp(d.y,0.,1.);
        vec3 horizon=vec3(.72,.79,.79), mid=vec3(.35,.58,.71), zenith=vec3(.12,.33,.55);
        vec3 c=mix(horizon,mid,smoothstep(0.,.24,y)); c=mix(c,zenith,smoothstep(.19,.9,y));
        float toward=max(dot(d,sunDirection),0.);
        c+=vec3(.86,.53,.30)*pow(toward,13.)*.19;
        c+=vec3(1.,.8,.56)*pow(toward,125.)*.13;
        vec2 q=d.xz/(d.y+.47)*4.3;
        float cloud=noise2(q)*.63+noise2(q*2.4+9.7)*.26+noise2(q*5.1)*.11;
        float coverage=smoothstep(.53,.72,cloud)*smoothstep(.065,.19,d.y)*(1.-smoothstep(.58,.85,d.y));
        c=mix(c,vec3(.88,.87,.79),coverage*(.51+.18*toward));
        c=mix(c,vec3(.99,.87,.64),smoothstep(.99968,.99989,toward));
        gl_FragColor=vec4(c,1.); }`
  }));
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  const cameraPosition = new THREE.Vector3();
  sky.onBeforeRender = (_renderer, _scene, camera) => {
    // XR eye cameras have their world matrices set by WebXRManager. Calling
    // getWorldPosition() here would overwrite that matrix from local pose.
    sky.position.copy(cameraPosition.setFromMatrixPosition(camera.matrixWorld));
    sky.updateMatrixWorld();
  };
  scene.add(sky);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(6200, 6200), new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, sunDirection: { value: new THREE.Vector3(-.56, .37, -.76).normalize() } },
    vertexShader: `varying vec2 vWorld; varying vec3 vView;
      void main(){ vec4 world=modelMatrix*vec4(position,1.); vWorld=world.xz; vView=cameraPosition-world.xyz;
        gl_Position=projectionMatrix*viewMatrix*world; }`,
    fragmentShader: `uniform float time; uniform vec3 sunDirection; varying vec2 vWorld; varying vec3 vView;
      void main(){ vec2 p=vWorld; float r=length(p); float coast=475.+22.*sin(5.*atan(p.y,p.x)+.6)+13.*sin(9.*atan(p.y,p.x)-1.8);
        float shallows=1.-smoothstep(coast+5.,coast+195.,r);
        vec3 deep=vec3(.043,.25,.32), shallow=vec3(.085,.43,.44);
        vec3 c=mix(deep,shallow,shallows*.85);
        float d=length(vView.xz), detail=1.-smoothstep(230.,780.,d);
        float a=sin(p.x*.067+p.y*.029+time*.43);
        float b=sin(p.x*.039-p.y*.087-time*.36);
        float w=sin(p.x*.16+p.y*.093+time*.71);
        vec3 n=normalize(vec3((a*.7+b*.35+w*.15)*.052*detail,1.,(b*.8-a*.2-w*.16)*.052*detail));
        float glint=pow(max(dot(reflect(-sunDirection,n),normalize(vView)),0.),54.);
        c+=vec3(.48,.55,.50)*glint*.21;
        c+=vec3(.009,.019,.018)*(a+b)*detail;
        float foam=(1.-smoothstep(4.,17.,abs(r-coast)))*detail;
        c=mix(c,vec3(.66,.78,.73),foam*.16);
        float fog=smoothstep(700.,2300.,d); c=mix(c,vec3(.63,.74,.75),fog*.81);
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
  terrain(scene, detail); road(scene); guardrail(scene); shoreline(scene); scatter(scene, detail); coastalPines(scene, detail); distantIslands(scene); seaStacks(scene); signs(scene);
  return { time, routeLength, drawCalls: scene.children.length };
}
