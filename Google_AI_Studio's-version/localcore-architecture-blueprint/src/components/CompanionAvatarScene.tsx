import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM } from '@pixiv/three-vrm';

export type CompanionMood =
  | 'neutral'
  | 'happy'
  | 'cheerful'
  | 'curious'
  | 'empathetic'
  | 'playful'
  | 'focused'
  | 'thinking'
  | 'surprised'
  | 'sleepy'
  | 'speaking'
  | 'dance';

export interface AvatarState {
  mood: CompanionMood;
  isListening: boolean;
  isSpeaking: boolean;
  isPlayingMusic: boolean;
  currentViseme: string;
  visemeWeight: number;
  projectedImage: string | null;
  cameraView: 'full' | 'half' | 'portrait';
  customVrmLoaded: boolean;
  vrmModelName?: string;
}

import { StoredAvatar } from '../utils/vrmCatalogDb';

export interface CompanionAvatarSceneProps {
  avatarState: AvatarState;
  setAvatarState: React.Dispatch<React.SetStateAction<AvatarState>>;
  onCharacterClick?: () => void;
  activeAvatar?: StoredAvatar;
  onAvatarImported?: (avatar: StoredAvatar) => void;
  isLoadingAvatar?: boolean;
  setIsLoadingAvatar?: (loading: boolean) => void;
}

