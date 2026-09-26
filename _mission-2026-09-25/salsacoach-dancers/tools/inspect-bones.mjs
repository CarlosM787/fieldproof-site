// Lists the avatar skeletons' eye, toe, head and clavicle bones (dev aid).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const f of ['leader', 'follower']) {
  const doc = await io.read(new URL('../assets/' + f + '.glb', import.meta.url).pathname);
  const names = doc.getRoot().listNodes().map((n) => n.getName());
  console.log(f, names.length, names.filter((n) => /Eye|Toe|Head|Neck|Clav|Nub|Pony|Hair|Jaw|Brow|Lid/i.test(n)).join(', '));
  console.log(' meshes', doc.getRoot().listMeshes().map((m) => m.getName() + ':' + m.listPrimitives().map((p) => p.getMaterial()?.getName() + '/' + p.getAttribute('POSITION').getCount()).join('|')).join(' '));
}
