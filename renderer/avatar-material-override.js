(function exposeAvatarMaterialOverride(root) {
  function isTorsoSkinTarget(mesh) {
    if (!mesh?.isMesh) return false;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return materials.some(material => material?.name?.trim().toLowerCase() === 'skin');
  }

  function replaceSkinMaterials(mesh, createOverride) {
    const originalMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    let replaced = false;
    const materials = originalMaterials.map(material => {
      if (material?.name?.trim().toLowerCase() !== 'skin') return material;
      replaced = true;
      return createOverride(material);
    });
    if (!replaced) return null;
    return Array.isArray(mesh.material) ? materials : materials[0];
  }

  const api = { isTorsoSkinTarget, replaceSkinMaterials };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.localCoreAvatarMaterialOverride = api;
})(globalThis);
