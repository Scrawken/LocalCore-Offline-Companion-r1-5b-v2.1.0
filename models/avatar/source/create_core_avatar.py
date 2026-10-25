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
    specular = shader.inputs.get("Specular IOR Level")
    if specular:
        specular.default_value = 0.26
    if emission:
        shader.inputs["Emission Color"].default_value = color
        shader.inputs["Emission Strength"].default_value = emission
    return mat


SKIN = material("Skin", (0.79, 0.49, 0.39, 1), 0.0, 0.58)
FACE = material("Face", (0.83, 0.55, 0.44, 1), 0.0, 0.62)
HAIR = material("Hair | midnight teal", (0.012, 0.034, 0.065, 1), 0.0, 0.76)
HAIR_ACCENT = material("Hair | sea glass", (0.055, 0.39, 0.43, 1), 0.0, 0.7)
JACKET = material("Jacket | deep teal", (0.018, 0.065, 0.095, 1), 0.0, 0.78)
JACKET_LIGHT = material("Jacket | blue slate", (0.065, 0.17, 0.2, 1), 0.0, 0.76)
TROUSERS = material("Trousers | ink", (0.035, 0.055, 0.09, 1), 0.0, 0.52)
IVORY = material("Shirt | soft ivory", (0.8, 0.71, 0.58, 1), 0.0, 0.68)
CORAL = material("Accent | warm coral", (0.83, 0.28, 0.2, 1), 0.0, 0.42)
EYE_WHITE = material("Eye | warm white", (0.96, 0.91, 0.83, 1), 0.0, 0.3)
IRIS = material("Eye | sea glass iris", (0.035, 0.48, 0.53, 1), 0.0, 0.28)
PUPIL = material("Eye | deep teal pupil", (0.008, 0.035, 0.06, 1), 0.0, 0.27)
GLINT = material("Eye | catchlight", (1.0, 0.97, 0.88, 1), 0.0, 0.2, 0.35)
LIP = material("Mouth | soft rose", (0.6, 0.16, 0.2, 1), 0.0, 0.42)
BLUSH = material("Cheek | soft rose", (0.83, 0.35, 0.34, 1), 0.0, 0.58)
GOLD = material("Accessory | muted gold", (0.68, 0.39, 0.16, 1), 0.22, 0.32)


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
              segments: int = 24, rings: int = 16,
              rotation: tuple[float, float, float] = (0, 0, 0)) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.rotation_euler = rotation
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


def hair_tuft(name: str, points: list[tuple[float, float, float]], widths: list[float],
              mat: bpy.types.Material, armature: bpy.types.Object) -> bpy.types.Object:
    """Create a curved, tapered hair lock from elliptical rings."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    ring_segments = 12
    controls = [Vector(point) for point in points]
    vectors: list[Vector] = []
    radii: list[float] = []
    subdivisions = 6
    for segment in range(len(controls) - 1):
        p0 = controls[max(0, segment - 1)]
        p1 = controls[segment]
        p2 = controls[segment + 1]
        p3 = controls[min(len(controls) - 1, segment + 2)]
        for step in range(subdivisions):
            t = step / subdivisions
            t2 = t * t
            t3 = t2 * t
            point = 0.5 * ((2 * p1) + (-p0 + p2) * t +
                           (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                           (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            vectors.append(point)
            radii.append(widths[segment] * (1 - t) + widths[segment + 1] * t)
    vectors.append(controls[-1])
    radii.append(widths[-1])
    for index, point in enumerate(vectors):
        tangent = (vectors[min(index + 1, len(vectors) - 1)] -
                   vectors[max(index - 1, 0)]).normalized()
        front = Vector((0, -1, 0))
        front -= tangent * front.dot(tangent)
        if front.length < 0.001:
            front = Vector((1, 0, 0))
            front -= tangent * front.dot(tangent)
        front.normalize()
        side = tangent.cross(front).normalized()
        for segment in range(ring_segments):
            angle = 2 * math.pi * segment / ring_segments
            vertex = point + side * (math.cos(angle) * radii[index]) + \
                front * (math.sin(angle) * radii[index] * 0.42)
            vertices.append(tuple(vertex))
    for ring in range(len(vectors) - 1):
        for segment in range(ring_segments):
            current = ring * ring_segments + segment
            next_segment = ring * ring_segments + (segment + 1) % ring_segments
            faces.append((current, next_segment, next_segment + ring_segments, current + ring_segments))
    tip_index = len(vertices)
    vertices.append(tuple(vectors[-1] + (vectors[-1] - vectors[-2]).normalized() * 0.008))
    last_ring = (len(vectors) - 1) * ring_segments
    for segment in range(ring_segments):
        faces.append((last_ring + segment, last_ring + (segment + 1) % ring_segments, tip_index))

    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return bind_to_bone(obj, "Head", armature)


def torso_mesh(name: str, profile: list[tuple[float, float, float]],
               mat: bpy.types.Material, armature: bpy.types.Object) -> bpy.types.Object:
    """Build a softly tapered jacket body from elliptical horizontal rings."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    segments = 32
    for z, width, depth in profile:
        for segment in range(segments):
            angle = 2 * math.pi * segment / segments
            vertices.append((math.cos(angle) * width, math.sin(angle) * depth, z))
    for ring in range(len(profile) - 1):
        for segment in range(segments):
            current = ring * segments + segment
            next_segment = ring * segments + (segment + 1) % segments
            faces.append((current, next_segment, next_segment + segments, current + segments))
    faces.append(tuple(reversed(range(segments))))
    faces.append(tuple((len(profile) - 1) * segments + i for i in range(segments)))

    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return bind_to_bone(obj, "Chest", armature)


