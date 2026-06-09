// Inspect raw animation tracks in the GLB (no three/draco — animation accessors
// are NOT draco-compressed, so we can read them straight from the BIN chunk).
// Prints, per requested clip, each bone-rotation channel's MAX angle away from
// its first keyframe — i.e. how much the bone actually turns in the exported asset.
//   node dev/_glbtracks.mjs [clip ...]
import { readFileSync } from "fs";

const GLB = "public/character_v2.glb";
const WANT = process.argv.slice(2).length ? process.argv.slice(2) : ["wave", "jump", "adore", "happy", "attack"];
const FOCUS = ["ArmL", "ArmR"]; // bones we care about most (the unlock)

const buf = readFileSync(GLB);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB");
let off = 12, json = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(data.toString("utf8"));
  else if (type === 0x004e4942) bin = data;
  off += 8 + len;
}
const { nodes, accessors, bufferViews, animations } = json;

const CT = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array };
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function readAccessor(i) {
  const a = accessors[i], bv = bufferViews[a.bufferView];
  const TA = CT[a.componentType], comps = NUM[a.type];
  const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
  return new TA(bin.buffer, bin.byteOffset + start, a.count * comps);
}
const quatAngle = (q, i) => 2 * Math.acos(Math.min(1, Math.abs(q[i + 3]))); // |w| -> angle
function angleBetween(q, i, j) {
  let d = q[i]*q[j] + q[i+1]*q[j+1] + q[i+2]*q[j+2] + q[i+3]*q[j+3];
  return 2 * Math.acos(Math.min(1, Math.abs(d)));
}
const deg = (r) => (r * 180 / Math.PI).toFixed(1);

for (const clipName of WANT) {
  const anim = animations.find((a) => a.name === clipName);
  if (!anim) { console.log(`\n## ${clipName}: NOT IN GLB`); continue; }
  console.log(`\n## ${clipName}`);
  const paths = { translation: 0, rotation: 0, scale: 0 };
  const rows = [];
  for (const ch of anim.channels) {
    const node = nodes[ch.target.node];
    const path = ch.target.path;
    paths[path] = (paths[path] || 0) + 1;
    if (path !== "rotation") continue;
    const out = readAccessor(anim.samplers[ch.sampler].output);
    let maxFromFirst = 0, maxAbs = 0;
    for (let k = 0; k < out.length; k += 4) {
      maxFromFirst = Math.max(maxFromFirst, angleBetween(out, 0, k));
      maxAbs = Math.max(maxAbs, quatAngle(out, k));
    }
    rows.push({ bone: node?.name || `node${ch.target.node}`, fromFirst: maxFromFirst, abs: maxAbs });
  }
  console.log(`   channels: translation=${paths.translation} rotation=${paths.rotation} scale=${paths.scale}`);
  rows.sort((a, b) => b.fromFirst - a.fromFirst);
  for (const r of rows) {
    const star = FOCUS.includes(r.bone) ? " <-- ARM" : "";
    console.log(`   ${r.bone.padEnd(8)} turns ${deg(r.fromFirst).padStart(6)}° from rest  (abs ${deg(r.abs)}°)${star}`);
  }
}
