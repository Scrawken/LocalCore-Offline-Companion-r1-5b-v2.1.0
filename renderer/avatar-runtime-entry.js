import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { isTorsoSkinTarget, replaceSkinMaterials } from './avatar-material-override.js';
import {
  findFaceDiffuseTexture,
  isFaceMaterialTarget,
  replaceFaceMaterials
} from './avatar-face-material-preview.js';

class AvatarStage {
  constructor(canvas, onStatus) {
    this.canvas = canvas;
    this.onStatus = onStatus;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#111827');
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.01, 1000);
    this.camera.position.set(0, 1.35, 3.4);
    this.camera.lookAt(0, 1.2, 0);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(1.5, 3, 2);
    this.scene.add(keyLight);
    this.clock = new THREE.Clock();
    this.vrm = null;
    this.head = null;
    this.torso = null;
    this.expression = 'neutral';
    this.audioContext = null;
    this.audioAnalyser = null;
    this.audioSamples = null;
    this.morphTargets = new Map();
    this.torsoMeshes = [];
    this.torsoMaterialOverrideEnabled = false;
    this.torsoMaterialOverrides = new Map();
    this.faceMaterialPreviewEnabled = false;
    this.faceMeshes = [];
    this.faceDiffuseTexture = null;
    this.faceMaterialPreviews = new Map();
    this.animationFrame = 0;
    this.orbitDistance = 3.4;
    this.viewMode = 'full';
    this.dragPointerId = null;
    this.previousPointerX = 0;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.onPointerDown = event => {
      if (!this.vrm || event.button !== 0) return;
      this.dragPointerId = event.pointerId;
      this.previousPointerX = event.clientX;
      canvas.setPointerCapture(event.pointerId);
    };
    this.onPointerMove = event => {
      if (!this.vrm || event.pointerId !== this.dragPointerId) return;
      this.vrm.scene.rotation.y += (event.clientX - this.previousPointerX) * 0.01;
      this.previousPointerX = event.clientX;
    };
    this.onPointerUp = event => {
      if (event.pointerId === this.dragPointerId) this.dragPointerId = null;
    };
    this.onWheel = event => {
      if (!this.vrm) return;
      event.preventDefault();
      this.orbitDistance = THREE.MathUtils.clamp(this.orbitDistance * Math.exp(event.deltaY * 0.001), 0.7, 30);
      this.updateCameraDistance();
    };
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.resize();
    this.animate();
  }

  async load(bytes) {
    const loader = new GLTFLoader();
    loader.register(parser => new VRMLoaderPlugin(parser));
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const gltf = await new Promise((resolve, reject) => loader.parse(arrayBuffer, '', resolve, reject));
    const vrm = gltf.userData.vrm;
    if (!vrm) throw new Error('This file is not a VRM avatar. Choose a rigged .vrm file.');
    this.clearTorsoMaterialOverrides();
    this.clearFaceMaterialPreview();
    this.torsoMeshes = [];
    this.faceMeshes = [];
    if (this.vrm) {
      this.scene.remove(this.vrm.scene);
      this.vrm = null;
    }
    this.vrm = vrm;
    this.morphTargets.clear();
    VRMUtils.rotateVRM0(this.vrm);
    this.scene.add(this.vrm.scene);
    this.vrm.scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(this.vrm.scene);
    if (!bounds.isEmpty()) {
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      this.vrm.scene.position.x -= center.x;
      this.vrm.scene.position.y -= bounds.min.y;
      this.vrm.scene.position.z -= center.z;
      this.vrm.scene.updateMatrixWorld(true);
      this.fitToAvatar();
    }
    this.head = this.vrm.humanoid.getNormalizedBoneNode('head');
    this.torso = this.vrm.humanoid.getNormalizedBoneNode('chest') ||
      this.vrm.humanoid.getNormalizedBoneNode('spine');
    this.vrm.scene.traverse(object => {
      if (isTorsoSkinTarget(object)) this.torsoMeshes.push(object);
      if (isFaceMaterialTarget(object)) this.faceMeshes.push(object);
      if (!object.isMesh || !object.morphTargetDictionary || !object.morphTargetInfluences) return;
      for (const expression of ['neutral', 'happy', 'sad', 'angry', 'relaxed', 'surprised', 'mouth', 'blink']) {
        const targets = window.localCoreAvatarExpression.resolveMorphTargets([object], expression);
        if (targets.length) this.morphTargets.set(expression, [
          ...(this.morphTargets.get(expression) || []),
          ...targets
        ]);
      }
    });
    this.faceDiffuseTexture = findFaceDiffuseTexture(this.vrm.scene);
    if (this.torsoMeshes.length && this.torsoMaterialOverrideEnabled) {
      this.setTorsoMaterialOverride(true);
    }
    if (this.faceMaterialPreviewEnabled) this.setFaceMaterialPreview(true);
    this.setExpression(this.expression);
    this.onStatus(`VRM avatar loaded. ${this.describeExpressionSupport()} Speech mouth shapes: ${
      this.morphTargets.has('mouth') ? 'available.' : 'not present in this model.'
    }`);
  }

  setExpression(name) {
    const allowed = new Set(['neutral', 'happy', 'sad', 'angry', 'relaxed', 'surprised']);
    if (!allowed.has(name)) throw new Error('Unsupported avatar expression: ' + name);
    this.expression = name;
    if (this.vrm?.expressionManager) {
      for (const expression of ['neutral', 'happy', 'sad', 'angry', 'relaxed', 'surprised']) {
        this.vrm.expressionManager.setValue(expression, expression === name ? 1 : 0);
      }
    }
    for (const expression of ['neutral', 'happy', 'sad', 'angry', 'relaxed', 'surprised']) {
      for (const target of this.morphTargets.get(expression) || []) {
        target.mesh.morphTargetInfluences[target.index] = expression === name ? 1 : 0;
      }
    }
    this.setMorphWeight('mouth', 0);
    this.setMorphWeight('blink', 0);
  }

  getExpressionSupport(name) {
    const expression = this.vrm?.expressionManager?.getExpression(name);
    return (this.morphTargets.get(name) || []).length > 0 ||
      Boolean(expression?.binds?.length);
  }

  getSupportedExpressions() {
    return ['neutral', 'happy', 'sad', 'angry', 'relaxed', 'surprised']
      .filter(name => this.getExpressionSupport(name));
  }

  hasTorsoMaterialTarget() {
    return this.torsoMeshes.length > 0;
  }

  setTorsoMaterialOverride(enabled) {
    this.torsoMaterialOverrideEnabled = Boolean(enabled);
    if (!this.torsoMaterialOverrideEnabled) {
      this.clearTorsoMaterialOverrides();
      return 0;
    }
    if (!this.torsoMeshes.length) {
      throw new Error('The active avatar has no identifiable torso skin material to preview.');
    }
    for (const mesh of this.torsoMeshes) {
      if (this.torsoMaterialOverrides.has(mesh)) continue;
      const original = mesh.material;
      const replacements = [];
      const material = replaceSkinMaterials(mesh, () => {
        const preview = new THREE.MeshBasicMaterial({
          color: '#e5c7b6',
          side: THREE.DoubleSide,
          toneMapped: false
        });
        preview.name = 'LocalCore flat torso preview';
        replacements.push(preview);
        return preview;
      });
      if (material === null) continue;
      this.torsoMaterialOverrides.set(mesh, { original, replacements });
      mesh.material = material;
    }
    if (this.torsoMaterialOverrides.size === 0) {
      throw new Error('The torso was detected, but no replaceable Skin material was found.');
    }
    return this.torsoMaterialOverrides.size;
  }

  clearTorsoMaterialOverrides() {
    for (const [mesh, state] of this.torsoMaterialOverrides) {
      mesh.material = state.original;
      for (const material of state.replacements) material.dispose();
    }
    this.torsoMaterialOverrides.clear();
  }

  hasFaceMaterialPreview() {
    return this.faceMeshes.length > 0 && Boolean(this.faceDiffuseTexture);
  }

  setFaceMaterialPreview(enabled) {
    this.faceMaterialPreviewEnabled = Boolean(enabled);
    if (!this.faceMaterialPreviewEnabled) {
      this.clearFaceMaterialPreview();
      return 0;
    }
    if (!this.hasFaceMaterialPreview()) {
      throw new Error('This VRM has no face material and embedded face-diffuse texture to preview.');
    }
    for (const mesh of this.faceMeshes) {
      if (this.faceMaterialPreviews.has(mesh)) continue;
      const original = mesh.material;
      const replacements = [];
      const material = replaceFaceMaterials(mesh, this.faceDiffuseTexture, (source, texture) => {
        const preview = source.clone();
        preview.name = 'LocalCore face diffuse preview';
        preview.map = texture;
        if (preview.color) preview.color.set(0xffffff);
        preview.needsUpdate = true;
        replacements.push(preview);
        return preview;
      });
      if (material === null) continue;
      this.faceMaterialPreviews.set(mesh, { original, replacements });
      mesh.material = material;
    }
    if (this.faceMaterialPreviews.size === 0) {
      throw new Error('The face was detected, but its material could not be replaced.');
    }
    return this.faceMaterialPreviews.size;
  }

  clearFaceMaterialPreview() {
    for (const [mesh, state] of this.faceMaterialPreviews) {
      mesh.material = state.original;
      for (const material of state.replacements) material.dispose();
    }
    this.faceMaterialPreviews.clear();
  }

  setMorphWeight(expression, weight) {
    for (const target of this.morphTargets.get(expression) || []) {
      const isActiveExpressionTarget = this.expression !== expression &&
        (this.morphTargets.get(this.expression) || []).some(activeTarget =>
          activeTarget.mesh === target.mesh && activeTarget.index === target.index);
      target.mesh.morphTargetInfluences[target.index] = Math.max(weight, isActiveExpressionTarget ? 1 : 0);
    }
  }

  setView(view) {
    if (view === 'upper') {
      this.fitUpperBody();
      return;
    }
    if (view === 'full') {
      this.fitToAvatar();
      return;
    }
    throw new Error('Unsupported avatar view: ' + view);
  }

  fitUpperBody() {
    if (!this.vrm) return;
    this.viewMode = 'upper';
    this.vrm.scene.updateMatrixWorld(true);
    const points = [
      this.vrm.humanoid.getNormalizedBoneNode('head'),
      this.vrm.humanoid.getNormalizedBoneNode('spine'),
      this.vrm.humanoid.getNormalizedBoneNode('hips'),
      this.vrm.humanoid.getNormalizedBoneNode('leftShoulder'),
      this.vrm.humanoid.getNormalizedBoneNode('rightShoulder'),
      this.vrm.humanoid.getNormalizedBoneNode('leftHand'),
      this.vrm.humanoid.getNormalizedBoneNode('rightHand')
    ].filter(Boolean).map(bone => bone.getWorldPosition(new THREE.Vector3()));
    if (points.length < 2) {
      this.fitToAvatar();
      return;
    }
    const bounds = new THREE.Box3().setFromPoints(points);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const halfVerticalFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * this.camera.aspect);
    this.cameraTarget = center;
    this.orbitDistance = Math.max(
      size.y / (2 * Math.tan(halfVerticalFov)),
      size.x / (2 * Math.tan(halfHorizontalFov))
    ) * 1.2;
    this.updateCameraDistance();
  }

  describeExpressionSupport() {
    const supported = this.getSupportedExpressions();
    return supported.length
      ? `Visible facial expressions available: ${supported.join(', ')}.`
      : 'This model provides no visible standard facial expressions.';
  }

  async prepareAudio(player) {
    if (!this.audioAnalyser) {
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaElementSource(player);
      this.audioAnalyser = this.audioContext.createAnalyser();
      this.audioAnalyser.fftSize = 1024;
      this.audioSamples = new Uint8Array(this.audioAnalyser.fftSize);
      source.connect(this.audioAnalyser);
      this.audioAnalyser.connect(this.audioContext.destination);
    }
    await this.audioContext.resume();
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.vrm) {
      if (this.viewMode === 'upper') this.fitUpperBody();
      else this.fitToAvatar();
    }
  }

  fitToAvatar() {
    if (!this.vrm) return;
    this.viewMode = 'full';
    this.vrm.scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(this.vrm.scene);
    if (bounds.isEmpty()) return;
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const halfVerticalFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * this.camera.aspect);
    const limitingHalfFov = Math.min(halfVerticalFov, halfHorizontalFov);
    this.cameraTarget = sphere.center.clone();
    this.orbitDistance = Math.max(
      sphere.radius / Math.sin(limitingHalfFov) * 1.2,
      sphere.radius * 1.5
    );
    this.updateCameraDistance();
  }

  updateCameraDistance() {
    const target = this.cameraTarget || new THREE.Vector3(0, 1.2, 0);
    this.camera.position.set(target.x, target.y, target.z + this.orbitDistance);
    const radius = this.vrm
      ? new THREE.Box3().setFromObject(this.vrm.scene).getBoundingSphere(new THREE.Sphere()).radius
      : 1;
    this.camera.near = Math.max(0.01, this.orbitDistance - radius * 1.5);
    this.camera.far = Math.max(100, this.orbitDistance + radius * 2);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(target);
  }

  animate() {
    this.animationFrame = requestAnimationFrame(() => this.animate());
    const delta = this.clock.getDelta();
    const elapsed = this.clock.elapsedTime;

    // Phase 4 idle motion: breathing, aperiodic blink, sway, and a subtle
    // emotion-driven micro-expression on top of the base idle.

    // Breathing: gentle chest rise/fall (scale) layered on the torso sway.
    const breath = Math.sin(elapsed * 1.4) * 0.5 + 0.5; // 0..1
    if (this.torso) {
      this.torso.rotation.y = Math.sin(elapsed * 0.32) * 0.012;
      const breathScale = 1 + breath * 0.012;
      this.torso.scale.set(breathScale, 1 + breath * 0.008, breathScale);
    }
    if (this.head) {
      this.head.rotation.y = Math.sin(elapsed * 0.55) * 0.045;
      this.head.rotation.x = Math.sin(elapsed * 0.38) * 0.018 + breath * 0.006;
    }

    if (this.vrm) {
      const manager = this.vrm.expressionManager;
      if (manager) {
        let mouth = 0;
        if (this.audioAnalyser) {
          this.audioAnalyser.getByteTimeDomainData(this.audioSamples);
          let sum = 0;
          for (const sample of this.audioSamples) {
            const amplitude = (sample - 128) / 128;
            sum += amplitude * amplitude;
          }
          mouth = Math.min(1, Math.max(0, (Math.sqrt(sum / this.audioSamples.length) - 0.018) * 11));
        }
        manager.setValue('aa', mouth);
        this.setMorphWeight('mouth', mouth);

        // Aperiodic blink: random interval between ~2.5s and ~6s, ~150ms close.
        if (this.nextBlinkAt === undefined) this.nextBlinkAt = elapsed + 2.5 + Math.random() * 3.5;
        let blink = 0;
        if (elapsed >= this.nextBlinkAt) {
          const phase = (elapsed - this.nextBlinkAt) / 0.15; // 150ms blink
          if (phase >= 1) {
            this.nextBlinkAt = elapsed + 2.5 + Math.random() * 3.5;
          } else {
            blink = Math.sin(Math.min(1, phase) * Math.PI);
          }
        }
        manager.setValue('blink', blink);
        this.setMorphWeight('blink', blink);

        // Emotion micro-expression: a faint, slow pulse of the active mood's
        // expression so the idle feels alive without overriding the set mood.
        if (this.expression && this.expression !== 'neutral') {
          const pulse = (Math.sin(elapsed * 0.9) * 0.5 + 0.5) * 0.12;
          const current = manager.getValue ? manager.getValue(this.expression) : null;
          if (current !== null && current !== undefined) {
            manager.setValue(this.expression, Math.min(1, current + pulse * 0.05));
          }
        }
      }
      this.vrm.update(delta);
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.animationFrame);
    this.clearTorsoMaterialOverrides();
    this.clearFaceMaterialPreview();
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.audioContext?.close();
    this.renderer.dispose();
  }
}

window.LocalCoreAvatar = { AvatarStage };