def limb_tube(name: str,
              profile: list[tuple[tuple[float, float, float], float, float, float]],
              upper_bone: str, lower_bone: str,
              mat: bpy.types.Material, armature: bpy.types.Object) -> bpy.types.Object:
    """Make a continuous tapered limb and blend its vertices across the joint."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    ring_segments = 20
    centers = [Vector(item[0]) for item in profile]
    for index, (_center, width, depth, _upper_weight) in enumerate(profile):
        center = centers[index]
        tangent = (centers[min(index + 1, len(centers) - 1)] -
                   centers[max(index - 1, 0)]).normalized()
        front = Vector((0, -1, 0))
        front -= tangent * front.dot(tangent)
        if front.length < 0.001:
            front = Vector((1, 0, 0))
            front -= tangent * front.dot(tangent)
        front.normalize()
        side = tangent.cross(front).normalized()
        for segment in range(ring_segments):
            angle = 2 * math.pi * segment / ring_segments
            vertex = center + side * (math.cos(angle) * width) + front * (math.sin(angle) * depth)
            vertices.append(tuple(vertex))
    for ring in range(len(profile) - 1):
        for segment in range(ring_segments):
            current = ring * ring_segments + segment
            next_segment = ring * ring_segments + (segment + 1) % ring_segments
            faces.append((current, next_segment, next_segment + ring_segments, current + ring_segments))
    faces.append(tuple(reversed(range(ring_segments))))
    last_ring = (len(profile) - 1) * ring_segments
    faces.append(tuple(last_ring + segment for segment in range(ring_segments)))

    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    upper_group = obj.vertex_groups.new(name=upper_bone)
    lower_group = obj.vertex_groups.new(name=lower_bone)
    for ring, (_center, _width, _depth, upper_weight) in enumerate(profile):
        indexes = list(range(ring * ring_segments, (ring + 1) * ring_segments))
        if upper_weight > 0:
            upper_group.add(indexes, upper_weight, "REPLACE")
        if upper_weight < 1:
            lower_group.add(indexes, 1 - upper_weight, "REPLACE")
    obj.parent = armature
    obj.matrix_parent_inverse = Matrix.Identity(4)
    modifier = obj.modifiers.new("Core humanoid rig", "ARMATURE")
    modifier.object = armature
    return obj


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
        "LeftShoulder": ((0.04, 0, 1.72), (0.36, 0, 1.66), "Chest"),
        "LeftUpperArm": ((0.36, 0, 1.66), (0.68, 0, 1.50), "LeftShoulder"),
        "LeftLowerArm": ((0.68, 0, 1.50), (0.96, 0, 1.34), "LeftUpperArm"),
        "LeftHand": ((0.96, 0, 1.34), (1.12, -0.02, 1.29), "LeftLowerArm"),
        "RightShoulder": ((-0.04, 0, 1.72), (-0.36, 0, 1.66), "Chest"),
        "RightUpperArm": ((-0.36, 0, 1.66), (-0.68, 0, 1.50), "RightShoulder"),
        "RightLowerArm": ((-0.68, 0, 1.50), (-0.96, 0, 1.34), "RightUpperArm"),
        "RightHand": ((-0.96, 0, 1.34), (-1.12, -0.02, 1.29), "RightLowerArm"),
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
    """Create a layered anime-style face with VRM-friendly expression shape keys."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    roles: list[tuple[str, str, float]] = []
    material_indexes: list[int] = []
    # Material order: hair brows, rose mouth, sclera, iris, pupil, eye highlights.

    def face_surface_y(x: float, z: float, depth: float) -> float:
        normalized = 1 - (x / 0.23) ** 2 - ((z - 2.385) / 0.31) ** 2
        return -0.22 * math.sqrt(max(0.08, normalized)) - depth

    def ellipse(cx: float, cy: float, cz: float, rx: float, rz: float,
                role: str, side: str, material_index: int,
                segments: int = 32) -> None:
        center_index = len(vertices)
        vertices.append((cx, face_surface_y(cx, cz, cy), cz))
        roles.append((role, side, 0.0))
        ring = []
        for i in range(segments):
            angle = 2 * math.pi * i / segments
            ring.append(len(vertices))
            x = cx + math.cos(angle) * rx
            z = cz + math.sin(angle) * rz
            vertices.append((x, face_surface_y(x, z, cy), z))
            roles.append((role, side, math.cos(angle)))
        for i in range(segments):
            faces.append((center_index, ring[i], ring[(i + 1) % segments]))
            material_indexes.append(material_index)

    def brow(cx: float, cy: float, cz: float, side: str) -> None:
        # Tapered, softly arched brows that can follow the expression shape keys.
        side_sign = -1 if side == "L" else 1
        xs = [cx - 0.074, cx - 0.026, cx + 0.026, cx + 0.074]
        for i in range(3):
            x0, x1 = xs[i], xs[i + 1]
            t0 = abs(x0 - cx) / 0.074
            t1 = abs(x1 - cx) / 0.074
            z0 = cz + 0.013 * (1 - t0)
            z1 = cz + 0.013 * (1 - t1)
            width = 0.009
            first = len(vertices)
            vertices.extend([
                (x0, face_surface_y(x0, z0 - width, cy), z0 - width),
                (x1, face_surface_y(x1, z1 - width, cy), z1 - width),
                (x1, face_surface_y(x1, z1 + width, cy), z1 + width),
                (x0, face_surface_y(x0, z0 + width, cy), z0 + width),
            ])
            roles.extend([("brow", side, side_sign * t0), ("brow", side, side_sign * t1),
                          ("brow", side, side_sign * t1), ("brow", side, side_sign * t0)])
            faces.append((first, first + 1, first + 2, first + 3))
            material_indexes.append(0)

    # Front is Blender's -Y axis. Each eye has a dark lash line, warm sclera, teal iris, dark pupil,
    # and two catchlights; all layers share eyelid shape keys for natural blinking.
    for side, x in (("L", 0.09), ("R", -0.09)):
        ellipse(x, 0.008, 2.458, 0.069, 0.094, "eye", side, 0)
        ellipse(x, 0.017, 2.458, 0.062, 0.085, "eye", side, 2)
        ellipse(x, 0.027, 2.458, 0.037, 0.054, "eye", side, 3)
        ellipse(x, 0.036, 2.458, 0.02, 0.037, "eye", side, 4)
        ellipse(x - 0.011, 0.044, 2.482, 0.012, 0.018, "eye", side, 5, 20)
        ellipse(x + 0.012, 0.043, 2.438, 0.005, 0.007, "eye", side, 5, 16)
        brow(x, 0.018, 2.625, side)
    ellipse(0, 0.021, 2.292, 0.052, 0.015, "mouth", "C", 1, 28)

    mesh = bpy.data.meshes.new("Core face display geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Core_Face_Display", mesh)
    bpy.context.collection.objects.link(obj)
    for mat in (HAIR, LIP, EYE_WHITE, IRIS, PUPIL, GLINT):
        obj.data.materials.append(mat)
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

    bind_to_bone(obj, "Head", armature)
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
    meta.version = "0.2.0"
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
    bpy.ops.object.camera_add(location=(0.08, -7.8, 2.08))
    camera = bpy.context.object
    camera.name = "Preview camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 3.18
    camera.rotation_euler = (Vector((0, 0, 1.39)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = camera

    for name, location, energy, size in [
        ("Large soft key", (-3.5, -4.2, 5.5), 440, 4.0),
        ("Front fill", (3.2, -2.7, 2.8), 280, 3.0),
        ("Cool rim", (0.3, 2.5, 3.8), 360, 3.0),
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
    scene.world.use_nodes = True
    scene.world.node_tree.nodes.get("Background").inputs["Color"].default_value = (0.42, 0.52, 0.63, 1)
    scene.world.node_tree.nodes.get("Background").inputs["Strength"].default_value = 0.8
    scene.view_settings.view_transform = "AgX"
    scene.render.filepath = str(PREVIEW_PATH)


def main() -> None:
    reset_scene()
    armature = make_rig()

    # Soft, androgynous anime companion: natural face, layered hair, and tailored clothes.
    ellipsoid("Face | head", (0, 0, 2.385), (0.23, 0.22, 0.31), FACE, "Head", armature, 40, 28)
    face = face_display(armature)
    # Hair cap, swept bangs, long side locks, and one sea-glass streak give the face a silhouette.
    ellipsoid("Hair | crown", (0, 0.085, 2.65), (0.245, 0.225, 0.155), HAIR, "Head", armature, 36, 24)
    ellipsoid("Hair | back", (0, 0.125, 2.43), (0.23, 0.16, 0.25), HAIR, "Head", armature, 32, 24)
    hair_tuft("Hair | left fringe", [(-0.18, -0.14, 2.70), (-0.16, -0.215, 2.66), (-0.12, -0.245, 2.61)],
              [0.052, 0.057, 0.002], HAIR, armature)
    hair_tuft("Hair | center fringe", [(-0.07, -0.16, 2.715), (-0.02, -0.225, 2.67), (0.025, -0.245, 2.62)],
              [0.054, 0.058, 0.002], HAIR, armature)
    hair_tuft("Hair | right fringe", [(0.06, -0.16, 2.71), (0.125, -0.215, 2.66), (0.18, -0.235, 2.61)],
              [0.055, 0.057, 0.002], HAIR, armature)
    hair_tuft("Hair | teal streak", [(-0.17, -0.19, 2.69), (-0.145, -0.24, 2.65), (-0.12, -0.253, 2.62)],
              [0.012, 0.01, 0.001], HAIR_ACCENT, armature)
    for side, sign in (("L", 1), ("R", -1)):
        ellipsoid(f"Hair | side lock {side}", (sign * 0.21, -0.035, 2.38),
                  (0.052, 0.071, 0.22), HAIR, "Head", armature,
                  rotation=(0, sign * 0.11, 0))
        ellipsoid(f"Ear {side}", (sign * 0.221, -0.005, 2.39), (0.036, 0.042, 0.064), SKIN, "Head", armature)
        ellipsoid(f"Earring {side}", (sign * 0.238, -0.04, 2.345), (0.014, 0.014, 0.018), GOLD, "Head", armature)
        ellipsoid(f"Blush {side}", (sign * 0.148, -0.16, 2.36), (0.024, 0.009, 0.011), BLUSH, "Head", armature)
    ellipsoid("Nose", (0, -0.224, 2.34), (0.014, 0.016, 0.02), SKIN, "Head", armature, 20, 14)
    ellipsoid("Hair clip", (0.175, -0.191, 2.61), (0.03, 0.012, 0.018), CORAL, "Head", armature, 20, 12)

    # Neck and a soft jacket silhouette with a simple shirt collar and zipper seam.
    capsule("Neck", (0, 0, 1.81), (0, 0, 2.105), 0.115, SKIN, "Neck", armature)
    torso_mesh("Jacket | body", [
        (1.07, 0.25, 0.15), (1.15, 0.27, 0.16), (1.31, 0.26, 0.16),
        (1.49, 0.30, 0.19), (1.66, 0.29, 0.18), (1.77, 0.24, 0.15),
        (1.82, 0.16, 0.12),
    ], JACKET, armature)
    capsule("Shirt collar | left", (-0.09, -0.13, 1.79), (0, -0.201, 1.69),
            0.014, IVORY, "Chest", armature)
    capsule("Shirt collar | right", (0.09, -0.13, 1.79), (0, -0.201, 1.69),
            0.014, IVORY, "Chest", armature)
    capsule("Jacket zipper", (0, -0.197, 1.67), (0, -0.184, 1.18),
            0.006, JACKET_LIGHT, "Chest", armature)
    ellipsoid("Zipper pull", (0, -0.204, 1.57), (0.011, 0.008, 0.018), GOLD, "Chest", armature)
    ellipsoid("Trousers | hips", (0, 0.015, 0.91), (0.25, 0.18, 0.17), TROUSERS, "Hips", armature)

    # A relaxed A-pose keeps the character compatible with a standard humanoid rig.
    for side, sign in (("L", 1), ("R", -1)):
        upper = f"{ 'Left' if sign == 1 else 'Right' }UpperArm"
        lower = f"{ 'Left' if sign == 1 else 'Right' }LowerArm"
        hand = f"{ 'Left' if sign == 1 else 'Right' }Hand"
        limb_tube(f"Sleeve {side}", [
            ((sign * 0.30, 0, 1.70), 0.061, 0.067, 1.0),
            ((sign * 0.40, 0, 1.66), 0.079, 0.074, 1.0),
            ((sign * 0.57, 0, 1.56), 0.076, 0.071, 0.86),
            ((sign * 0.68, 0, 1.50), 0.072, 0.067, 0.5),
            ((sign * 0.82, 0, 1.42), 0.065, 0.061, 0.15),
            ((sign * 0.985, 0, 1.33), 0.056, 0.054, 0.0),
        ], upper, lower, JACKET, armature)
        ellipsoid(f"Palm {side}", (sign * 1.025, -0.012, 1.32), (0.075, 0.052, 0.064), SKIN, hand, armature)
        for finger_index, z_offset in enumerate((0.047, 0.016, -0.016, -0.044)):
            length = (0.087, 0.108, 0.101, 0.078)[finger_index]
            start_x = sign * 1.07
            end_x = sign * (1.07 + length)
            finger_z = 1.32 + z_offset
            capsule(f"Finger {finger_index + 1} {side}", (start_x, -0.018, finger_z),
                    (end_x, -0.018, finger_z - 0.035), 0.014, SKIN, hand, armature)
        capsule(f"Thumb {side}", (sign * 1.025, -0.022, 1.285),
                (sign * 1.084, -0.022, 1.236), 0.019, SKIN, hand, armature)

    # Trousers and simple ankle boots.
    for side, sign in (("L", 1), ("R", -1)):
        prefix = "Left" if sign == 1 else "Right"
        limb_tube(f"Trousers {side}", [
            ((sign * 0.155, 0, 0.88), 0.12, 0.132, 1.0),
            ((sign * 0.165, 0, 0.75), 0.121, 0.129, 1.0),
            ((sign * 0.18, 0, 0.61), 0.112, 0.12, 0.82),
            ((sign * 0.19, 0, 0.50), 0.106, 0.112, 0.5),
            ((sign * 0.19, 0, 0.42), 0.103, 0.105, 0.18),
            ((sign * 0.19, 0.005, 0.145), 0.087, 0.092, 0.0),
        ], prefix + "UpperLeg", prefix + "LowerLeg", TROUSERS, armature)
        ellipsoid(f"Boot {side}", (sign * 0.19, -0.13, 0.095), (0.13, 0.22, 0.095), IVORY, prefix + "Foot", armature)
        rounded_box(f"Boot sole {side}", (sign * 0.19, -0.15, 0.026), (0.118, 0.195, 0.024), 0.018, TROUSERS, prefix + "Foot", armature)

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
