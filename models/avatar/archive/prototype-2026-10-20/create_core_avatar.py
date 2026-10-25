"""Build LocalCore's original starter companion model and export a VRM 1.0.

Run with Blender 5.2 and the VRM Add-on for Blender enabled:
    blender --background --python models/avatar/source/create_core_avatar.py
"""

from __future__ import annotations

import importlib
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "models" / "avatar"
OUT.mkdir(parents=True, exist_ok=True)
BLEND_PATH = OUT / "LocalCore-Core.blend"
VRM_PATH = OUT / "LocalCore-Core.vrm"
PREVIEW_PATH = OUT / "LocalCore-Core-preview.png"


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def material(name: str, color: tuple[float, float, float, float], metallic: float = 0.0,
             roughness: float = 0.42, emission: float = 0.0) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emission:
        shader.inputs["Emission Color"].default_value = color
        shader.inputs["Emission Strength"].default_value = emission
    return mat


SHELL = material("Pearl ceramic | warm ivory", (0.78, 0.85, 0.88, 1), 0.46, 0.28)
GRAPHITE = material("Graphite | soft dark alloy", (0.045, 0.075, 0.105, 1), 0.72, 0.3)
JOINT = material("Joint polymer", (0.12, 0.18, 0.22, 1), 0.38, 0.38)
VISOR = material("Obsidian face display", (0.012, 0.028, 0.052, 1), 0.32, 0.2)
CYAN = material("Signal cyan", (0.05, 0.82, 1, 1), 0.18, 0.22, 2.8)
AMBER = material("Warm amber", (1, 0.43, 0.08, 1), 0.32, 0.27, 1.3)
ACCENT = material("Muted blue steel", (0.16, 0.3, 0.39, 1), 0.74, 0.29)


def bind_to_bone(obj: bpy.types.Object, bone_name: str, armature: bpy.types.Object) -> bpy.types.Object:
    """Store geometry in rig space, then give every vertex a stable rigid weight."""
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.transform(obj.matrix_world)
    obj.location = (0, 0, 0)
    obj.rotation_euler = (0, 0, 0)
    obj.scale = (1, 1, 1)
    obj.parent = armature
    obj.matrix_parent_inverse = Matrix.Identity(4)
    group = obj.vertex_groups.new(name=bone_name)
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    modifier = obj.modifiers.new("Core humanoid rig", "ARMATURE")
    modifier.object = armature
    obj.select_set(False)
    return obj


def finish_mesh(obj: bpy.types.Object, mat: bpy.types.Material, bone: str,
                armature: bpy.types.Object, smooth: bool = True) -> bpy.types.Object:
    obj.name = obj.name.replace(".001", "")
    obj.data.name = obj.name + " mesh"
    obj.data.materials.append(mat)
    if smooth:
        for face in obj.data.polygons:
            face.use_smooth = True
    return bind_to_bone(obj, bone, armature)


def ellipsoid(name: str, center: tuple[float, float, float], scale: tuple[float, float, float],
              mat: bpy.types.Material, bone: str, armature: bpy.types.Object,
              segments: int = 24, rings: int = 16) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    return finish_mesh(obj, mat, bone, armature)


def rounded_box(name: str, center: tuple[float, float, float], scale: tuple[float, float, float],
                bevel: float, mat: bpy.types.Material, bone: str,
                armature: bpy.types.Object) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = tuple(value * 2 for value in scale)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel_mod = obj.modifiers.new("Soft manufactured edges", "BEVEL")
    bevel_mod.width = bevel
    bevel_mod.segments = 4
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel_mod.name)
    normal_mod = obj.modifiers.new("Weighted corner normals", "WEIGHTED_NORMAL")
    bpy.ops.object.modifier_apply(modifier=normal_mod.name)
    return finish_mesh(obj, mat, bone, armature, smooth=False)


def capsule(name: str, start: tuple[float, float, float], end: tuple[float, float, float],
            radius: float, mat: bpy.types.Material, bone: str,
            armature: bpy.types.Object) -> bpy.types.Object:
    a, b = Vector(start), Vector(end)
    direction = b - a
    midpoint = (a + b) * 0.5
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, location=midpoint)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(direction.normalized())
    obj.scale = (radius, radius, direction.length * 0.5 + radius * 0.64)
    return finish_mesh(obj, mat, bone, armature)


