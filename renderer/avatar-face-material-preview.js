(function exposeAvatarFaceMaterialPreview(root) {
  function getMaterials(mesh) {
    return Array.isArray(mesh?.material) ? mesh.material : [mesh?.material];
  }

  function isFaceMaterialTarget(mesh) {
    return Boolean(mesh?.isMesh && getMaterials(mesh).some(
      material => material?.name?.trim().toLowerCase() === 'face'
    ));
  }

  function findFaceDiffuseTexture(meshes) {
    let texture = null;
    const inspectMesh = mesh => {
      if (texture || !mesh?.isMesh) return;
      for (const material of getMaterials(mesh)) {
        if (material?.name?.trim().toLowerCase() === 'brow' && material.map) {
          texture = material.map;
          return;
        }
      }
    };
    if (Array.isArray(meshes)) {
      for (const mesh of meshes) inspectMesh(mesh);
    } else if (typeof meshes?.traverse === 'function') {
      meshes.traverse(inspectMesh);
    } else {
      inspectMesh(meshes);
    }
    return texture;
  }

  function replaceFaceMaterials(mesh, texture, createPreview) {
    const originalMaterials = getMaterials(mesh);
    let replaced = false;
    const materials = originalMaterials.map(material => {
      if (material?.name?.trim().toLowerCase() !== 'face') return material;
      replaced = true;
      return createPreview(material, texture);
    });
    if (!replaced) return null;
    return Array.isArray(mesh.material) ? materials : materials[0];
  }

  const api = {
    findFaceDiffuseTexture,
    isFaceMaterialTarget,
    replaceFaceMaterials
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.localCoreAvatarFaceMaterialPreview = api;
})(globalThis);
