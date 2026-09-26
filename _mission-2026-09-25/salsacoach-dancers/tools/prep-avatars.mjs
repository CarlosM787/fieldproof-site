// Prepare the Rocketbox avatars (MIT) for the web: drop the broken FBX texture refs (textures are
// loaded as WebP tiers at runtime), drop vertex colours, then prune, quantize and meshopt-compress.
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, dedup, quantize, reorder } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const [src, dst] = process.argv.slice(2);
const doc = await io.read(src);
const root = doc.getRoot();
for (const t of root.listTextures()) t.dispose();
for (const m of root.listMaterials()) { m.setBaseColorFactor([1, 1, 1, 1]); m.setMetallicFactor(0); m.setRoughnessFactor(0.7); }
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) { const c = p.getAttribute('COLOR_0'); if (c) { p.setAttribute('COLOR_0', null); c.dispose(); } }
// Keep the three materials (body, head, hair cards) apart: they differ only by name once the
// textures are gone, and the page assigns each its own WebP maps by that name.
await doc.transform(dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }), prune({ keepAttributes: true }), reorder({ encoder: MeshoptEncoder }), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 }));
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(dst, doc);
console.log('wrote', dst);