def make_rig() -> bpy.types.Object:
    rig_data = bpy.data.armatures.new("Core humanoid skeleton")
    rig = bpy.data.objects.new("Core_Armature", rig_data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    bones: dict[str, tuple[tuple[float, float, float], tuple[float, float, float], str | None]] = {
        "Hips": ((0, 0, 0.86), (0, 0, 1.13), None),
        "Spine": ((0, 0, 1.13), (0, 0, 1.44), "Hips"),
        "Chest": ((0, 0, 1.44), (0, 0, 1.76), "Spine"),
        "Neck": ((0, 0, 1.76), (0, 0, 2.08), "Chest"),
        "Head": ((0, 0, 2.08), (0, 0, 2.64), "Neck"),
        "LeftShoulder": ((0.04, 0, 1.72), (0.36, 0, 1.72), "Chest"),
        "LeftUpperArm": ((0.36, 0, 1.72), (0.68, 0, 1.72), "LeftShoulder"),
        "LeftLowerArm": ((0.68, 0, 1.72), (0.96, 0, 1.72), "LeftUpperArm"),
        "LeftHand": ((0.96, 0, 1.72), (1.12, -0.02, 1.72), "LeftLowerArm"),
        "RightShoulder": ((-0.04, 0, 1.72), (-0.36, 0, 1.72), "Chest"),
        "RightUpperArm": ((-0.36, 0, 1.72), (-0.68, 0, 1.72), "RightShoulder"),
        "RightLowerArm": ((-0.68, 0, 1.72), (-0.96, 0, 1.72), "RightUpperArm"),
        "RightHand": ((-0.96, 0, 1.72), (-1.12, -0.02, 1.72), "RightLowerArm"),
        "LeftUpperLeg": ((0.15, 0, 0.88), (0.19, 0, 0.50), "Hips"),
        "LeftLowerLeg": ((0.19, 0, 0.50), (0.19, 0, 0.14), "LeftUpperLeg"),
        "LeftFoot": ((0.19, 0, 0.14), (0.19, -0.25, 0.08), "LeftLowerLeg"),
        "LeftToes": ((0.19, -0.25, 0.08), (0.19, -0.39, 0.075), "LeftFoot"),
        "RightUpperLeg": ((-0.15, 0, 0.88), (-0.19, 0, 0.50), "Hips"),
        "RightLowerLeg": ((-0.19, 0, 0.50), (-0.19, 0, 0.14), "RightUpperLeg"),
        "RightFoot": ((-0.19, 0, 0.14), (-0.19, -0.25, 0.08), "RightLowerLeg"),
        "RightToes": ((-0.19, -0.25, 0.08), (-0.19, -0.39, 0.075), "RightFoot"),
    }
    edit_bones: dict[str, bpy.types.EditBone] = {}
    for name, (head, tail, parent) in bones.items():
        bone = rig_data.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        bone.use_deform = True
        edit_bones[name] = bone
        if parent:
            bone.parent = edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.select_set(False)
    return rig


def face_display(armature: bpy.types.Object) -> bpy.types.Object:
    """Create a single facial mesh with named shape keys for LocalCore expressions."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    roles: list[tuple[str, str, float]] = []
    material_indexes: list[int] = []
    # Material order on this mesh: cyan eyes/brows, amber status mouth.

    def ellipse(cx: float, cy: float, cz: float, rx: float, rz: float,
                role: str, side: str, segments: int = 24, material_index: int = 0) -> None:
        center_index = len(vertices)
        vertices.append((cx, cy, cz))
        roles.append((role, side, 0.0))
        ring = []
        for i in range(segments):
            angle = 2 * math.pi * i / segments
            ring.append(len(vertices))
            vertices.append((cx + math.cos(angle) * rx, cy, cz + math.sin(angle) * rz))
            roles.append((role, side, math.cos(angle)))
        for i in range(segments):
            faces.append((center_index, ring[i], ring[(i + 1) % segments]))
            material_indexes.append(material_index)

    def brow(cx: float, cy: float, cz: float, side: str) -> None:
        # A softly tapered, four-segment LED brow.
        side_sign = -1 if side == "L" else 1
        xs = [cx - 0.09, cx - 0.035, cx + 0.035, cx + 0.09]
        for i in range(3):
            x0, x1 = xs[i], xs[i + 1]
            t0 = abs(x0 - cx) / 0.09
            t1 = abs(x1 - cx) / 0.09
            z0 = cz + 0.015 * (1 - t0)
            z1 = cz + 0.015 * (1 - t1)
            width = 0.012
            first = len(vertices)
            vertices.extend([(x0, cy, z0 - width), (x1, cy, z1 - width),
                             (x1, cy, z1 + width), (x0, cy, z0 + width)])
            roles.extend([("brow", side, side_sign * t0), ("brow", side, side_sign * t1),
                          ("brow", side, side_sign * t1), ("brow", side, side_sign * t0)])
            faces.append((first, first + 1, first + 2, first + 3))
            material_indexes.append(0)

    # Eyes and brows. The face looks toward Blender's -Y front axis.
    for side, x in (("L", 0.145), ("R", -0.145)):
        ellipse(x, -0.468, 2.438, 0.079, 0.118, "eye", side)
        brow(x, -0.469, 2.596, side)
    ellipse(0, -0.476, 2.292, 0.074, 0.014, "mouth", "C", 24, 1)

    mesh = bpy.data.meshes.new("Core face display geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Core_Face_Display", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(CYAN)
    obj.data.materials.append(AMBER)
    for polygon, index in zip(mesh.polygons, material_indexes):
        polygon.material_index = index
        polygon.use_smooth = True

    obj.shape_key_add(name="Basis")
    shape_names = [
        "Eye_Default", "Mouth_Smile01", "Mouth_Smile02", "Brow_Smily_L", "Brow_Smily_R",
        "Brow_Trouble_L", "Brow_Trouble_R", "Eye_Wail", "Brow_Angry_L", "Brow_Angry_R",
        "Mouth_Angry01", "Brow_Up_L", "Brow_Up_R", "Mouth_Open01", "Eye_Ha", "Mouth_A01",
        "Eye_WinkA_L", "Eye_WinkA_R", "Eye_WinkB_L", "Eye_WinkB_R", "Eye_WinkC_L",
        "Eye_WinkC_R", "なごみ",
    ]
    basis = obj.data.shape_keys.key_blocks["Basis"]
    for key_name in shape_names:
        key = obj.shape_key_add(name=key_name)
        for index, co in enumerate(basis.data):
            x, y, z = co.co
            role, side, u = roles[index]
            dx = dz = 0.0
            if role == "mouth":
                if key_name in {"Mouth_Smile01", "Mouth_Smile02"}:
                    dx = x * (0.22 if key_name.endswith("01") else 0.38)
                    dz = (0.032 if key_name.endswith("01") else 0.055) * abs(u)
                elif key_name == "Mouth_Angry01":
                    dx = -x * 0.14
                    dz = -0.036 * abs(u)
                elif key_name in {"Mouth_Open01", "Mouth_A01"}:
                    dx = x * (0.08 if key_name == "Mouth_A01" else 0.03)
                    dz = (z - 2.292) * (3.6 if key_name == "Mouth_A01" else 4.4)
            elif role == "eye":
                wink_side = key_name[-1:] if "Wink" in key_name else ""
                if (key_name.startswith("Eye_Wink") and wink_side == side):
                    dz = (z - 2.438) * -0.88
                elif key_name == "Eye_Wail":
                    dz = (z - 2.438) * 0.32
                elif key_name in {"Eye_Ha", "なごみ"}:
                    dz = (z - 2.438) * (0.2 if key_name == "Eye_Ha" else -0.34)
            elif role == "brow":
                side_key = key_name.endswith("_L") and side == "L" or key_name.endswith("_R") and side == "R"
                if side_key and key_name.startswith("Brow_Smily"):
                    dz = 0.035 * (1 - abs(u))
                elif side_key and key_name.startswith("Brow_Trouble"):
                    dz = 0.04 * (1 - abs(u)) - 0.018 * abs(u)
                elif side_key and key_name.startswith("Brow_Angry"):
                    # Lower the inside edge on each brow.
                    dz = -0.055 * (1 - abs(u)) + 0.012 * abs(u)
                elif side_key and key_name.startswith("Brow_Up"):
                    dz = 0.055 * (1 - 0.25 * abs(u))
                elif key_name == "Eye_Ha":
                    dz = 0.018 * (1 - abs(u))
            key.data[index].co = (x + dx, y, z + dz)

    finish_mesh(obj, VISOR, "Head", armature)
    # finish_mesh appends a material after our two slots; remove the redundant slot.
    obj.data.materials.pop(index=2)
    return obj


def set_morph_bind(expression: bpy.types.PropertyGroup, mesh: bpy.types.Object, key_name: str) -> None:
    bind = expression.morph_target_binds.add()
    bind.node.mesh_object_name = mesh.name
    bind.index = key_name
    bind.weight = 1.0


def configure_vrm(armature: bpy.types.Object, face: bpy.types.Object) -> None:
    # Blender 4.2+ exposes installed extensions under bl_ext.<repository>.<id>.
    importlib.import_module("bl_ext.blender_org.vrm")
    from bl_ext.blender_org.vrm.editor.extension_accessor import get_armature_extension

    extension = get_armature_extension(armature.data)
    extension.spec_version = extension.SPEC_VERSION_VRM1
    humanoid = extension.vrm1.humanoid.human_bones
    mappings = {
        "hips": "Hips", "spine": "Spine", "chest": "Chest", "neck": "Neck", "head": "Head",
        "left_shoulder": "LeftShoulder", "left_upper_arm": "LeftUpperArm",
        "left_lower_arm": "LeftLowerArm", "left_hand": "LeftHand",
        "right_shoulder": "RightShoulder", "right_upper_arm": "RightUpperArm",
        "right_lower_arm": "RightLowerArm", "right_hand": "RightHand",
        "left_upper_leg": "LeftUpperLeg", "left_lower_leg": "LeftLowerLeg", "left_foot": "LeftFoot",
        "left_toes": "LeftToes", "right_upper_leg": "RightUpperLeg",
        "right_lower_leg": "RightLowerLeg", "right_foot": "RightFoot", "right_toes": "RightToes",
    }
    for human_bone, blender_bone in mappings.items():
        getattr(humanoid, human_bone).node.bone_name = blender_bone

    meta = extension.vrm1.meta
    meta.vrm_name = "LocalCore Core"
    meta.version = "0.1.0"
    meta.authors.clear()
    author = meta.authors.add()
    author.value = "LocalCore"
    meta.copyright_information = "Original starter companion model created for the LocalCore project."
    meta.avatar_permission = "everyone"
    meta.commercial_usage = "corporation"
    meta.credit_notation = "unnecessary"
    meta.allow_redistribution = True
    meta.modification = "allowModificationRedistribution"
    meta.allow_excessively_violent_usage = False
    meta.allow_excessively_sexual_usage = False
    meta.allow_political_or_religious_usage = False
    meta.allow_antisocial_or_hate_usage = False

    presets = extension.vrm1.expressions.preset
    for name in ["happy", "sad", "angry", "relaxed", "surprised", "neutral", "aa", "ih", "ou", "ee", "oh", "blink", "blink_left", "blink_right"]:
        getattr(presets, name).morph_target_binds.clear()
    assignments = {
        "neutral": ["Eye_Default"],
        "happy": ["Mouth_Smile01", "Brow_Smily_L", "Brow_Smily_R"],
        "sad": ["Brow_Trouble_L", "Brow_Trouble_R", "Eye_Wail"],
        "angry": ["Brow_Angry_L", "Brow_Angry_R", "Mouth_Angry01"],
        "relaxed": ["なごみ"],
        "surprised": ["Brow_Up_L", "Brow_Up_R", "Mouth_Open01", "Eye_Ha"],
        "aa": ["Mouth_A01"],
        "ih": ["Mouth_A01"],
        "ou": ["Mouth_Open01"],
        "ee": ["Mouth_Smile01"],
        "oh": ["Mouth_Open01"],
        "blink": ["Eye_WinkA_L", "Eye_WinkA_R"],
        "blink_left": ["Eye_WinkA_L"],
        "blink_right": ["Eye_WinkA_R"],
    }
    for preset_name, keys in assignments.items():
        expression = getattr(presets, preset_name)
        for key in keys:
            set_morph_bind(expression, face, key)
    for name in ["blink", "blink_left", "blink_right"]:
        getattr(presets, name).override_blink = "block"
    for name in ["aa", "ih", "ou", "ee", "oh"]:
        getattr(presets, name).override_mouth = "block"


def create_stage() -> None:
    bpy.ops.object.camera_add(location=(0.08, -7.2, 2.05))
    camera = bpy.context.object
    camera.name = "Preview camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 3.15
    camera.rotation_euler = (Vector((0, 0, 1.34)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = camera

    for name, location, energy, size in [
        ("Large soft key", (-3.5, -4.2, 5.5), 480, 4.0),
        ("Front fill", (3.2, -2.7, 2.8), 260, 3.0),
        ("Cool rim", (0.3, 2.5, 3.8), 520, 3.0),
    ]:
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.rotation_euler = (Vector((0, 0, 1.35)) - light.location).to_track_quat("-Z", "Y").to_euler()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.055, 0.075, 0.1)
    scene.view_settings.view_transform = "AgX"
    scene.render.filepath = str(PREVIEW_PATH)


def main() -> None:
    reset_scene()
    armature = make_rig()

    # Head, face shell, and the layered display are intentionally clean and readable at chat size.
    ellipsoid("Head shell", (0, 0, 2.38), (0.365, 0.31, 0.435), SHELL, "Head", armature, 32, 24)
    ellipsoid("Dark face visor", (0, -0.275, 2.385), (0.322, 0.102, 0.316), GRAPHITE, "Head", armature, 32, 24)
    rounded_box("Visor glass", (0, -0.365, 2.40), (0.255, 0.035, 0.215), 0.09, VISOR, "Head", armature)
    face = face_display(armature)
    # Temple lights sit just outside the display and use the same recognizable cyan signal color.
    for side, x in (("L", 0.298), ("R", -0.298)):
        ellipsoid(f"Temple signal {side}", (x, -0.333, 2.39), (0.018, 0.025, 0.15), CYAN, "Head", armature, 16, 12)
    ellipsoid("Amber crown marker", (0, -0.055, 2.805), (0.057, 0.07, 0.068), AMBER, "Head", armature)

    # Neck and compact chest housing.
    capsule("Neck housing", (0, 0, 1.79), (0, 0, 2.13), 0.155, JOINT, "Neck", armature)
    ellipsoid("Torso core", (0, 0, 1.43), (0.39, 0.255, 0.47), GRAPHITE, "Chest", armature)
    rounded_box("Front chest shell", (0, -0.217, 1.48), (0.315, 0.083, 0.34), 0.09, SHELL, "Chest", armature)
    rounded_box("Chest inset", (0, -0.31, 1.51), (0.205, 0.027, 0.226), 0.055, ACCENT, "Chest", armature)
    ellipsoid("Core light bezel", (0, -0.345, 1.52), (0.102, 0.03, 0.115), GRAPHITE, "Chest", armature)
    ellipsoid("Core light", (0, -0.371, 1.52), (0.055, 0.018, 0.075), CYAN, "Chest", armature)
    ellipsoid("Amber status light", (0, -0.337, 1.245), (0.027, 0.018, 0.027), AMBER, "Chest", armature)
    ellipsoid("Pelvis shell", (0, 0.005, 0.89), (0.29, 0.225, 0.21), SHELL, "Hips", armature)
    rounded_box("Belt band", (0, -0.186, 0.905), (0.205, 0.043, 0.052), 0.025, ACCENT, "Hips", armature)

    # Arms: softly armored shells, exposed dark joints, and broad, mitten-like hands.
    for side, sign in (("L", 1), ("R", -1)):
        shoulder = f"{ 'Left' if sign == 1 else 'Right' }Shoulder"
        upper = f"{ 'Left' if sign == 1 else 'Right' }UpperArm"
        lower = f"{ 'Left' if sign == 1 else 'Right' }LowerArm"
        hand = f"{ 'Left' if sign == 1 else 'Right' }Hand"
        ellipsoid(f"Shoulder cap {side}", (sign * 0.39, 0, 1.72), (0.19, 0.205, 0.18), SHELL, shoulder, armature)
        capsule(f"Upper arm shell {side}", (sign * 0.41, 0, 1.72), (sign * 0.665, 0, 1.72), 0.118, SHELL, upper, armature)
        ellipsoid(f"Elbow joint {side}", (sign * 0.68, 0, 1.72), (0.105, 0.115, 0.11), JOINT, lower, armature)
        capsule(f"Forearm shell {side}", (sign * 0.685, 0, 1.72), (sign * 0.94, 0, 1.72), 0.104, GRAPHITE, lower, armature)
        ellipsoid(f"Wrist cuff {side}", (sign * 0.96, 0, 1.72), (0.065, 0.125, 0.119), ACCENT, hand, armature)
        ellipsoid(f"Hand {side}", (sign * 1.035, -0.015, 1.72), (0.112, 0.132, 0.118), SHELL, hand, armature)
        ellipsoid(f"Palm signal {side}", (sign * 1.035, -0.139, 1.72), (0.035, 0.014, 0.035), CYAN, hand, armature, 16, 12)

    # Legs and low-profile boots. Feet point toward the viewer (-Y).
    for side, sign in (("L", 1), ("R", -1)):
        prefix = "Left" if sign == 1 else "Right"
        capsule(f"Upper leg {side}", (sign * 0.155, 0, 0.87), (sign * 0.19, 0, 0.53), 0.145, SHELL, prefix + "UpperLeg", armature)
        ellipsoid(f"Knee joint {side}", (sign * 0.19, -0.005, 0.49), (0.14, 0.16, 0.115), ACCENT, prefix + "LowerLeg", armature)
        capsule(f"Lower leg {side}", (sign * 0.19, 0.005, 0.45), (sign * 0.19, 0.005, 0.145), 0.111, GRAPHITE, prefix + "LowerLeg", armature)
        ellipsoid(f"Boot {side}", (sign * 0.19, -0.14, 0.095), (0.14, 0.245, 0.105), SHELL, prefix + "Foot", armature)
        rounded_box(f"Boot sole {side}", (sign * 0.19, -0.16, 0.027), (0.125, 0.22, 0.026), 0.02, GRAPHITE, prefix + "Foot", armature)
        ellipsoid(f"Boot signal {side}", (sign * 0.19, -0.359, 0.106), (0.045, 0.018, 0.024), CYAN, prefix + "Toes", armature, 16, 12)

    configure_vrm(armature, face)
    create_stage()

    # Embed the neutral preview in the VRM metadata, the source project, and a standalone PNG.
    bpy.context.scene.render.filepath = str(PREVIEW_PATH)
    bpy.ops.render.render(write_still=True)
    from bl_ext.blender_org.vrm.editor.extension_accessor import get_armature_extension
    get_armature_extension(armature.data).vrm1.meta.thumbnail_image = bpy.data.images.load(str(PREVIEW_PATH), check_existing=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    result = bpy.ops.export_scene.vrm(
        filepath=str(VRM_PATH),
        armature_object_name=armature.name,
        export_invisibles=False,
        export_only_selections=False,
        ignore_warning=True,
    )
    if "FINISHED" not in result or not VRM_PATH.is_file():
        raise RuntimeError(f"VRM export did not finish: {result}")
    print(f"Created {VRM_PATH} ({VRM_PATH.stat().st_size:,} bytes)")
    print(f"Saved editable Blender source: {BLEND_PATH}")
    print(f"Saved preview image: {PREVIEW_PATH}")


if __name__ == "__main__":
    main()