export const CompanionAvatarScene: React.FC<CompanionAvatarSceneProps> = ({
  avatarState,
  setAvatarState,
  onCharacterClick,
  activeAvatar,
  onAvatarImported,
  isLoadingAvatar,
  setIsLoadingAvatar,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<AvatarState>(avatarState);
  stateRef.current = avatarState;

  const currentVrmRef = useRef<VRM | null>(null);
  const avatarSwitchRef = useRef<((avatar?: StoredAvatar) => void) | null>(null);

  // Dynamically switch avatar whenever activeAvatar prop changes
  useEffect(() => {
    if (avatarSwitchRef.current) {
      avatarSwitchRef.current(activeAvatar);
    }
  }, [activeAvatar]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Software WebGL Guard (Three.js skill directive)
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // 2. High-Performance WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(renderer.domElement);

    // 3. Scene & Camera Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f1016);
    scene.fog = new THREE.FogExp2(0x0f1016, 0.035);

    const camera = new THREE.PerspectiveCamera(
      38,
      container.clientWidth / container.clientHeight,
      0.1,
      40
    );
    // Default to Half-Body framing
    camera.position.set(0, 1.25, 2.6);

    // 4. Studio Environment Reflection
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 5. Studio Anime Lighting Rig
    // Warm Key Light
    const keyLight = new THREE.DirectionalLight(0xfff7ed, 2.4);
    keyLight.position.set(1.8, 3.5, 2.5);
    keyLight.castShadow = !isSoftwareGl;
    if (keyLight.castShadow) {
      keyLight.shadow.mapSize.width = 1024;
      keyLight.shadow.mapSize.height = 1024;
      keyLight.shadow.bias = -0.0004;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    // Soft Anime Fill Light
    const fillLight = new THREE.DirectionalLight(0xa5f3fc, 1.2);
    fillLight.position.set(-1.8, 2.0, 2.0);
    scene.add(fillLight);

    // Backlight / Hair Rim Light
    const rimLight = new THREE.DirectionalLight(0xf472b6, 2.2);
    rimLight.position.set(-2.0, 3.0, -2.5);
    scene.add(rimLight);

    // Upward soft floor bounce
    const bounceLight = new THREE.DirectionalLight(0xffedd5, 0.7);
    bounceLight.position.set(0, 0.2, 2.0);
    scene.add(bounceLight);

    // Ground Floor & Radial Soft Contact Shadow
    const floorGeo = new THREE.PlaneGeometry(14, 14);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x13141f,
      roughness: 0.85,
      metalness: 0.1,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0;
    floorMesh.receiveShadow = !isSoftwareGl;
    scene.add(floorMesh);

    // Radial shadow texture
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 256;
    shadowCanvas.height = 256;
    const sCtx = shadowCanvas.getContext('2d')!;
    const sGrad = sCtx.createRadialGradient(128, 128, 15, 128, 128, 120);
    sGrad.addColorStop(0, 'rgba(0,0,0,0.7)');
    sGrad.addColorStop(0.5, 'rgba(0,0,0,0.25)');
    sGrad.addColorStop(1, 'rgba(0,0,0,0)');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 256, 256);

    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.6, depthWrite: false })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.005;
    scene.add(contactShadow);

    // Container for the Full Anime Character Model
    const animeCharacterGroup = new THREE.Group();
    scene.add(animeCharacterGroup);

    // ========================================================
    // 6. BUILT-IN FULL-BODY ANIME FEMALE COMPANION ("ARIA")
    // ========================================================
    // Materials (Anime Cel Shading & Soft Warm Skin)
    const animeSkinMat = new THREE.MeshStandardMaterial({
      color: 0xfff0ea,
      roughness: 0.55,
      metalness: 0.02,
    });

    const animeHairMat = new THREE.MeshStandardMaterial({
      color: 0x3b1d28, // Deep plum brunette
      roughness: 0.35,
      metalness: 0.15,
    });

    const blazerNavyMat = new THREE.MeshStandardMaterial({
      color: 0x1e2238, // Academy navy blazer
      roughness: 0.75,
      metalness: 0.05,
    });

    const collarWhiteMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.65,
      metalness: 0.02,
    });

    const ribbonRedMat = new THREE.MeshStandardMaterial({
      color: 0xbe123c, // Scarlet silk ribbon
      roughness: 0.45,
      metalness: 0.1,
    });

    const skirtPleatMat = new THREE.MeshStandardMaterial({
      color: 0x1a1e32,
      roughness: 0.8,
      metalness: 0.05,
    });

    const stockingDarkMat = new THREE.MeshStandardMaterial({
      color: 0x11131f,
      roughness: 0.7,
      metalness: 0.08,
    });

    const shoesBrownMat = new THREE.MeshStandardMaterial({
      color: 0x3d2117,
      roughness: 0.25,
      metalness: 0.3,
    });

    const goldAccentMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      roughness: 0.15,
      metalness: 0.95,
    });

    // --- FULL BODY HIERARCHY ---
    // A. Legs & Shoes (Ground to Hips: 0.0 to 0.78m)
    const legsGroup = new THREE.Group();
    animeCharacterGroup.add(legsGroup);

    function createLeg(isLeft: boolean) {
      const leg = new THREE.Group();
      const x = isLeft ? 0.09 : -0.09;
      leg.position.set(x, 0, 0);

      // Mary Jane Shoe
      const shoeGeo = new THREE.CylinderGeometry(0.045, 0.052, 0.055, 16);
      shoeGeo.scale(0.85, 1.0, 1.35);
      const shoe = new THREE.Mesh(shoeGeo, shoesBrownMat);
      shoe.position.set(0, 0.03, 0.02);
      shoe.castShadow = !isSoftwareGl;
      leg.add(shoe);

      // Gold Buckle
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.015, 0.01), goldAccentMat);
      buckle.position.set(0, 0.055, 0.04);
      leg.add(buckle);

      // Lower Leg with Thigh-High Stockings
      const lowerLegGeo = new THREE.CylinderGeometry(0.038, 0.032, 0.38, 20);
      const lowerLeg = new THREE.Mesh(lowerLegGeo, stockingDarkMat);
      lowerLeg.position.y = 0.22;
      lowerLeg.castShadow = !isSoftwareGl;
      leg.add(lowerLeg);

      // Knee & Upper Thigh
      const upperLegGeo = new THREE.CylinderGeometry(0.052, 0.04, 0.36, 20);
      const upperLeg = new THREE.Mesh(upperLegGeo, stockingDarkMat);
      upperLeg.position.y = 0.56;
      upperLeg.castShadow = !isSoftwareGl;
      leg.add(upperLeg);

      // Bare Thigh peek beneath skirt (Zettai Ryouiki)
      const bareThighGeo = new THREE.CylinderGeometry(0.055, 0.051, 0.08, 20);
      const bareThigh = new THREE.Mesh(bareThighGeo, animeSkinMat);
      bareThigh.position.y = 0.72;
      leg.add(bareThigh);

      return leg;
    }

    legsGroup.add(createLeg(true));
    legsGroup.add(createLeg(false));

    // B. Pleated Anime Skirt
    const skirtGeo = new THREE.ConeGeometry(0.24, 0.26, 24, 1, true);
    skirtGeo.scale(1.15, 1.0, 0.95);
    const skirtMesh = new THREE.Mesh(skirtGeo, skirtPleatMat);
    skirtMesh.position.set(0, 0.78, 0);
    skirtMesh.castShadow = !isSoftwareGl;
    animeCharacterGroup.add(skirtMesh);

    // Skirt Gold Hemline
    const skirtTrimGeo = new THREE.TorusGeometry(0.23, 0.006, 12, 32);
    skirtTrimGeo.scale(1.15, 0.95, 1.0);
    const skirtTrim = new THREE.Mesh(skirtTrimGeo, goldAccentMat);
    skirtTrim.rotation.x = Math.PI / 2;
    skirtTrim.position.set(0, 0.66, 0);
    animeCharacterGroup.add(skirtTrim);

    // C. Upper Torso & Fitted Academy Blazer (0.78m to 1.25m)
    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, 0.88, 0);
    animeCharacterGroup.add(torsoGroup);

    // Slender Anime Waist & Jacket
    const waistGeo = new THREE.CylinderGeometry(0.145, 0.165, 0.32, 24);
    waistGeo.scale(1.05, 1.0, 0.85);
    const waistMesh = new THREE.Mesh(waistGeo, blazerNavyMat);
    waistMesh.position.y = 0.12;
    waistMesh.castShadow = !isSoftwareGl;
    torsoGroup.add(waistMesh);

    // Upper Bust & Sailor Collar Chest
    const bustGeo = new THREE.CylinderGeometry(0.18, 0.145, 0.22, 24);
    bustGeo.scale(1.1, 1.0, 0.9);
    const bustMesh = new THREE.Mesh(bustGeo, blazerNavyMat);
    bustMesh.position.y = 0.32;
    torsoGroup.add(bustMesh);

    // White Sailor Collar
    const sailorCollarGeo = new THREE.CylinderGeometry(0.19, 0.17, 0.08, 24);
    sailorCollarGeo.scale(1.15, 1.0, 0.95);
    const sailorCollar = new THREE.Mesh(sailorCollarGeo, collarWhiteMat);
    sailorCollar.position.set(0, 0.42, 0);
    torsoGroup.add(sailorCollar);

    // Scarlet Silk Bow Tie on Chest
    const bowCenter = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 12), ribbonRedMat);
    bowCenter.position.set(0, 0.38, 0.155);
    torsoGroup.add(bowCenter);

    const leftBowWing = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 3), ribbonRedMat);
    leftBowWing.rotation.z = Math.PI / 2 + 0.3;
    leftBowWing.position.set(0.045, 0.38, 0.15);
    torsoGroup.add(leftBowWing);

    const rightBowWing = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 3), ribbonRedMat);
    rightBowWing.rotation.z = -Math.PI / 2 - 0.3;
    rightBowWing.position.set(-0.045, 0.38, 0.15);
    torsoGroup.add(rightBowWing);

    // Gold Buttons
    for (let b = 0; b < 3; b++) {
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.005, 12), goldAccentMat);
      btn.rotation.x = Math.PI / 2;
      btn.position.set(0, 0.12 + b * 0.08, 0.13 - b * 0.01);
      torsoGroup.add(btn);
    }

    // D. Articulated Arms & Anime Hands
    function createArm(isLeft: boolean) {
      const arm = new THREE.Group();
      const x = isLeft ? 0.22 : -0.22;
      arm.position.set(x, 0.42, 0);

      // Shoulder Pauldron
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 16), blazerNavyMat);
      arm.add(shoulder);

      // Upper Arm
      const upperArmGeo = new THREE.CylinderGeometry(0.042, 0.036, 0.22, 16);
      const upperArm = new THREE.Mesh(upperArmGeo, blazerNavyMat);
      upperArm.position.set(0, -0.11, 0);
      arm.add(upperArm);

      // Forearm with white blouse cuff
      const forearmGeo = new THREE.CylinderGeometry(0.036, 0.03, 0.2, 16);
      const forearm = new THREE.Mesh(forearmGeo, blazerNavyMat);
      forearm.position.set(0, -0.3, 0.03);
      forearm.rotation.x = 0.2;
      arm.add(forearm);

      const cuffGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.03, 16);
      const cuff = new THREE.Mesh(cuffGeo, collarWhiteMat);
      cuff.position.set(0, -0.4, 0.05);
      arm.add(cuff);

      // Delicate Anime Hand
      const handGeo = new THREE.SphereGeometry(0.03, 16, 16);
      handGeo.scale(0.8, 1.2, 0.5);
      const hand = new THREE.Mesh(handGeo, animeSkinMat);
      hand.position.set(0, -0.43, 0.06);
      arm.add(hand);

      return arm;
    }

    const leftArmGroup = createArm(true);
    const rightArmGroup = createArm(false);
    leftArmGroup.rotation.z = -0.15;
    rightArmGroup.rotation.z = 0.15;
    torsoGroup.add(leftArmGroup);
    torsoGroup.add(rightArmGroup);

    // E. Slender Anime Neck with Velvet Choker
    const neckGeo = new THREE.CylinderGeometry(0.055, 0.068, 0.14, 20);
    const neckMesh = new THREE.Mesh(neckGeo, animeSkinMat);
    neckMesh.position.y = 0.49;
    torsoGroup.add(neckMesh);

    const chokerGeo = new THREE.TorusGeometry(0.058, 0.005, 12, 24);
    const choker = new THREE.Mesh(chokerGeo, ribbonRedMat);
    choker.rotation.x = Math.PI / 2;
    choker.position.y = 0.49;
    torsoGroup.add(choker);

    // F. Anime Face, Head, Big Anime Eyes & Stylized Hair
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.65, 0);
    torsoGroup.add(headGroup);

    // Cute Anime Face Contour (Softer, rounded anime teardrop jaw)
    const headGeo = new THREE.SphereGeometry(0.18, 36, 32);
    headGeo.scale(0.9, 1.05, 0.95);
    const headMesh = new THREE.Mesh(headGeo, animeSkinMat);
    headMesh.castShadow = !isSoftwareGl;
    headGroup.add(headMesh);

    // Delicate Chin Prominence
    const chinGeo = new THREE.SphereGeometry(0.065, 16, 16);
    chinGeo.scale(0.7, 0.7, 0.85);
    const chinMesh = new THREE.Mesh(chinGeo, animeSkinMat);
    chinMesh.position.set(0, -0.12, 0.1);
    headGroup.add(chinMesh);

    // Tiny delicate anime nose dot
    const noseDot = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 8), new THREE.MeshBasicMaterial({ color: 0xec4899 }));
    noseDot.position.set(0, -0.015, 0.175);
    headGroup.add(noseDot);

    // Cute Anime Blush Marks (Rosy horizontal pill bars)
    const blushGeo = new THREE.PlaneGeometry(0.045, 0.018);
    const blushMat = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide
    });
    const leftBlush = new THREE.Mesh(blushGeo, blushMat);
    leftBlush.position.set(0.09, -0.035, 0.155);
    leftBlush.rotation.z = -0.1;
    headGroup.add(leftBlush);

    const rightBlush = new THREE.Mesh(blushGeo, blushMat);
    rightBlush.position.set(-0.09, -0.035, 0.155);
    rightBlush.rotation.z = 0.1;
    headGroup.add(rightBlush);

    // Large Expressive Anime Eyes (Iris Canvas with Highlights & Winged Eyelash)
    function createAnimeEye(isLeft: boolean) {
      const eyeRig = new THREE.Group();
      const x = isLeft ? 0.062 : -0.062;
      eyeRig.position.set(x, 0.02, 0.155);

      // Eye White Base
      const eyeWhite = new THREE.Mesh(
        new THREE.PlaneGeometry(0.048, 0.055),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
      );
      eyeRig.add(eyeWhite);

      // 2D Anime Iris Texture with Double Sparkle Highlights
      const eyeCanvas = document.createElement('canvas');
      eyeCanvas.width = 128;
      eyeCanvas.height = 160;
      const eCtx = eyeCanvas.getContext('2d')!;

      // Eye white background
      eCtx.fillStyle = '#ffffff';
      eCtx.fillRect(0, 0, 128, 160);

      // Large Oval Anime Iris Gradient (Cyan to Violet / Deep Indigo)
      const iGrad = eCtx.createLinearGradient(64, 20, 64, 140);
      iGrad.addColorStop(0, '#06b6d4'); // Cyan
      iGrad.addColorStop(0.5, '#3b82f6'); // Royal blue
      iGrad.addColorStop(1, '#6366f1'); // Indigo
      eCtx.fillStyle = iGrad;
      eCtx.beginPath();
      eCtx.ellipse(64, 80, 48, 62, 0, 0, Math.PI * 2);
      eCtx.fill();

      // Pupil (Dark violet)
      eCtx.fillStyle = '#1e1b4b';
      eCtx.beginPath();
      eCtx.ellipse(64, 82, 22, 32, 0, 0, Math.PI * 2);
      eCtx.fill();

      // Big Anime Sparkle Highlights (Upper Left + Lower Right Star)
      eCtx.fillStyle = '#ffffff';
      eCtx.beginPath();
      eCtx.ellipse(48, 55, 14, 18, -0.3, 0, Math.PI * 2);
      eCtx.fill();

      eCtx.beginPath();
      eCtx.arc(82, 105, 7, 0, Math.PI * 2);
      eCtx.fill();

      const eyeTex = new THREE.CanvasTexture(eyeCanvas);
      eyeTex.colorSpace = THREE.SRGBColorSpace;

      const eyeIris = new THREE.Mesh(
        new THREE.PlaneGeometry(0.048, 0.055),
        new THREE.MeshBasicMaterial({ map: eyeTex, side: THREE.DoubleSide })
      );
      eyeIris.position.set(0, 0, 0.002);
      eyeRig.add(eyeIris);

      // Winged Anime Upper Eyelash (Thick black anime liner)
      const lashGeo = new THREE.PlaneGeometry(0.054, 0.014);
      const lashMat = new THREE.MeshBasicMaterial({ color: 0x18181b, side: THREE.DoubleSide });
      const upperLash = new THREE.Mesh(lashGeo, lashMat);
      upperLash.rotation.z = isLeft ? -0.15 : 0.15;
      upperLash.position.set(0, 0.03, 0.005);
      eyeRig.add(upperLash);

      // Eyelid Cover for Blinking
      const lidMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.052, 0.06),
        new THREE.MeshBasicMaterial({ color: 0xfff0ea, side: THREE.DoubleSide })
      );
      lidMesh.position.set(0, 0.06, 0.008);
      lidMesh.scale.y = 0.01; // 0.01 = wide open, 1.0 = fully closed
      eyeRig.add(lidMesh);

      return { eyeRig, eyeIris, lidMesh };
    }

    const leftAnimeEye = createAnimeEye(true);
    const rightAnimeEye = createAnimeEye(false);
    headGroup.add(leftAnimeEye.eyeRig);
    headGroup.add(rightAnimeEye.eyeRig);

    // Delicate Curved Anime Eyebrows
    const browGeo = new THREE.PlaneGeometry(0.042, 0.008);
    const browMat = new THREE.MeshBasicMaterial({ color: 0x3b1d28, side: THREE.DoubleSide });

    const leftBrow = new THREE.Mesh(browGeo, browMat);
    leftBrow.position.set(0.062, 0.075, 0.165);
    leftBrow.rotation.z = -0.08;
    headGroup.add(leftBrow);

    const rightBrow = new THREE.Mesh(browGeo, browMat);
    rightBrow.position.set(-0.062, 0.075, 0.165);
    rightBrow.rotation.z = 0.08;
    headGroup.add(rightBrow);

    // Cute Anime Mouth & Articulated Viseme Aperture
    const mouthGroup = new THREE.Group();
    mouthGroup.position.set(0, -0.075, 0.165);
    headGroup.add(mouthGroup);

    // Upper Lip line
    const upperLipLine = new THREE.Mesh(
      new THREE.PlaneGeometry(0.026, 0.005),
      new THREE.MeshBasicMaterial({ color: 0xbe123c, side: THREE.DoubleSide })
    );
    mouthGroup.add(upperLipLine);

    // Open mouth shape for visemes (`aa`, `ih`, `oh`)
    const mouthInsideGeo = new THREE.CircleGeometry(0.018, 16, 0, Math.PI);
    const mouthInsideMat = new THREE.MeshBasicMaterial({ color: 0x881337, side: THREE.DoubleSide });
    const mouthInside = new THREE.Mesh(mouthInsideGeo, mouthInsideMat);
    mouthInside.rotation.x = Math.PI;
    mouthInside.scale.set(1, 0.05, 1); // Scales up when talking
    mouthGroup.add(mouthInside);

    // Stylized Layered Anime Hair (Crown, Front Bangs & Twin Side Tails)
    const animeHairGroup = new THREE.Group();
    headGroup.add(animeHairGroup);

    // Hair Crown
    const crownGeo = new THREE.SphereGeometry(0.195, 24, 24);
    crownGeo.scale(1.0, 1.12, 1.05);
    const crown = new THREE.Mesh(crownGeo, animeHairMat);
    crown.position.set(0, 0.03, -0.02);
    animeHairGroup.add(crown);

    // Front Anime Bangs (Layered Strand Clusters across forehead)
    for (let f = -3; f <= 3; f++) {
      const strandGeo = new THREE.ConeGeometry(0.028, 0.16, 6);
      strandGeo.scale(1.2, 1.0, 0.5);
      const strand = new THREE.Mesh(strandGeo, animeHairMat);
      strand.rotation.x = 0.25;
      strand.rotation.z = f * -0.08;
      strand.position.set(f * 0.03, 0.1 - Math.abs(f) * 0.012, 0.16 - Math.abs(f) * 0.008);
      animeHairGroup.add(strand);
    }

    // Side Locks framing cheeks
    const leftSideLock = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.38, 8), animeHairMat);
    leftSideLock.position.set(0.14, -0.08, 0.1);
    leftSideLock.rotation.z = 0.2;
    leftSideLock.rotation.x = 0.15;
    animeHairGroup.add(leftSideLock);

    const rightSideLock = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.38, 8), animeHairMat);
    rightSideLock.position.set(-0.14, -0.08, 0.1);
    rightSideLock.rotation.z = -0.2;
    rightSideLock.rotation.x = 0.15;
    animeHairGroup.add(rightSideLock);

    // Flowing Twin Ponytails / Long Back Hair
    const leftPonytail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.015, 0.58, 16), animeHairMat);
    leftPonytail.position.set(0.18, -0.15, -0.08);
    leftPonytail.rotation.z = 0.35;
    leftPonytail.rotation.x = -0.2;
    animeHairGroup.add(leftPonytail);

    const rightPonytail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.015, 0.58, 16), animeHairMat);
    rightPonytail.position.set(-0.18, -0.15, -0.08);
    rightPonytail.rotation.z = -0.35;
    rightPonytail.rotation.x = -0.2;
    animeHairGroup.add(rightPonytail);

    // Cute Red Ribbons in Hair
    const leftRibbon = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.008, 8, 16), ribbonRedMat);
    leftRibbon.position.set(0.16, 0.08, -0.02);
    animeHairGroup.add(leftRibbon);

    const rightRibbon = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.008, 8, 16), ribbonRedMat);
    rightRibbon.position.set(-0.16, 0.08, -0.02);
    animeHairGroup.add(rightRibbon);

    // ========================================================
    // 7. EXTERNAL VRM MODEL LOADER (@pixiv/three-vrm)
    // ========================================================
    const vrmContainer = new THREE.Group();
    scene.add(vrmContainer);

    const gltfLoader = new GLTFLoader();
    gltfLoader.register((parser) => new VRMLoaderPlugin(parser));

      const loadVrmFromUrl = (targetUrl: string, modelName = 'VRM Avatar') => {
        setIsLoadingAvatar?.(true);
        gltfLoader.load(
          targetUrl,
          (gltf) => {
            const vrm = gltf.userData.vrm as VRM;
            if (!vrm) {
              setIsLoadingAvatar?.(false);
              return;
            }

            if (currentVrmRef.current) {
              vrmContainer.remove(currentVrmRef.current.scene);
              currentVrmRef.current = null;
            }

            animeCharacterGroup.visible = false;
            vrm.scene.position.set(0, 0, 0);
            vrm.scene.rotation.y = Math.PI;
            vrmContainer.add(vrm.scene);
            currentVrmRef.current = vrm;

            setAvatarState((prev) => ({
              ...prev,
              customVrmLoaded: true,
              vrmModelName: modelName,
              mood: 'cheerful'
            }));
            setIsLoadingAvatar?.(false);
          },
          undefined,
          (err: any) => {
            console.warn('VRM load notice:', err?.message || err);
            // Fallback to built-in Aria
            animeCharacterGroup.visible = true;
            setIsLoadingAvatar?.(false);
          }
        );
      };

      const loadVrmFromBlob = (blob: Blob, modelName = 'Custom VRM') => {
        const url = URL.createObjectURL(blob);
        loadVrmFromUrl(url, modelName);
      };

      const restoreDefaultAria = () => {
        if (currentVrmRef.current) {
          vrmContainer.remove(currentVrmRef.current.scene);
          currentVrmRef.current = null;
        }
        animeCharacterGroup.visible = true;
        setAvatarState((prev) => ({
          ...prev,
          customVrmLoaded: false,
          vrmModelName: 'Aria (Anime Companion)'
        }));
        setIsLoadingAvatar?.(false);
      };

      avatarSwitchRef.current = (target?: StoredAvatar) => {
        if (!target || target.type === 'default') {
          restoreDefaultAria();
        } else if (target.blob) {
          loadVrmFromBlob(target.blob, target.name);
        } else if (target.modelUrl) {
          loadVrmFromUrl(target.modelUrl, target.name);
        }
      };

      // Handle active avatar selection
      if (activeAvatar) {
        avatarSwitchRef.current(activeAvatar);
      }

    // 8. 3D Holographic Projector (gemini-nano-banana-2.1)
    const hologramCanvas = document.createElement('canvas');
    hologramCanvas.width = 512;
    hologramCanvas.height = 512;
    const holoCtx = hologramCanvas.getContext('2d')!;
    holoCtx.fillStyle = '#38bdf8';
    holoCtx.font = 'bold 22px sans-serif';
    holoCtx.textAlign = 'center';
    holoCtx.fillText('LOCALCORE HOLOGRAM', 256, 256);

    const holoTexture = new THREE.CanvasTexture(hologramCanvas);
    holoTexture.colorSpace = THREE.SRGBColorSpace;
    const holoMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 1.2),
      new THREE.MeshBasicMaterial({
        map: holoTexture,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    holoMesh.position.set(0, 1.25, 0.7);
    scene.add(holoMesh);

    // Gaze & Pointer Tracking
    const targetGaze = new THREE.Vector2(0, 0);
    const currentGaze = new THREE.Vector2(0, 0);

    const onPointerMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      targetGaze.set(x * 0.35, y * 0.25);
    };

    const onClick = () => {
      if (onCharacterClick) onCharacterClick();
      // Physical friendly nod & joyful reaction
      headGroup.rotation.x = 0.18;
      leftArmGroup.rotation.z = -0.4; // Cute friendly wave
    };

    container.addEventListener('mousemove', onPointerMove);
    container.addEventListener('click', onClick);

    // Drag and Drop .VRM file support on Canvas (saves to catalog & switches)
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file && (file.name.endsWith('.vrm') || file.name.endsWith('.glb'))) {
        try {
          const { saveCustomVrmAvatar } = await import('../utils/vrmCatalogDb');
          const savedAvatar = await saveCustomVrmAvatar(file.name, file);
          if (onAvatarImported) {
            onAvatarImported(savedAvatar);
          } else if (avatarSwitchRef.current) {
            avatarSwitchRef.current(savedAvatar);
          }
        } catch (saveErr) {
          loadVrmFromBlob(file, file.name);
        }
      }
    };
    container.addEventListener('dragover', onDragOver);
    container.addEventListener('drop', onDrop);

    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    // ========================================================
    // 9. ANIMATION LOOP: ALL 12 MOODS & REAL-TIME KINEMATICS
    // ========================================================
    let animationFrameId = 0;
    let clock = new THREE.Clock();
    let blinkTimer = 0;
    let currentLoadedImage: string | null = null;

    const renderLoop = () => {
      animationFrameId = requestAnimationFrame(renderLoop);
      const delta = Math.min(clock.getDelta(), 0.08);
      const elapsedTime = clock.getElapsedTime();
      const st = stateRef.current;

      // 1. Camera View Transitions (Full Body vs Half Body vs Portrait)
      let targetCamY = 1.25;
      let targetCamZ = 2.6;
      if (st.cameraView === 'full') {
        targetCamY = 0.85;
        targetCamZ = 3.6;
      } else if (st.cameraView === 'portrait') {
        targetCamY = 1.52;
        targetCamZ = 1.6;
      }
      camera.position.y = THREE.MathUtils.damp(camera.position.y, targetCamY, 4, delta);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, targetCamZ, 4, delta);

      // 2. VRM or Procedural Branching
      const vrm = currentVrmRef.current;
      if (vrm) {
        // External VRM Model active
        vrm.update(delta);

        // Drive VRM expression manager with our 12 moods
        if (vrm.expressionManager) {
          const isHappy = st.mood === 'happy' || st.mood === 'cheerful' || st.mood === 'playful';
          const isSurprised = st.mood === 'surprised' || st.mood === 'curious';
          vrm.expressionManager.setValue('happy', isHappy ? 0.9 : 0);
          vrm.expressionManager.setValue('surprised', isSurprised ? 0.9 : 0);
          vrm.expressionManager.setValue('blink', blinkTimer > 3.4 ? 1.0 : 0);

          // Visemes
          if (st.isSpeaking) {
            vrm.expressionManager.setValue('aa', st.visemeWeight || 0.7);
          } else {
            vrm.expressionManager.setValue('aa', 0);
          }
          vrm.expressionManager.update();
        }

        // Head tracking for VRM
        const headNode = vrm.humanoid?.getNormalizedBoneNode('head');
        if (headNode) {
          headNode.rotation.y = THREE.MathUtils.damp(headNode.rotation.y, targetGaze.x * 0.8, 4, delta);
          headNode.rotation.x = THREE.MathUtils.damp(headNode.rotation.x, -targetGaze.y * 0.6, 4, delta);
        }
      } else {
        // Built-in Procedural Anime Companion ("Aria")
        // Natural Blinking
        blinkTimer += delta;
        if (blinkTimer > 3.4) {
          leftAnimeEye.lidMesh.scale.y = THREE.MathUtils.damp(leftAnimeEye.lidMesh.scale.y, 1.0, 32, delta);
          rightAnimeEye.lidMesh.scale.y = THREE.MathUtils.damp(rightAnimeEye.lidMesh.scale.y, 1.0, 32, delta);
          if (blinkTimer > 3.65) blinkTimer = 0;
        } else {
          leftAnimeEye.lidMesh.scale.y = THREE.MathUtils.damp(leftAnimeEye.lidMesh.scale.y, 0.01, 24, delta);
          // Playful winking right eye
          const rightLid = st.mood === 'playful' ? 0.95 : 0.01;
          rightAnimeEye.lidMesh.scale.y = THREE.MathUtils.damp(rightAnimeEye.lidMesh.scale.y, rightLid, 24, delta);
        }

        // Smooth Cursor Gaze
        currentGaze.x = THREE.MathUtils.damp(currentGaze.x, targetGaze.x, 4.5, delta);
        currentGaze.y = THREE.MathUtils.damp(currentGaze.y, targetGaze.y, 4.5, delta);
        headGroup.rotation.y = currentGaze.x;
        headGroup.rotation.x = -currentGaze.y;

        // Breathing & Natural Sway
        const breathing = Math.sin(elapsedTime * 1.6) * 0.012;
        torsoGroup.position.y = 0.88 + breathing * 0.5;

        // Hair Ponytails physics sway
        leftPonytail.rotation.z = 0.35 + Math.sin(elapsedTime * 2.2) * 0.03;
        rightPonytail.rotation.z = -0.35 - Math.sin(elapsedTime * 2.2) * 0.03;

        // 12 Distinct Mood Expressions
        let targetTiltZ = 0;
        let targetBrowY = 0.075;
        let targetBrowTilt = 0.08;
        let targetSmileScale = 1.0;
        let targetRimColor = 0xf472b6;

        switch (st.mood) {
          case 'cheerful':
            targetSmileScale = 1.4;
            targetBrowY = 0.088;
            targetTiltZ = 0.08;
            targetRimColor = 0xfbbf24;
            break;
          case 'happy':
            targetSmileScale = 1.25;
            targetBrowY = 0.082;
            targetTiltZ = 0.04;
            targetRimColor = 0x34d399;
            break;
          case 'curious':
            targetTiltZ = -0.16;
            targetBrowY = 0.09;
            targetRimColor = 0x38bdf8;
            break;
          case 'empathetic':
            targetTiltZ = 0.08;
            targetBrowTilt = -0.05;
            targetRimColor = 0xfb7185;
            break;
          case 'playful':
            targetTiltZ = -0.12;
            targetSmileScale = 1.3;
            targetRimColor = 0xec4899;
            break;
          case 'focused':
            targetBrowY = 0.068;
            targetBrowTilt = 0.16;
            targetRimColor = 0x818cf8;
            break;
          case 'thinking':
            targetTiltZ = -0.1;
            targetBrowTilt = 0.14;
            targetRimColor = 0xa855f7;
            break;
          case 'surprised':
            targetBrowY = 0.105;
            targetBrowTilt = 0.0;
            targetSmileScale = 1.2;
            targetRimColor = 0xf59e0b;
            break;
          case 'sleepy':
            targetTiltZ = 0.05;
            leftAnimeEye.lidMesh.scale.y = 0.65;
            targetRimColor = 0x71717a;
            break;
          case 'dance':
            targetSmileScale = 1.35;
            targetRimColor = 0xf43f5e;
            break;
          case 'speaking':
            targetRimColor = 0x06b6d4;
            break;
          default:
            break;
        }

        headGroup.rotation.z = THREE.MathUtils.damp(headGroup.rotation.z, targetTiltZ, 4.5, delta);
        leftBrow.position.y = THREE.MathUtils.damp(leftBrow.position.y, targetBrowY, 6, delta);
        rightBrow.position.y = THREE.MathUtils.damp(rightBrow.position.y, targetBrowY, 6, delta);
        leftBrow.rotation.z = THREE.MathUtils.damp(leftBrow.rotation.z, -targetBrowTilt, 6, delta);
        rightBrow.rotation.z = THREE.MathUtils.damp(rightBrow.rotation.z, targetBrowTilt, 6, delta);
        rimLight.color.lerp(new THREE.Color(targetRimColor), 0.08);

        // Viseme Mouth Opening during speech
        let mouthOpenY = 0.05;
        if (st.isSpeaking || st.visemeWeight > 0.05) {
          mouthOpenY = 0.05 + (st.visemeWeight || 0.6) * 0.95;
        }
        mouthInside.scale.y = THREE.MathUtils.damp(mouthInside.scale.y, mouthOpenY, 18, delta);
        mouthGroup.scale.x = THREE.MathUtils.damp(mouthGroup.scale.x, targetSmileScale, 6, delta);

        // Dancing Kinematics (Lyria Music)
        if (st.isPlayingMusic || st.mood === 'dance') {
          const beat = Math.sin(elapsedTime * 7.5);
          torsoGroup.position.y = 0.88 + breathing * 0.5 + Math.max(0, beat * 0.03);
          torsoGroup.rotation.z = Math.sin(elapsedTime * 3.75) * 0.05;
          leftArmGroup.rotation.z = -0.15 + Math.sin(elapsedTime * 3.75) * 0.15;
          rightArmGroup.rotation.z = 0.15 - Math.sin(elapsedTime * 3.75) * 0.15;
        } else {
          torsoGroup.rotation.z = THREE.MathUtils.damp(torsoGroup.rotation.z, 0, 4, delta);
          leftArmGroup.rotation.z = THREE.MathUtils.damp(leftArmGroup.rotation.z, -0.15, 4, delta);
          rightArmGroup.rotation.z = THREE.MathUtils.damp(rightArmGroup.rotation.z, 0.15, 4, delta);
        }
      }

      // Hologram image projection
      if (st.projectedImage && st.projectedImage !== currentLoadedImage) {
        currentLoadedImage = st.projectedImage;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          holoCtx.drawImage(img, 0, 0, 512, 512);
          holoTexture.needsUpdate = true;
          (holoMesh.material as THREE.MeshBasicMaterial).opacity = 0.95;
        };
        img.src = st.projectedImage;
      } else if (!st.projectedImage && (holoMesh.material as THREE.MeshBasicMaterial).opacity > 0) {
        (holoMesh.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.damp(
          (holoMesh.material as THREE.MeshBasicMaterial).opacity,
          0,
          3,
          delta
        );
      }

      if ((holoMesh.material as THREE.MeshBasicMaterial).opacity > 0.01) {
        holoMesh.position.y = 1.25 + Math.sin(elapsedTime * 1.5) * 0.018;
      }

      renderer.render(scene, camera);
    };

    renderLoop();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', onResize);
      container.removeEventListener('mousemove', onPointerMove);
      container.removeEventListener('click', onClick);
      container.removeEventListener('dragover', onDragOver);
      container.removeEventListener('drop', onDrop);

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      renderer.dispose();
      animeSkinMat.dispose();
      animeHairMat.dispose();
      blazerNavyMat.dispose();
      floorMat.dispose();
      shadowTex.dispose();
      holoTexture.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="w-full h-full relative cursor-grab active:cursor-grabbing select-none"
    />
  );
};
