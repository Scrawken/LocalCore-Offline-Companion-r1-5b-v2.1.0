"""Build LocalCore's original anime human companion and export VRM 1.0.

Run with Blender 5.2 and the VRM Add-on enabled:
    blender --background --python models/avatar/source/create_core_avatar_v3.py
"""

from __future__ import annotations

import importlib
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "models" / "avatar"
BLEND_PATH = OUT / "LocalCore-Core.blend"
VRM_PATH = OUT / "LocalCore-Core.vrm"
PREVIEW_PATH = OUT / "LocalCore-Core-preview.png"


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
        for datablock in list(collection):
            if datablock.users == 0:
                collection.remove(datablock)


def make_material(name: str, color: tuple[float, float, float, float], roughness: float = 0.62,
                  metallic: float = 0.0, emission: float = 0.0) -> bpy.types.Material:
    result = bpy.data.materials.new(name)
    result.diffuse_color = color
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    specular = shader.inputs.get("Specular IOR Level")
    if specular:
        specular.default_value = 0.28
    if emission:
        shader.inputs["Emission Color"].default_value = color
        shader.inputs["Emission Strength"].default_value = emission
    return result


# A new warm, relaxed palette: chestnut, forest, ivory, and copper.
SKIN = make_material("Skin | warm porcelain", (0.72, 0.43, 0.32, 1), 0.68)
HAIR = make_material("Hair | roasted chestnut", (0.075, 0.028, 0.025, 1), 0.5)
HAIR_LIGHT = make_material("Hair | copper sheen", (0.38, 0.13, 0.055, 1), 0.48)
HAIR_DARK = make_material("Hair | deep umber", (0.035, 0.018, 0.023, 1), 0.62)
JACKET = make_material("Jacket | forest green", (0.028, 0.15, 0.12, 1), 0.72)
JACKET_LIGHT = make_material("Jacket | moss lining", (0.12, 0.30, 0.23, 1), 0.66)
SHIRT = make_material("Shirt | soft ivory", (0.86, 0.77, 0.62, 1), 0.7)
TROUSERS = make_material("Trousers | charcoal slate", (0.075, 0.092, 0.12, 1), 0.76)
BOOT = make_material("Boots | dark leather", (0.12, 0.065, 0.05, 1), 0.53)
SOLE = make_material("Boot soles | warm graphite", (0.055, 0.06, 0.067, 1), 0.82)
COPPER = make_material("Hardware | brushed copper", (0.63, 0.31, 0.12, 1), 0.33, 0.42)
EYE_WHITE = make_material("Eyes | warm white", (0.96, 0.91, 0.82, 1), 0.32)
IRIS = make_material("Eyes | jade iris", (0.035, 0.34, 0.27, 1), 0.28, 0.08)
IRIS_INNER = make_material("Eyes | amber inner ring", (0.52, 0.28, 0.09, 1), 0.33)
PUPIL = make_material("Eyes | deep pupil", (0.018, 0.031, 0.027, 1), 0.24)
GLINT = make_material("Eyes | catchlight", (1, 0.97, 0.88, 1), 0.19, emission=0.12)
LASH = make_material("Face | soft umber details", (0.09, 0.038, 0.03, 1), 0.58)
LIP = make_material("Face | rosewood lips", (0.44, 0.12, 0.13, 1), 0.56)
BLUSH = make_material("Face | subtle blush", (0.64, 0.25, 0.23, 1), 0.7)


def attach(obj: bpy.types.Object, bone: str, rig: bpy.types.Object) -> bpy.types.Object:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.transform(obj.matrix_world)
    obj.location = (0, 0, 0)
    obj.rotation_euler = (0, 0, 0)
    obj.scale = (1, 1, 1)
    obj.parent = rig
    obj.matrix_parent_inverse = Matrix.Identity(4)
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    modifier = obj.modifiers.new("LocalCore humanoid rig", "ARMATURE")
    modifier.object = rig
    obj.select_set(False)
    return obj


def mesh_object(name: str, vertices: list[tuple[float, float, float]],
                faces: list[tuple[int, ...]], material: bpy.types.Material,
                bone: str, rig: bpy.types.Object, smooth: bool = True) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    if smooth:
        for polygon in mesh.polygons:
            polygon.use_smooth = True
    return attach(obj, bone, rig)


def ellipsoid(name: str, center: tuple[float, float, float], scale: tuple[float, float, float],
              material: bpy.types.Material, bone: str, rig: bpy.types.Object,
              segments: int = 32, rings: int = 24,
              rotation: tuple[float, float, float] = (0, 0, 0)) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.rotation_euler = rotation
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return attach(obj, bone, rig)


