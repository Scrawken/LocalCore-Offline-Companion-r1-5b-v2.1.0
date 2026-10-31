const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const maximumAvatarBytes = 512 * 1024 * 1024;
const builtInAvatarId = 'localcore-core';
const avatarIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const presetIdPattern = /^preset-[a-z0-9-]+$/i;

function validateAvatarBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 12 || bytes.byteLength > maximumAvatarBytes) {
    throw new Error('VRM avatar file must be between 12 bytes and 512 MB.');
  }
  const header = Buffer.from(bytes.buffer, bytes.byteOffset, 12);
  if (header.toString('ascii', 0, 4) !== 'glTF' ||
      header.readUInt32LE(4) !== 2 ||
      header.readUInt32LE(8) !== bytes.byteLength) {
    throw new Error('The selected file is not a binary VRM/GLB avatar.');
  }
}

async function writeAtomically(filePath, bytes) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}-${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, bytes, { flag: 'wx' });
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}

// Built-in preset avatars live in a presets directory (e.g. models/avatar/presets).
// Each .vrm file becomes a selectable built-in with a stable id of
// 'preset-<filename-stem>'. Presets ship with the app and cannot be deleted.
async function scanPresets(presetsDirectory) {
  if (!presetsDirectory) return [];
  let names;
  try {
    names = await fs.readdir(presetsDirectory);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const presets = [];
  for (const name of names) {
    if (!name.toLowerCase().endsWith('.vrm')) continue;
    const stem = name.replace(/\.vrm$/i, '');
    const id = 'preset-' + stem.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    presets.push({
      id,
      name: stem,
      filePath: path.join(presetsDirectory, name)
    });
  }
  return presets;
}

function createAvatarStore(directory, defaultAvatarPath = null, presetsDirectory = null) {
  const avatarPath = path.join(directory, 'active.vrm');
  const libraryPath = path.join(directory, 'library');
  const catalogPath = path.join(directory, 'catalog.json');
  const selectionPath = path.join(directory, 'selection.json');

  async function readJson(filePath, fallback) {
    try {
      return JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return fallback;
      throw error;
    }
  }

  async function readCatalog() {
    const stored = await readJson(catalogPath, []);
    if (!Array.isArray(stored)) throw new Error('The local avatar catalog is invalid.');
    const catalog = stored.filter(item => item && avatarIdPattern.test(item.id) &&
      typeof item.name === 'string' && item.name.trim());

    // Preserve avatars saved by older LocalCore versions, which used active.vrm.
    if (!catalog.length) {
      let legacyBytes;
      try {
        legacyBytes = await fs.readFile(avatarPath);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (legacyBytes) {
        const id = crypto.randomUUID();
        const name = 'Imported character';
        await writeAtomically(path.join(libraryPath, `${id}.vrm`), legacyBytes);
        catalog.push({ id, name });
        await writeAtomically(catalogPath, JSON.stringify(catalog, null, 2));
        await writeAtomically(selectionPath, JSON.stringify({ id }));
      }
    }
    return catalog;
  }

  async function hasDefaultAvatar() {
    if (!defaultAvatarPath) return false;
    try {
      await fs.access(defaultAvatarPath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }

  async function activeId(catalog, includeDefault, presets) {
    const selection = await readJson(selectionPath, null);
    if (selection) {
      const isValid = (selection.id === builtInAvatarId && includeDefault) ||
        catalog.some(item => item.id === selection.id) ||
        presets.some(p => p.id === selection.id);
      if (isValid) return selection.id;
    }
    if (catalog.length) return catalog[0].id;
    if (includeDefault) return builtInAvatarId;
    if (presets.length) return presets[0].id;
    return null;
  }

  async function getAvatarPath(id, catalog, presets) {
    if (id === builtInAvatarId && await hasDefaultAvatar()) return defaultAvatarPath;
    if (presetIdPattern.test(id)) {
      const preset = presets.find(p => p.id === id);
      return preset ? preset.filePath : null;
    }
    if (avatarIdPattern.test(id) && catalog.some(item => item.id === id)) {
      return path.join(libraryPath, `${id}.vrm`);
    }
    return null;
  }

  async function load(id) {
    const catalog = await readCatalog();
    const includeDefault = await hasDefaultAvatar();
    const presets = await scanPresets(presetsDirectory);
    const requestedId = id || await activeId(catalog, includeDefault, presets);
    if (!requestedId) return null;
    const filePath = await getAvatarPath(requestedId, catalog, presets);
    if (!filePath) return null;
    try {
      return new Uint8Array(await fs.readFile(filePath));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  return {
    async save(bytes, requestedName = 'Imported character') {
      validateAvatarBytes(bytes);
      const catalog = await readCatalog();
      const rawName = path.basename(String(requestedName || 'Imported character'))
        .replace(/\.vrm$/i, '').trim();
      const name = (rawName || 'Imported character').slice(0, 120);
      const id = crypto.randomUUID();
      const storedBytes = Buffer.from(bytes);
      await writeAtomically(path.join(libraryPath, `${id}.vrm`), storedBytes);
      catalog.push({ id, name });
      await writeAtomically(catalogPath, JSON.stringify(catalog, null, 2));
      // Keep the old path current for compatibility with app versions before the library picker.
      await writeAtomically(avatarPath, storedBytes);
      await writeAtomically(selectionPath, JSON.stringify({ id }));
      return { id, name, builtIn: false };
    },

    async list() {
      const catalog = await readCatalog();
      const includeDefault = await hasDefaultAvatar();
      const presets = await scanPresets(presetsDirectory);
      const avatars = includeDefault
        ? [{ id: builtInAvatarId, name: 'LocalCore Core', builtIn: true }]
        : [];
      avatars.push(...presets.map(p => ({ id: p.id, name: p.name, builtIn: true, preset: true })));
      avatars.push(...catalog.map(item => ({ ...item, builtIn: false })));
      return { avatars, activeId: await activeId(catalog, includeDefault, presets) };
    },

    async select(id) {
      const catalog = await readCatalog();
      const includeDefault = await hasDefaultAvatar();
      const presets = await scanPresets(presetsDirectory);
      const isBuiltIn = id === builtInAvatarId && includeDefault;
      const isPreset = presetIdPattern.test(id) && presets.some(p => p.id === id);
      const isLibrary = avatarIdPattern.test(id) && catalog.some(item => item.id === id);
      if (!isBuiltIn && !isPreset && !isLibrary) {
        throw new Error('That avatar is not available in the local character library.');
      }
      await writeAtomically(selectionPath, JSON.stringify({ id }));
      return id;
    },

    load,

    async loadActive() {
      const listing = await this.list();
      if (!listing.activeId) return null;
      return this.load(listing.activeId);
    }
  };
}

module.exports = { createAvatarStore, maximumAvatarBytes, validateAvatarBytes, builtInAvatarId };
