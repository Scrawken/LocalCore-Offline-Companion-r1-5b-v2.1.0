const assert = require('assert');
const {
  isTorsoSkinTarget,
  replaceSkinMaterials
} = require('../renderer/avatar-material-override.js');
const {
  findFaceDiffuseTexture,
  isFaceMaterialTarget,
  replaceFaceMaterials
} = require('../renderer/avatar-face-material-preview.js');

const skin = { name: 'Skin' };
const line = { name: 'Line' };
const body = { isMesh: true, name: 'BODY', material: [skin, line] };
const normalizedBodyName = { isMesh: true, name: 'BODY_0', material: skin };
const gltfMeshName = {
  isMesh: true,
  name: 'mesh_7',
  geometry: { name: 'Genshin_Size03_8.001_0' },
  material: skin
};
const bandage = { isMesh: true, name: 'Ankle_bandages', material: { name: 'Bondage' } };
const genericSkinMesh = { isMesh: true, name: 'mesh_1', material: skin };
assert.strictEqual(isTorsoSkinTarget(body), true);
assert.strictEqual(isTorsoSkinTarget(normalizedBodyName), true);
assert.strictEqual(isTorsoSkinTarget(gltfMeshName), true);
assert.strictEqual(isTorsoSkinTarget(bandage), false);
assert.strictEqual(isTorsoSkinTarget(genericSkinMesh), true);

const override = { name: 'preview' };
const replaced = replaceSkinMaterials(body, material => {
  assert.strictEqual(material, skin);
  return override;
});
assert.deepStrictEqual(replaced, [override, line]);
assert.strictEqual(replaceSkinMaterials(bandage, () => override), null);

const diffuseTexture = { name: 'embedded face diffuse' };
const faceMaterial = { name: 'face', map: { name: 'shadow mask' } };
const browMaterial = { name: 'brow', map: diffuseTexture };
const faceMesh = { isMesh: true, name: 'FACE', material: [faceMaterial, line] };
const browMesh = { isMesh: true, name: 'BROW', material: browMaterial };
assert.strictEqual(isFaceMaterialTarget(faceMesh), true);
assert.strictEqual(findFaceDiffuseTexture([faceMesh, browMesh]), diffuseTexture);
const faceScene = {
  traverse(callback) {
    callback(faceMesh);
    callback(browMesh);
  }
};
assert.strictEqual(findFaceDiffuseTexture(faceScene), diffuseTexture);
const facePreview = { name: 'preview face' };
assert.deepStrictEqual(
  replaceFaceMaterials(faceMesh, diffuseTexture, (source, texture) => {
    assert.strictEqual(source, faceMaterial);
    assert.strictEqual(texture, diffuseTexture);
    return facePreview;
  }),
  [facePreview, line]
);
assert.strictEqual(replaceFaceMaterials(browMesh, diffuseTexture, () => facePreview), null);
console.log('Avatar torso material override tests passed.');