def capsule(name: str, start: tuple[float, float, float], end: tuple[float, float, float],
            radius: float, material: bpy.types.Material, bone: str,
            rig: bpy.types.Object, depth_ratio: float = 1.0) -> bpy.types.Object:
    a, b = Vector(start), Vector(end)
    direction = b - a
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=14, location=(a + b) * 0.5)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(direction.normalized())
    obj.scale = (radius, radius * depth_ratio, direction.length * 0.5 + radius * 0.45)
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return attach(obj, bone, rig)


def torso(name: str, profile: list[tuple[float, float, float, float]], material: bpy.types.Material,
          bone: str, rig: bpy.types.Object, segments: int = 40) -> bpy.types.Object:
    """Elliptical cross sections shaped into a fitted, softly tailored garment."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, width, depth, y_center in profile:
        for i in range(segments):
            angle = 2 * math.pi * i / segments
            vertices.append((math.cos(angle) * width, y_center + math.sin(angle) * depth, z))
    for ring in range(len(profile) - 1):
        for i in range(segments):
            a = ring * segments + i
            b = ring * segments + (i + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    faces.append(tuple(reversed(range(segments))))
    faces.append(tuple((len(profile) - 1) * segments + i for i in range(segments)))
    return mesh_object(name, vertices, faces, material, bone, rig)


def limb(name: str, profile: list[tuple[tuple[float, float, float], float, float, float]],
         upper_bone: str, lower_bone: str, material: bpy.types.Material,
         rig: bpy.types.Object, segments: int = 24) -> bpy.types.Object:
    """Swept elliptical limb with weights blended through the elbow or knee."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    centers = [Vector(item[0]) for item in profile]
    for index, (center_raw, width, depth, _upper) in enumerate(profile):
        center = centers[index]
        tangent = (centers[min(index + 1, len(centers) - 1)] -
                   centers[max(index - 1, 0)]).normalized()
        front = Vector((0, -1, 0))
        front -= tangent * front.dot(tangent)
        if front.length < 1e-5:
            front = Vector((1, 0, 0))
            front -= tangent * front.dot(tangent)
        front.normalize()
        side = tangent.cross(front).normalized()
        for ring_i in range(segments):
            angle = 2 * math.pi * ring_i / segments
            point = center + side * (math.cos(angle) * width) + front * (math.sin(angle) * depth)
            vertices.append(tuple(point))
    for ring in range(len(profile) - 1):
        for i in range(segments):
            a = ring * segments + i
            b = ring * segments + (i + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    faces.append(tuple(reversed(range(segments))))
    last = (len(profile) - 1) * segments
    faces.append(tuple(last + i for i in range(segments)))
    obj = mesh_object(name, vertices, faces, material, upper_bone, rig)
    upper = obj.vertex_groups.get(upper_bone)
    lower = obj.vertex_groups.new(name=lower_bone)
    # mesh_object attached all vertices to the upper bone; replace with smooth ring weights.
    for ring, (_center, _width, _depth, upper_weight) in enumerate(profile):
        indexes = list(range(ring * segments, (ring + 1) * segments))
        upper.remove(indexes)
        if upper_weight > 0:
            upper.add(indexes, upper_weight, "REPLACE")
        if upper_weight < 1:
            lower.add(indexes, 1 - upper_weight, "REPLACE")
    return obj


def hair_lock(name: str, points: list[tuple[float, float, float]], widths: list[float],
              material: bpy.types.Material, rig: bpy.types.Object) -> bpy.types.Object:
    """Smooth, tapered hair ribbon with rounded depth and a shaped tip."""
    controls = [Vector(p) for p in points]
    path: list[Vector] = []
    radii: list[float] = []
    steps = 5
    for i in range(len(controls) - 1):
        p0, p1 = controls[max(0, i - 1)], controls[i]
        p2, p3 = controls[i + 1], controls[min(len(controls) - 1, i + 2)]
        for j in range(steps):
            t = j / steps
            t2, t3 = t * t, t * t * t
            p = 0.5 * ((2 * p1) + (-p0 + p2) * t +
                       (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                       (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            path.append(p)
            radii.append(widths[i] * (1 - t) + widths[i + 1] * t)
    path.append(controls[-1])
    radii.append(widths[-1])
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    sides = 12
    for i, point in enumerate(path):
        tangent = (path[min(i + 1, len(path) - 1)] - path[max(0, i - 1)]).normalized()
        front = Vector((0, -1, 0))
        front -= tangent * front.dot(tangent)
        if front.length < 0.001:
            front = Vector((1, 0, 0))
            front -= tangent * front.dot(tangent)
        front.normalize()
        side = tangent.cross(front).normalized()
        for j in range(sides):
            theta = 2 * math.pi * j / sides
            v = point + side * (math.cos(theta) * radii[i]) + front * (math.sin(theta) * radii[i] * 0.48)
            vertices.append(tuple(v))
    for ring in range(len(path) - 1):
        for j in range(sides):
            a = ring * sides + j
            b = ring * sides + (j + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    last = (len(path) - 1) * sides
    tip = len(vertices)
    vertices.append(tuple(path[-1] + (path[-1] - path[-2]).normalized() * 0.006))
    for j in range(sides):
        faces.append((last + j, last + (j + 1) % sides, tip))
    return mesh_object(name, vertices, faces, material, "Head", rig)


def create_rig() -> bpy.types.Object:
    rig_data = bpy.data.armatures.new("LocalCore humanoid skeleton")
    rig = bpy.data.objects.new("Core_Armature", rig_data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    specs = {
        "Hips": ((0, 0, 0.78), (0, 0, 0.99), None),
        "Spine": ((0, 0, 0.99), (0, 0, 1.17), "Hips"),
        "Chest": ((0, 0, 1.17), (0, 0, 1.34), "Spine"),
        "Neck": ((0, 0, 1.34), (0, 0, 1.46), "Chest"),
        "Head": ((0, 0, 1.46), (0, 0, 1.73), "Neck"),
        "LeftShoulder": ((0.015, 0, 1.31), (0.19, 0, 1.28), "Chest"),
        "LeftUpperArm": ((0.19, 0, 1.28), (0.38, 0, 1.18), "LeftShoulder"),
        "LeftLowerArm": ((0.38, 0, 1.18), (0.55, 0, 1.03), "LeftUpperArm"),
        "LeftHand": ((0.55, 0, 1.03), (0.68, -0.01, 0.98), "LeftLowerArm"),
        "RightShoulder": ((-0.015, 0, 1.31), (-0.19, 0, 1.28), "Chest"),
        "RightUpperArm": ((-0.19, 0, 1.28), (-0.38, 0, 1.18), "RightShoulder"),
        "RightLowerArm": ((-0.38, 0, 1.18), (-0.55, 0, 1.03), "RightUpperArm"),
        "RightHand": ((-0.55, 0, 1.03), (-0.68, -0.01, 0.98), "RightLowerArm"),
        "LeftUpperLeg": ((0.105, 0, 0.81), (0.125, 0, 0.45), "Hips"),
        "LeftLowerLeg": ((0.125, 0, 0.45), (0.13, 0, 0.105), "LeftUpperLeg"),
        "LeftFoot": ((0.13, 0, 0.105), (0.13, -0.18, 0.065), "LeftLowerLeg"),
        "LeftToes": ((0.13, -0.18, 0.065), (0.13, -0.30, 0.05), "LeftFoot"),
        "RightUpperLeg": ((-0.105, 0, 0.81), (-0.125, 0, 0.45), "Hips"),
        "RightLowerLeg": ((-0.125, 0, 0.45), (-0.13, 0, 0.105), "RightUpperLeg"),
        "RightFoot": ((-0.13, 0, 0.105), (-0.13, -0.18, 0.065), "RightLowerLeg"),
        "RightToes": ((-0.13, -0.18, 0.065), (-0.13, -0.30, 0.05), "RightFoot"),
    }
    bones: dict[str, bpy.types.EditBone] = {}
    for name, (head, tail, parent_name) in specs.items():
        bone = rig_data.edit_bones.new(name)
        bone.head, bone.tail = head, tail
        bone.use_deform = True
        bones[name] = bone
        if parent_name:
            bone.parent = bones[parent_name]
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.select_set(False)
    return rig


def face_surface_y(x: float, z: float, offset: float = 0.0) -> float:
    rx, ry, rz, cz = 0.128, 0.108, 0.15, 1.61
    normalized = 1 - (x / rx) ** 2 - ((z - cz) / rz) ** 2
    return -ry * math.sqrt(max(0.045, normalized)) - offset


def create_face(rig: bpy.types.Object) -> bpy.types.Object:
    """Curved eye, brow, cheek and mouth overlays with VRM expression keys."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    material_ids: list[int] = []
    roles: list[tuple[str, str, float, float]] = []

    def ellipse(cx: float, cz: float, rx: float, rz: float, offset: float,
                role: str, side: str, mat_id: int, n: int = 32) -> None:
        center = len(vertices)
        vertices.append((cx, face_surface_y(cx, cz, offset), cz))
        roles.append((role, side, 0.0, cz))
        ring: list[int] = []
        for i in range(n):
            a = 2 * math.pi * i / n
            x, z = cx + math.cos(a) * rx, cz + math.sin(a) * rz
            ring.append(len(vertices))
            vertices.append((x, face_surface_y(x, z, offset), z))
            roles.append((role, side, math.cos(a), cz))
        for i in range(n):
            faces.append((center, ring[i], ring[(i + 1) % n]))
            material_ids.append(mat_id)

    def brow(cx: float, cz: float, side: str) -> None:
        # Four tapered points form a softly arched, sculpted brow strip.
        sign = 1 if side == "L" else -1
        first = len(vertices)
        steps = 10
        for i in range(steps + 1):
            t = i / steps
            x = cx + (t - 0.5) * 0.092
            arc = math.sin(math.pi * t) * 0.012
            z = cz + arc
            half = 0.0065 * (0.35 + 0.65 * math.sin(math.pi * t) ** 0.35)
            for zz in (z - half, z + half):
                vertices.append((x, face_surface_y(x, zz, 0.012), zz))
                roles.append(("brow", side, sign * (2 * t - 1), cz))
        for i in range(steps):
            a = first + i * 2
            faces.append((a, a + 1, a + 3, a + 2))
            material_ids.append(0)

    # Large but understated anime eyes, curved to the face instead of floating discs.
    for side, sign in (("L", 1), ("R", -1)):
        x = sign * 0.052
        ellipse(x, 1.625, 0.041, 0.025, 0.005, "eye", side, 0, 36)
        ellipse(x, 1.626, 0.037, 0.021, 0.008, "eye", side, 1, 36)
        ellipse(x + sign * 0.002, 1.625, 0.017, 0.018, 0.014, "eye", side, 2, 32)
        ellipse(x + sign * 0.002, 1.624, 0.0125, 0.014, 0.018, "eye", side, 3, 28)
        ellipse(x + sign * 0.002, 1.623, 0.007, 0.012, 0.022, "eye", side, 4, 28)
        ellipse(x - 0.004, 1.633, 0.0045, 0.006, 0.026, "eye", side, 5, 20)
        ellipse(x + 0.005, 1.616, 0.0022, 0.003, 0.026, "eye", side, 5, 16)
        brow(sign * 0.056, 1.671, side)
        ellipse(sign * 0.082, 1.565, 0.012, 0.004, 0.004, "cheek", side, 6, 24)

    # Gentle nose highlight and a closed smile that can animate to open visemes.
    ellipse(0, 1.588, 0.007, 0.010, 0.007, "nose", "C", 7, 24)
    ellipse(0, 1.548, 0.022, 0.0055, 0.009, "mouth", "C", 8, 32)
    # A lower lip glimmer gives the smile a little volume.
    ellipse(0, 1.543, 0.012, 0.0018, 0.011, "lip", "C", 6, 24)

    mesh = bpy.data.meshes.new("Core face features mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Core_Face_Display", mesh)
    bpy.context.collection.objects.link(obj)
    for mat in (LASH, EYE_WHITE, IRIS, IRIS_INNER, PUPIL, GLINT, BLUSH, SKIN, LIP):
        obj.data.materials.append(mat)
    for polygon, mat_id in zip(mesh.polygons, material_ids):
        polygon.material_index = mat_id
        polygon.use_smooth = True

    obj.shape_key_add(name="Basis")
    shape_names = [
        "Eye_Default", "Eye_WinkA_L", "Eye_WinkA_R", "Eye_WinkB_L", "Eye_WinkB_R",
        "Eye_WinkC_L", "Eye_WinkC_R", "Eye_Wail", "Eye_Ha", "Mouth_Smile01",
        "Mouth_Smile02", "Mouth_Angry01", "Mouth_Open01", "Mouth_A01",
        "Brow_Smily_L", "Brow_Smily_R", "Brow_Trouble_L", "Brow_Trouble_R",
        "Brow_Angry_L", "Brow_Angry_R", "Brow_Up_L", "Brow_Up_R", "なごみ",
    ]
    basis = obj.data.shape_keys.key_blocks["Basis"]
    eye_keys = {"Eye_WinkA_L", "Eye_WinkA_R", "Eye_WinkB_L", "Eye_WinkB_R",
                "Eye_WinkC_L", "Eye_WinkC_R", "Eye_Wail", "Eye_Ha", "なごみ"}
    for key_name in shape_names:
        key = obj.shape_key_add(name=key_name)
        for index, vertex in enumerate(basis.data):
            x, y, z = vertex.co
            role, side, u, center_z = roles[index]
            dx = dz = 0.0
            if role == "eye" and key_name in eye_keys:
                active_side = key_name.endswith("_L") and side == "L" or key_name.endswith("_R") and side == "R"
                if key_name in {"Eye_Wail", "Eye_Ha", "なごみ"} or active_side:
                    amount = -0.91 if "Wink" in key_name else (0.24 if key_name == "Eye_Wail" else -0.25)
                    dz = (z - center_z) * amount
            elif role == "mouth":
                if key_name in {"Mouth_Smile01", "Mouth_Smile02"}:
                    dz = (0.006 if key_name.endswith("01") else 0.011) * abs(u)
                elif key_name == "Mouth_Angry01":
                    dz = -0.006 * abs(u)
                elif key_name in {"Mouth_Open01", "Mouth_A01"}:
                    dz = (z - center_z) * (3.8 if key_name == "Mouth_A01" else 4.8)
            elif role == "brow":
                side_match = key_name.endswith("_L") and side == "L" or key_name.endswith("_R") and side == "R"
                if side_match and key_name.startswith("Brow_Smily"):
                    dz = 0.012 * (1 - abs(u))
                elif side_match and key_name.startswith("Brow_Trouble"):
                    dz = 0.016 * (1 - abs(u)) - 0.007 * abs(u)
                elif side_match and key_name.startswith("Brow_Angry"):
                    dz = -0.018 * (1 - abs(u)) + 0.006 * abs(u)
                elif side_match and key_name.startswith("Brow_Up"):
                    dz = 0.02 * (1 - 0.2 * abs(u))
            key.data[index].co = (x + dx, y, z + dz)
    return attach(obj, "Head", rig)


def add_detail_curve(name: str, points: list[tuple[float, float, float]], radius: float,
                     material: bpy.types.Material, bone: str, rig: bpy.types.Object) -> bpy.types.Object:
    curve = bpy.data.curves.new(name + " curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 16
    curve.bevel_depth = radius
    curve.bevel_resolution = 4
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for bp, point in zip(spline.bezier_points, points):
        bp.co = point
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    return attach(obj, bone, rig)


def create_hair(rig: bpy.types.Object) -> None:
    ellipsoid("Hair | crown", (0, 0.025, 1.735), (0.145, 0.126, 0.088), HAIR, "Head", rig, 40, 28)
    ellipsoid("Hair | nape", (0, 0.064, 1.585), (0.147, 0.086, 0.158), HAIR_DARK, "Head", rig, 36, 24)
    # A natural fringe in several overlapping locks, with a balanced part and copper glints.
    locks = [
        ("Fringe left", [(-0.125, -0.055, 1.78), (-0.105, -0.105, 1.745), (-0.085, -0.12, 1.69)], [0.025, 0.026, 0.001], HAIR),
        ("Fringe center-left", [(-0.07, -0.09, 1.795), (-0.05, -0.12, 1.758), (-0.028, -0.13, 1.705)], [0.027, 0.028, 0.001], HAIR),
        ("Fringe center-right", [(0.006, -0.105, 1.795), (0.03, -0.124, 1.76), (0.05, -0.121, 1.71)], [0.026, 0.028, 0.001], HAIR_LIGHT),
        ("Fringe right", [(0.075, -0.09, 1.783), (0.104, -0.11, 1.747), (0.122, -0.09, 1.695)], [0.025, 0.026, 0.001], HAIR),
        ("Fine copper strand", [(0.025, -0.13, 1.765), (0.048, -0.138, 1.735), (0.063, -0.128, 1.70)], [0.005, 0.004, 0.0008], HAIR_LIGHT),
    ]
    for name, points, widths, material in locks:
        hair_lock("Hair | " + name, points, widths, material, rig)

    # Shoulder-length locks frame both sides of the face and stay clear of the eyes.
    for sign, side in ((1, "L"), (-1, "R")):
        hair_lock(f"Hair | outer side lock {side}", [
            (sign * 0.13, -0.04, 1.74), (sign * 0.153, -0.045, 1.65),
            (sign * 0.16, -0.035, 1.50), (sign * 0.145, -0.025, 1.34),
            (sign * 0.118, -0.02, 1.25),
        ], [0.029, 0.03, 0.027, 0.021, 0.001], HAIR, rig)
        hair_lock(f"Hair | inner side lock {side}", [
            (sign * 0.095, -0.085, 1.74), (sign * 0.125, -0.095, 1.65),
            (sign * 0.135, -0.075, 1.49), (sign * 0.12, -0.055, 1.36),
        ], [0.022, 0.021, 0.019, 0.001], HAIR_LIGHT if sign == 1 else HAIR, rig)
        ellipsoid(f"Ear {side}", (sign * 0.122, -0.006, 1.595), (0.021, 0.02, 0.034), SKIN, "Head", rig, 20, 16)
        # Small matching ear studs, kept subordinate to the face.
        ellipsoid(f"Copper ear stud {side}", (sign * 0.13, -0.022, 1.58), (0.006, 0.005, 0.006), COPPER, "Head", rig, 16, 12)


def create_clothes_and_body(rig: bpy.types.Object) -> None:
    # Tailored jacket torso with a softly shaped waist and broad but natural shoulders.
    torso("Jacket | fitted body", [
        (0.82, 0.174, 0.096, 0.006), (0.88, 0.185, 0.107, 0.006),
        (0.98, 0.172, 0.101, 0.006), (1.10, 0.188, 0.112, 0.005),
        (1.22, 0.211, 0.114, 0.004), (1.31, 0.202, 0.105, 0.004),
        (1.35, 0.15, 0.084, 0.004),
    ], JACKET, "Chest", rig)
    # An inset blouse panel and two overlapping lapels give the upper body real layering.
    torso("Blouse | neckline", [
        (1.105, 0.053, 0.014, -0.106), (1.19, 0.059, 0.014, -0.108),
        (1.29, 0.066, 0.012, -0.102), (1.335, 0.055, 0.01, -0.086),
    ], SHIRT, "Chest", rig, 28)
    # Curved lapel piping, tailored seams, and copper buttons.
    for sign, side in ((1, "L"), (-1, "R")):
        add_detail_curve(f"Jacket lapel edge {side}", [
            (sign * 0.105, -0.123, 1.33), (sign * 0.065, -0.14, 1.275),
            (sign * 0.09, -0.127, 1.205), (sign * 0.15, -0.11, 1.105),
        ], 0.009, JACKET_LIGHT, "Chest", rig)
        add_detail_curve(f"Jacket side seam {side}", [
            (sign * 0.158, -0.072, 1.23), (sign * 0.16, -0.08, 1.08),
            (sign * 0.145, -0.074, 0.91),
        ], 0.003, JACKET_LIGHT, "Chest", rig)
    capsule("Collar | left", (-0.07, -0.10, 1.35), (-0.018, -0.141, 1.29), 0.012, SHIRT, "Chest", rig, 0.48)
    capsule("Collar | right", (0.07, -0.10, 1.35), (0.018, -0.141, 1.29), 0.012, SHIRT, "Chest", rig, 0.48)
    for z in (1.22, 1.16, 1.10, 1.04, 0.98):
        ellipsoid(f"Jacket button {z:.2f}", (0.014, -0.127, z), (0.009, 0.006, 0.009), COPPER, "Chest", rig, 16, 12)
    ellipsoid("Copper leaf brooch", (-0.128, -0.124, 1.288), (0.018, 0.006, 0.009), COPPER, "Chest", rig, 20, 12, (0.0, 0.2, -0.25))

    # Waist, subtle belt, and simple high-rise tailored trousers.
    ellipsoid("Trousers | waist", (0, 0.004, 0.81), (0.177, 0.102, 0.12), TROUSERS, "Hips", rig, 32, 20)
    ellipsoid("Belt | dark leather", (0, -0.005, 0.827), (0.184, 0.108, 0.026), BOOT, "Hips", rig, 32, 16)
    rounded = ellipsoid("Copper belt clasp", (0, -0.116, 0.827), (0.025, 0.008, 0.018), COPPER, "Hips", rig, 20, 12)

    for sign, side in ((1, "L"), (-1, "R")):
        prefix = "Left" if sign == 1 else "Right"
        limb(f"Trousers | leg {side}", [
            ((sign * 0.105, 0.002, 0.80), 0.096, 0.09, 1.0),
            ((sign * 0.12, 0.002, 0.66), 0.087, 0.084, 1.0),
            ((sign * 0.125, 0.002, 0.48), 0.075, 0.076, 0.66),
            ((sign * 0.13, 0.004, 0.43), 0.073, 0.072, 0.48),
            ((sign * 0.13, 0.004, 0.24), 0.062, 0.065, 0.08),
            ((sign * 0.13, -0.004, 0.12), 0.058, 0.06, 0.0),
        ], prefix + "UpperLeg", prefix + "LowerLeg", TROUSERS, rig)
        # A seam line and compact leather boot complete a grounded, casual silhouette.
        add_detail_curve(f"Trouser seam {side}", [
            (sign * 0.12, -0.074, 0.70), (sign * 0.125, -0.064, 0.50),
            (sign * 0.13, -0.056, 0.28),
        ], 0.0022, JACKET_LIGHT, prefix + "UpperLeg", rig)
        ellipsoid(f"Boot {side}", (sign * 0.13, -0.09, 0.075), (0.074, 0.155, 0.066), BOOT, prefix + "Foot", rig, 28, 18)
        ellipsoid(f"Boot sole {side}", (sign * 0.13, -0.085, 0.024), (0.075, 0.16, 0.018), SOLE, prefix + "Foot", rig, 24, 14)
        capsule(f"Boot cuff {side}", (sign * 0.13, -0.005, 0.145), (sign * 0.13, -0.005, 0.19), 0.063, BOOT, prefix + "LowerLeg", rig, 0.92)

    # Open A-pose sleeves with a soft weight transition through the elbows.
    for sign, side in ((1, "L"), (-1, "R")):
        prefix = "Left" if sign == 1 else "Right"
        ellipsoid(f"Shoulder cap {side}", (sign * 0.19, 0.0, 1.285), (0.082, 0.09, 0.069), JACKET, "Chest", rig, 28, 18)
        limb(f"Jacket sleeve {side}", [
            ((sign * 0.18, 0, 1.30), 0.063, 0.066, 1.0),
            ((sign * 0.285, 0, 1.245), 0.064, 0.067, 1.0),
            ((sign * 0.38, 0, 1.18), 0.057, 0.059, 0.55),
            ((sign * 0.46, 0, 1.105), 0.051, 0.054, 0.2),
            ((sign * 0.55, -0.004, 1.025), 0.043, 0.046, 0.0),
        ], prefix + "UpperArm", prefix + "LowerArm", JACKET, rig)
        capsule(f"Ivory cuff {side}", (sign * 0.53, -0.004, 1.045), (sign * 0.57, -0.004, 1.005), 0.043, SHIRT, prefix + "LowerArm", rig, 0.95)
        ellipsoid(f"Palm {side}", (sign * 0.593, -0.003, 0.986), (0.044, 0.032, 0.033), SKIN, prefix + "Hand", rig, 24, 16)
        # Individual fingers remain short and relaxed in the humanoid rest pose.
        for finger, (zoff, length) in enumerate(((0.026, 0.056), (0.009, 0.075), (-0.008, 0.071), (-0.023, 0.054))):
            start = (sign * 0.619, -0.006, 0.986 + zoff)
            end = (sign * (0.619 + length), -0.009, 0.986 + zoff - 0.014)
            capsule(f"Finger {finger + 1} {side}", start, end, 0.0085, SKIN, prefix + "Hand", rig, 0.82)
        capsule(f"Thumb {side}", (sign * 0.59, -0.02, 0.962), (sign * 0.623, -0.022, 0.94), 0.011, SKIN, prefix + "Hand", rig, 0.78)


def create_head_and_neck(rig: bpy.types.Object) -> None:
    # Taper the lower half of the head to make a softer jaw, rather than a sphere.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, location=(0, 0, 1.61))
    head = bpy.context.object
    head.name = "Face | sculpted head"
    head.scale = (0.128, 0.108, 0.15)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for vertex in head.data.vertices:
        z = vertex.co.z / 0.15
        factor = 1.0 - max(0.0, -z) * 0.34
        vertex.co.x *= factor
        vertex.co.y *= 0.96 + max(0.0, -z) * 0.04
    head.data.materials.append(SKIN)
    for polygon in head.data.polygons:
        polygon.use_smooth = True
    attach(head, "Head", rig)
    ellipsoid("Neck", (0, 0.015, 1.415), (0.056, 0.058, 0.075), SKIN, "Neck", rig, 28, 18)
    create_face(rig)
    create_hair(rig)


def configure_vrm(rig: bpy.types.Object, face: bpy.types.Object) -> None:
    importlib.import_module("bl_ext.blender_org.vrm")
    from bl_ext.blender_org.vrm.editor.extension_accessor import get_armature_extension

    extension = get_armature_extension(rig.data)
    extension.spec_version = extension.SPEC_VERSION_VRM1
    humanoid = extension.vrm1.humanoid.human_bones
    mapping = {
        "hips": "Hips", "spine": "Spine", "chest": "Chest", "neck": "Neck", "head": "Head",
        "left_shoulder": "LeftShoulder", "left_upper_arm": "LeftUpperArm",
        "left_lower_arm": "LeftLowerArm", "left_hand": "LeftHand",
        "right_shoulder": "RightShoulder", "right_upper_arm": "RightUpperArm",
        "right_lower_arm": "RightLowerArm", "right_hand": "RightHand",
        "left_upper_leg": "LeftUpperLeg", "left_lower_leg": "LeftLowerLeg",
        "left_foot": "LeftFoot", "left_toes": "LeftToes",
        "right_upper_leg": "RightUpperLeg", "right_lower_leg": "RightLowerLeg",
        "right_foot": "RightFoot", "right_toes": "RightToes",
    }
    for human_bone, bone_name in mapping.items():
        getattr(humanoid, human_bone).node.bone_name = bone_name

    meta = extension.vrm1.meta
    meta.vrm_name = "LocalCore Core"
    meta.version = "0.3.0"
    meta.authors.clear()
    author = meta.authors.add()
    author.value = "LocalCore"
    meta.copyright_information = "Original companion model created for the LocalCore project."
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
    expression_names = ["happy", "sad", "angry", "relaxed", "surprised", "neutral",
                        "aa", "ih", "ou", "ee", "oh", "blink", "blink_left", "blink_right"]
    for name in expression_names:
        getattr(presets, name).morph_target_binds.clear()
    expressions = {
        "neutral": ["Eye_Default"],
        "happy": ["Mouth_Smile01", "Brow_Smily_L", "Brow_Smily_R"],
        "sad": ["Brow_Trouble_L", "Brow_Trouble_R", "Eye_Wail"],
        "angry": ["Brow_Angry_L", "Brow_Angry_R", "Mouth_Angry01"],
        "relaxed": ["なごみ"],
        "surprised": ["Brow_Up_L", "Brow_Up_R", "Mouth_Open01", "Eye_Ha"],
        "aa": ["Mouth_A01"], "ih": ["Mouth_A01"], "ou": ["Mouth_Open01"],
        "ee": ["Mouth_Smile01"], "oh": ["Mouth_Open01"],
        "blink": ["Eye_WinkA_L", "Eye_WinkA_R"],
        "blink_left": ["Eye_WinkA_L"], "blink_right": ["Eye_WinkA_R"],
    }
    for expression_name, keys in expressions.items():
        expression = getattr(presets, expression_name)
        for key in keys:
            bind = expression.morph_target_binds.add()
            bind.node.mesh_object_name = face.name
            bind.index = key
            bind.weight = 1.0
    for name in ("blink", "blink_left", "blink_right"):
        getattr(presets, name).override_blink = "block"
    for name in ("aa", "ih", "ou", "ee", "oh"):
        getattr(presets, name).override_mouth = "block"


def create_stage() -> None:
    bpy.ops.object.camera_add(location=(0.13, -6.0, 1.0))
    camera = bpy.context.object
    camera.name = "Portrait preview camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.42
    camera.rotation_euler = (Vector((0, 0, 0.91)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = camera
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 64
    scene.render.resolution_x = 780
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.047, 0.068, 0.075, 1)
    background.inputs["Strength"].default_value = 0.72
    scene.view_settings.view_transform = "AgX"
    for name, location, energy, size, color in (
        ("Soft key", (-3.2, -4.0, 4.1), 420, 3.2, (1.0, 0.82, 0.67)),
        ("Front fill", (3.0, -3.0, 2.3), 290, 3.5, (0.76, 0.88, 1.0)),
        ("Hair rim", (0.0, 2.5, 3.4), 500, 2.6, (1.0, 0.56, 0.32)),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.data.color = color
        light.rotation_euler = (Vector((0, 0, 0.95)) - light.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(PREVIEW_PATH)


def main() -> None:
    reset_scene()
    rig = create_rig()
    create_clothes_and_body(rig)
    create_head_and_neck(rig)
    face = bpy.data.objects["Core_Face_Display"]
    configure_vrm(rig, face)
    create_stage()

    # Keep the preview embedded in the VRM and in the editable source file.
    bpy.ops.render.render(write_still=True)
    from bl_ext.blender_org.vrm.editor.extension_accessor import get_armature_extension
    get_armature_extension(rig.data).vrm1.meta.thumbnail_image = bpy.data.images.load(str(PREVIEW_PATH), check_existing=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    result = bpy.ops.export_scene.vrm(
        filepath=str(VRM_PATH),
        armature_object_name=rig.name,
        export_invisibles=False,
        export_only_selections=False,
        ignore_warning=True,
    )
    if "FINISHED" not in result or not VRM_PATH.is_file():
        raise RuntimeError(f"VRM export failed: {result}")
    print(f"Created {VRM_PATH} ({VRM_PATH.stat().st_size:,} bytes)")
    print(f"Saved editable scene: {BLEND_PATH}")
    print(f"Saved preview: {PREVIEW_PATH}")


if __name__ == "__main__":
    main()
