"""Build LocalCore's adult anime companion and export VRM 1.0.

Run with Blender 5.2 and the VRM Add-on enabled:
    blender --background --python models/avatar/source/create_core_avatar_v4.py

The only third-party mesh foundation is the Blender Studio Human Base Meshes
stylized female body, CC0. Hair, outfit styling, facial features, rig, and VRM
metadata are created in this script.
"""

from __future__ import annotations

import importlib
import math
import os
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


ROOT = Path(__file__).resolve().parents[3]
OUT_BASE = ROOT / "models" / "avatar"
OUT_DIR = Path(os.environ.get("LOCALCORE_AVATAR_OUT_DIR", str(OUT_BASE)))
BASE_MESH_PATH = Path(__file__).resolve().parent / "assets" / "blender_studio_stylized_female_base.blend"
BLEND_PATH = OUT_DIR / "LocalCore-Core.blend"
VRM_PATH = OUT_DIR / "LocalCore-Core.vrm"
PREVIEW_PATH = OUT_DIR / "LocalCore-Core-preview.png"


MATERIALS: dict[str, bpy.types.Material] = {}


def make_material(name: str, color: tuple[float, float, float, float],
                  roughness: float = 0.56, metallic: float = 0.0,
                  emission: float = 0.0) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Specular IOR Level"].default_value = 0.3
    if emission:
        shader.inputs["Emission Color"].default_value = color
        shader.inputs["Emission Strength"].default_value = emission
    MATERIALS[name] = material
    return material


def create_materials() -> None:
    # Warm skin and a dark violet/teal palette echo the reference's energy
    # without using its character mesh, textures, or costume design.
    make_material("Skin | warm rose beige", (0.57, 0.32, 0.26, 1), 0.66)
    make_material("Jacket | midnight violet", (0.055, 0.038, 0.105, 1), 0.49)
    make_material("Jacket | plum panels", (0.14, 0.065, 0.20, 1), 0.51)
    make_material("Top | soft pearl", (0.56, 0.51, 0.49, 1), 0.68)
    make_material("Legwear | graphite", (0.052, 0.065, 0.092, 1), 0.73)
    make_material("Shorts | deep indigo", (0.105, 0.095, 0.22, 1), 0.56)
    make_material("Boots | blue black", (0.035, 0.05, 0.075, 1), 0.48)
    make_material("Trim | sea glass", (0.025, 0.30, 0.25, 1), 0.32, 0.24, 0.025)
    make_material("Hardware | pale copper", (0.62, 0.29, 0.16, 1), 0.32, 0.55)
    make_material("Hair | deep teal", (0.008, 0.055, 0.063, 1), 0.39)
    make_material("Hair | emerald sheen", (0.022, 0.22, 0.18, 1), 0.38)
    make_material("Eyes | warm ivory", (0.94, 0.91, 0.84, 1), 0.26)
    make_material("Eyes | jade rim", (0.015, 0.10, 0.09, 1), 0.27, 0.12)
    make_material("Eyes | jade iris", (0.045, 0.43, 0.32, 1), 0.24, 0.08)
    make_material("Eyes | amber fleck", (0.69, 0.34, 0.12, 1), 0.27, 0.06)
    make_material("Eyes | deep pupil", (0.012, 0.025, 0.035, 1), 0.22)
    make_material("Eyes | catchlight", (1.0, 0.97, 0.87, 1), 0.18, 0, 0.22)
    make_material("Face | brow", (0.065, 0.036, 0.06, 1), 0.56)
    make_material("Face | muted berry", (0.32, 0.095, 0.13, 1), 0.53)
    make_material("Face | lip light", (0.72, 0.32, 0.32, 1), 0.54)


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.cameras,
                       bpy.data.lights, bpy.data.materials, bpy.data.armatures):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def import_base_meshes() -> tuple[bpy.types.Object, bpy.types.Object, bpy.types.Object]:
    if not BASE_MESH_PATH.is_file():
        raise FileNotFoundError(f"Bundled CC0 body mesh is missing: {BASE_MESH_PATH}")
    wanted = {"BaseFemaleBody", "BaseEye_L", "BaseEye_R"}
    with bpy.data.libraries.load(str(BASE_MESH_PATH), link=False) as (source, target):
        available = set(source.objects)
        if not wanted.issubset(available):
            raise RuntimeError(f"Expected base meshes not found in {BASE_MESH_PATH}: {wanted - available}")
        target.objects = sorted(wanted)
    loaded = {obj.name: obj for obj in target.objects if obj is not None}
    for obj in loaded.values():
        bpy.context.scene.collection.objects.link(obj)
    body = loaded["BaseFemaleBody"]
    body.location = (0, 0, 0)
    body.parent = None
    body.data.materials.clear()
    for material in (MATERIALS["Skin | warm rose beige"], MATERIALS["Jacket | midnight violet"],
                     MATERIALS["Jacket | plum panels"], MATERIALS["Top | soft pearl"],
                     MATERIALS["Legwear | graphite"], MATERIALS["Shorts | deep indigo"],
                     MATERIALS["Boots | blue black"], MATERIALS["Trim | sea glass"]):
        body.data.materials.append(material)
    style_body_surface(body)
    for polygon in body.data.polygons:
        polygon.use_smooth = True
    return body, loaded["BaseEye_L"], loaded["BaseEye_R"]


def style_body_surface(body: bpy.types.Object) -> None:
    """Use the clean base topology itself for fitted clothing color blocks."""
    for polygon in body.data.polygons:
        x, y, z = polygon.center
        ax = abs(x)
        material = 0  # skin
        torso_width = 0.18 if z < 0.93 else 0.158 if z < 1.055 else 0.187 if z < 1.21 else 0.205

        if 0.835 <= z <= 1.355 and ax <= torso_width:
            material = 1
        elif 0.985 <= z <= 1.315 and 0.185 < ax < 0.326:
            material = 1
        elif 0.695 <= z < 0.855 and ax < 0.215:
            material = 5
        elif 0.145 <= z < 0.695 and ax < 0.205:
            material = 4
        elif z < 0.145 and ax < 0.235:
            material = 6

        polygon.material_index = material


def create_rig() -> bpy.types.Object:
    rig_data = bpy.data.armatures.new("LocalCore 21-bone humanoid")
    rig = bpy.data.objects.new("Core_Armature", rig_data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    specs = {
        "Hips": ((0, 0, 0.77), (0, 0, 0.94), None),
        "Spine": ((0, 0, 0.94), (0, 0, 1.09), "Hips"),
        "Chest": ((0, 0, 1.09), (0, 0, 1.255), "Spine"),
        "Neck": ((0, 0, 1.255), (0, 0, 1.39), "Chest"),
        "Head": ((0, 0, 1.39), (0, 0, 1.615), "Neck"),
        "LeftShoulder": ((0.08, 0, 1.265), (0.17, 0, 1.235), "Chest"),
        "LeftUpperArm": ((0.17, 0, 1.235), (0.255, 0, 1.17), "LeftShoulder"),
        "LeftLowerArm": ((0.255, 0, 1.17), (0.325, -0.004, 1.065), "LeftUpperArm"),
        "LeftHand": ((0.325, -0.004, 1.065), (0.365, -0.016, 0.98), "LeftLowerArm"),
        "RightShoulder": ((-0.08, 0, 1.265), (-0.17, 0, 1.235), "Chest"),
        "RightUpperArm": ((-0.17, 0, 1.235), (-0.255, 0, 1.17), "RightShoulder"),
        "RightLowerArm": ((-0.255, 0, 1.17), (-0.325, -0.004, 1.065), "RightUpperArm"),
        "RightHand": ((-0.325, -0.004, 1.065), (-0.365, -0.016, 0.98), "RightLowerArm"),
        "LeftUpperLeg": ((0.10, 0, 0.80), (0.118, 0, 0.48), "Hips"),
        "LeftLowerLeg": ((0.118, 0, 0.48), (0.12, 0, 0.115), "LeftUpperLeg"),
        "LeftFoot": ((0.12, 0, 0.115), (0.12, -0.17, 0.055), "LeftLowerLeg"),
        "LeftToes": ((0.12, -0.17, 0.055), (0.12, -0.245, 0.04), "LeftFoot"),
        "RightUpperLeg": ((-0.10, 0, 0.80), (-0.118, 0, 0.48), "Hips"),
        "RightLowerLeg": ((-0.118, 0, 0.48), (-0.12, 0, 0.115), "RightUpperLeg"),
        "RightFoot": ((-0.12, 0, 0.115), (-0.12, -0.17, 0.055), "RightLowerLeg"),
        "RightToes": ((-0.12, -0.17, 0.055), (-0.12, -0.245, 0.04), "RightFoot"),
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


def point_segment_distance(point: Vector, start: Vector, end: Vector) -> float:
    direction = end - start
    length_squared = direction.length_squared
    if length_squared <= 1e-10:
        return (point - start).length
    t = max(0.0, min(1.0, (point - start).dot(direction) / length_squared))
    return (point - (start + t * direction)).length


def manual_weights(body: bpy.types.Object, rig: bpy.types.Object) -> None:
    """Fallback to normalized nearest-bone weights if Blender heat weights fail."""
    for group in list(body.vertex_groups):
        body.vertex_groups.remove(group)
    bone_segments = [(bone.name, bone.head_local.copy(), bone.tail_local.copy())
                     for bone in rig.data.bones if bone.use_deform]
    groups = {name: body.vertex_groups.new(name=name) for name, _head, _tail in bone_segments}
    assignments: dict[str, list[tuple[int, float]]] = {name: [] for name, _head, _tail in bone_segments}
    for vertex in body.data.vertices:
        p = vertex.co
        distances = sorted((point_segment_distance(p, start, end), name)
                           for name, start, end in bone_segments)[:3]
        raw = [1.0 / ((distance + 0.035) ** 3) for distance, _name in distances]
        total = sum(raw)
        for (distance, name), weight in zip(distances, raw):
            normalized = weight / total
            if normalized > 0.025:
                assignments[name].append((vertex.index, normalized))
    for name, members in assignments.items():
        if members:
            indices = [index for index, _weight in members]
            for index, weight in members:
                groups[name].add([index], weight, "REPLACE")
    body.parent = rig
    body.matrix_parent_inverse = rig.matrix_world.inverted()
    modifier = body.modifiers.new("LocalCore humanoid skin", "ARMATURE")
    modifier.object = rig


def weight_body(body: bpy.types.Object, rig: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = rig
    try:
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    except RuntimeError:
        pass
    if len(body.vertex_groups) < 8 or not any(mod.type == "ARMATURE" for mod in body.modifiers):
        manual_weights(body, rig)
    for modifier in body.modifiers:
        if modifier.type == "ARMATURE":
            modifier.object = rig
            modifier.use_deform_preserve_volume = True
    bpy.ops.object.select_all(action="DESELECT")


def limit_joint_influences(body: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.vertex_group_limit_total(limit=4)
    body.select_set(False)


def attach_rigid(obj: bpy.types.Object, bone: str, rig: bpy.types.Object) -> bpy.types.Object:
    """Bake an object's current world transform and rigidly attach it to a bone."""
    bpy.context.view_layer.update()
    matrix_world = obj.matrix_world.copy()
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if obj.type == "CURVE":
        bpy.ops.object.convert(target="MESH")
        obj = bpy.context.object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.transform(obj.matrix_world.copy())
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
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def add_ellipsoid(name: str, center: tuple[float, float, float],
                  scale: tuple[float, float, float], material: bpy.types.Material,
                  bone: str, rig: bpy.types.Object, segments: int = 28,
                  rings: int = 18) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(material)
    obj = attach_rigid(obj, bone, rig)
    return obj


def add_eye_shape_keys(obj: bpy.types.Object, side: str) -> None:
    obj.shape_key_add(name="Basis")
    coordinates = [vertex.co.copy() for vertex in obj.data.vertices]
    center_z = (min(co.z for co in coordinates) + max(co.z for co in coordinates)) * 0.5
    for key_name, factor in ((f"Eye_WinkA_{side}", 0.04),
                             (f"Eye_WinkB_{side}", 0.10),
                             (f"Eye_WinkC_{side}", 0.16),
                             ("Eye_Wail", 1.18), ("Eye_Ha", 0.72), ("なごみ", 0.62)):
        key = obj.shape_key_add(name=key_name)
        for index, co in enumerate(coordinates):
            key.data[index].co = (co.x, co.y, center_z + (co.z - center_z) * factor)


def add_front_surface_accessor(body: bpy.types.Object):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(body, depsgraph)

    def surface_y(x: float, z: float, offset: float = 0.003) -> float:
        origin = Vector((x, -1.2, z))
        hit, _normal, _index, _distance = bvh.ray_cast(origin, Vector((0, 1, 0)), 2.4)
        return (hit.y - offset) if hit else (-0.14 - offset)

    return surface_y


def add_detail_curve(name: str, xz_points: list[tuple[float, float]], radius: float,
                     material: bpy.types.Material, bone: str, rig: bpy.types.Object,
                     surface_y) -> bpy.types.Object:
    curve = bpy.data.curves.new(name + " geometry", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 18
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(xz_points) - 1)
    for point, (x, z) in zip(spline.bezier_points, xz_points):
        point.co = (x, surface_y(x, z, 0.014), z)
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    return attach_rigid(obj, bone, rig)


def create_outfit_details(rig: bpy.types.Object, surface_y) -> None:
    trim = MATERIALS["Trim | sea glass"]
    plum = MATERIALS["Jacket | plum panels"]
    copper = MATERIALS["Hardware | pale copper"]
    # A fitted front inset is sampled against the actual body surface, giving
    # the jacket a clean shape instead of a jagged color patch.
    rows = [(1.285, 0.045), (1.245, 0.054), (1.19, 0.057), (1.13, 0.052), (1.085, 0.043)]
    columns = (-1.0, -0.5, 0.0, 0.5, 1.0)
    vertices = [(width * u, surface_y(width * u, z, 0.008), z)
                for z, width in rows for u in columns]
    faces = []
    for row in range(len(rows) - 1):
        for col in range(len(columns) - 1):
            a = row * len(columns) + col
            faces.append((a, a + 1, a + 1 + len(columns), a + len(columns)))
    panel_mesh = bpy.data.meshes.new("Tailored jacket inset mesh")
    panel_mesh.from_pydata(vertices, [], faces)
    panel_mesh.materials.append(plum)
    panel_mesh.update()
    panel = bpy.data.objects.new("Jacket | fitted front inset", panel_mesh)
    bpy.context.scene.collection.objects.link(panel)
    for polygon in panel_mesh.polygons:
        polygon.use_smooth = True
    attach_rigid(panel, "Chest", rig)

    for sign, side in ((1, "L"), (-1, "R")):
        add_detail_curve(f"Jacket inset piping {side}", [
            (sign * 0.045, 1.285), (sign * 0.054, 1.245),
            (sign * 0.057, 1.19), (sign * 0.052, 1.13), (sign * 0.043, 1.085),
        ], 0.0022, trim, "Chest", rig, surface_y)
    for sign, side in ((1, "L"), (-1, "R")):
        add_detail_curve(f"Jacket lapel stitch {side}", [
            (sign * 0.12, 1.34), (sign * 0.07, 1.28), (sign * 0.045, 1.20),
        ], 0.0042, trim, "Chest", rig, surface_y)
        add_detail_curve(f"Jacket side seam {side}", [
            (sign * 0.165, 1.19), (sign * 0.15, 1.08), (sign * 0.145, 0.93),
        ], 0.0025, plum, "Chest", rig, surface_y)
    add_detail_curve("Jacket center zip", [(0, 1.32), (0, 1.20), (0, 1.08)],
                     0.0028, copper, "Chest", rig, surface_y)
    add_detail_curve("Jacket cropped hem", [(-0.16, 0.87), (-0.08, 0.865),
                                             (0, 0.862), (0.08, 0.865), (0.16, 0.87)],
                     0.003, copper, "Chest", rig, surface_y)
    # Small original diamond badge, a restrained nod to the companion's identity.
    badge_points = [(-0.112, 1.245), (-0.098, 1.265), (-0.084, 1.245), (-0.098, 1.225)]
    vertices = [(x, surface_y(x, z, 0.009), z) for x, z in badge_points]
    mesh = bpy.data.meshes.new("Core badge mesh")
    mesh.from_pydata(vertices, [], [(0, 1, 2), (0, 2, 3)])
    mesh.materials.append(trim)
    badge = bpy.data.objects.new("Core companion badge", mesh)
    bpy.context.scene.collection.objects.link(badge)
    attach_rigid(badge, "Chest", rig)


def hair_lock(name: str, points: list[tuple[float, float, float]], widths: list[float],
              material: bpy.types.Material, rig: bpy.types.Object) -> bpy.types.Object:
    controls = [Vector(point) for point in points]
    path: list[Vector] = []
    radii: list[float] = []
    steps = 6
    for index in range(len(controls) - 1):
        p0, p1 = controls[max(0, index - 1)], controls[index]
        p2, p3 = controls[index + 1], controls[min(len(controls) - 1, index + 2)]
        for step in range(steps):
            t = step / steps
            t2, t3 = t * t, t * t * t
            point = 0.5 * ((2 * p1) + (-p0 + p2) * t +
                           (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                           (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            path.append(point)
            radii.append(widths[index] * (1 - t) + widths[index + 1] * t)
    path.append(controls[-1])
    radii.append(widths[-1])
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    sides = 12
    for index, point in enumerate(path):
        tangent = (path[min(index + 1, len(path) - 1)] - path[max(0, index - 1)]).normalized()
        front = Vector((0, -1, 0))
        front -= tangent * front.dot(tangent)
        if front.length < 1e-5:
            front = Vector((1, 0, 0))
            front -= tangent * front.dot(tangent)
        front.normalize()
        across = tangent.cross(front).normalized()
        for side in range(sides):
            angle = 2 * math.pi * side / sides
            vertex = point + across * (math.cos(angle) * radii[index]) + front * (math.sin(angle) * radii[index] * 0.45)
            vertices.append(tuple(vertex))
    for index in range(len(path) - 1):
        for side in range(sides):
            a = index * sides + side
            b = index * sides + (side + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    last = (len(path) - 1) * sides
    tip = len(vertices)
    vertices.append(tuple(path[-1] + (path[-1] - path[-2]).normalized() * 0.005))
    for side in range(sides):
        faces.append((last + side, last + (side + 1) % sides, tip))
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return attach_rigid(obj, "Head", rig)


def create_hair(rig: bpy.types.Object) -> None:
    deep = MATERIALS["Hair | deep teal"]
    sheen = MATERIALS["Hair | emerald sheen"]
    # Smooth cap with a clipped lower front edge so the forehead stays visible.
    crown = add_ellipsoid("Hair | crown shell", (0, 0.015, 1.50),
                          (0.158, 0.148, 0.128), deep, "Head", rig, 48, 32)
    bm = bmesh.new()
    bm.from_mesh(crown.data)
    lower_front = [face for face in bm.faces
                   if face.calc_center_median().z < 1.525 and face.calc_center_median().y < 0.025]
    if lower_front:
        bmesh.ops.delete(bm, geom=lower_front, context="FACES")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(crown.data)
    bm.free()
    for polygon in crown.data.polygons:
        polygon.use_smooth = True

    # Back bob volume stays behind the face and tapers at the nape.
    nape = add_ellipsoid("Hair | back bob", (0, 0.088, 1.43), (0.137, 0.067, 0.18), deep,
                         "Head", rig, 36, 24)
    for polygon in nape.data.polygons:
        polygon.use_smooth = True

    # Swept fringe follows the brow line without hiding either eye.
    fringes = [
        ("left fringe", [(-0.125, -0.092, 1.59), (-0.095, -0.145, 1.555), (-0.052, -0.162, 1.505)], [0.021, 0.022, 0.008], deep),
        ("center fringe", [(-0.06, -0.125, 1.608), (-0.018, -0.16, 1.57), (0.018, -0.163, 1.515)], [0.020, 0.022, 0.008], sheen),
        ("right fringe", [(0.028, -0.12, 1.605), (0.076, -0.15, 1.562), (0.102, -0.135, 1.515)], [0.019, 0.022, 0.008], deep),
        ("fine highlight", [(0.052, -0.151, 1.585), (0.077, -0.163, 1.55), (0.087, -0.15, 1.525)], [0.004, 0.0035, 0.0015], sheen),
    ]
    for label, points, widths, material in fringes:
        hair_lock("Hair | " + label, points, widths, material, rig)

    for sign, side in ((1, "L"), (-1, "R")):
        hair_lock(f"Hair | bob side lock {side}", [
            (sign * 0.128, -0.045, 1.58), (sign * 0.149, -0.068, 1.50),
            (sign * 0.145, -0.045, 1.40), (sign * 0.13, -0.015, 1.30),
        ], [0.027, 0.029, 0.022, 0.009], deep, rig)
        hair_lock(f"Hair | inner bob strand {side}", [
            (sign * 0.09, -0.095, 1.58), (sign * 0.119, -0.115, 1.50),
            (sign * 0.125, -0.08, 1.41), (sign * 0.11, -0.035, 1.34),
        ], [0.012, 0.016, 0.013, 0.006], sheen if sign == 1 else deep, rig)

    # Two small matching clips add a clean silhouette detail.
    for sign, side in ((1, "L"), (-1, "R")):
        add_ellipsoid(f"Hair clip {side}", (sign * 0.137, -0.072, 1.535),
                      (0.019, 0.006, 0.005), MATERIALS["Trim | sea glass"], "Head", rig, 18, 10)


def create_face(rig: bpy.types.Object, body: bpy.types.Object,
                left_eye: bpy.types.Object, right_eye: bpy.types.Object) -> bpy.types.Object:
    sclera = MATERIALS["Eyes | warm ivory"]
    for side, obj in (("L", left_eye), ("R", right_eye)):
        obj.data.materials.clear()
        obj.data.materials.append(sclera)
        obj = attach_rigid(obj, "Head", rig)
        obj.name = f"Eye sclera {side}"
        add_eye_shape_keys(obj, side)

    # Build layered irises and pupils over the CC0 eye geometry.
    eyes = (("L", 0.047, -0.0804, 1.4633), ("R", -0.047, -0.0804, 1.4633))
    for side, x, y, z in eyes:
        parts = [
            (f"Eye iris rim {side}", (x, y - 0.031, z), (0.0225, 0.0055, 0.026), MATERIALS["Eyes | jade rim"]),
            (f"Eye iris {side}", (x, y - 0.035, z), (0.0185, 0.0048, 0.022), MATERIALS["Eyes | jade iris"]),
            (f"Eye amber iris {side}", (x, y - 0.039, z - 0.003), (0.011, 0.0032, 0.009), MATERIALS["Eyes | amber fleck"]),
            (f"Eye pupil {side}", (x, y - 0.041, z), (0.008, 0.0035, 0.015), MATERIALS["Eyes | deep pupil"]),
            (f"Eye catchlight large {side}", (x - 0.006, y - 0.045, z + 0.009), (0.0045, 0.0022, 0.005), MATERIALS["Eyes | catchlight"]),
            (f"Eye catchlight small {side}", (x + 0.005, y - 0.044, z - 0.008), (0.0022, 0.0016, 0.0025), MATERIALS["Eyes | catchlight"]),
        ]
        for name, center, scale, material in parts:
            obj = add_ellipsoid(name, center, scale, material, "Head", rig, 24, 16)
            add_eye_shape_keys(obj, side)

    surface_y = add_front_surface_accessor(body)
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    roles: list[tuple[str, str, float, float]] = []
    material_ids: list[int] = []

    def ellipse(cx: float, cz: float, rx: float, rz: float, role: str,
                side: str, mat_id: int, offset: float = 0.008, segments: int = 32) -> None:
        center_index = len(vertices)
        vertices.append((cx, surface_y(cx, cz, offset), cz))
        roles.append((role, side, 0.0, cz))
        ring: list[int] = []
        for index in range(segments):
            angle = 2 * math.pi * index / segments
            x = cx + math.cos(angle) * rx
            z = cz + math.sin(angle) * rz
            ring.append(len(vertices))
            vertices.append((x, surface_y(x, z, offset), z))
            roles.append((role, side, math.cos(angle), cz))
        for index in range(segments):
            faces.append((center_index, ring[index], ring[(index + 1) % segments]))
            material_ids.append(mat_id)

    def eyebrow(cx: float, cz: float, side: str) -> None:
        first = len(vertices)
        steps = 12
        for index in range(steps + 1):
            t = index / steps
            u = 2 * t - 1
            x = cx + u * 0.036
            z = cz + math.sin(math.pi * t) * 0.006
            thickness = 0.0035 * (0.35 + 0.65 * math.sin(math.pi * t) ** 0.35)
            for dz in (-thickness, thickness):
                zz = z + dz
                vertices.append((x, surface_y(x, zz, 0.009), zz))
                roles.append(("brow", side, u, cz))
        for index in range(steps):
            a = first + index * 2
            faces.append((a, a + 1, a + 3, a + 2))
            material_ids.append(0)

    for side, sign in (("L", 1), ("R", -1)):
        eyebrow(sign * 0.048, 1.512, side)
    ellipse(0, 1.383, 0.018, 0.0035, "mouth", "C", 1, 0.010, 32)
    ellipse(0, 1.3785, 0.010, 0.0015, "lip", "C", 2, 0.012, 24)

    mesh = bpy.data.meshes.new("Core face expression mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(MATERIALS["Face | brow"])
    mesh.materials.append(MATERIALS["Face | muted berry"])
    mesh.materials.append(MATERIALS["Face | lip light"])
    mesh.update()
    obj = bpy.data.objects.new("Core_Face_Display", mesh)
    bpy.context.scene.collection.objects.link(obj)
    for polygon, material_index in zip(mesh.polygons, material_ids):
        polygon.material_index = material_index
        polygon.use_smooth = True
    obj = attach_rigid(obj, "Head", rig)

    obj.shape_key_add(name="Basis")
    basis = obj.data.shape_keys.key_blocks["Basis"]
    shape_names = [
        "Eye_Default", "Mouth_Smile01", "Mouth_Smile02", "Mouth_Angry01",
        "Mouth_Open01", "Mouth_A01", "Brow_Smily_L", "Brow_Smily_R",
        "Brow_Trouble_L", "Brow_Trouble_R", "Brow_Angry_L", "Brow_Angry_R",
        "Brow_Up_L", "Brow_Up_R", "Eye_Wail", "Eye_Ha", "Eye_WinkA_L",
        "Eye_WinkA_R", "Eye_WinkB_L", "Eye_WinkB_R", "Eye_WinkC_L",
        "Eye_WinkC_R", "なごみ",
    ]
    for shape_name in shape_names:
        key = obj.shape_key_add(name=shape_name)
        for index, vertex in enumerate(basis.data):
            x, y, z = vertex.co
            role, side, u, center_z = roles[index]
            dz = 0.0
            if role == "mouth":
                if shape_name == "Mouth_Smile01":
                    dz = 0.005 * abs(u)
                elif shape_name == "Mouth_Smile02":
                    dz = 0.009 * abs(u)
                elif shape_name == "Mouth_Angry01":
                    dz = -0.005 * abs(u)
                elif shape_name in {"Mouth_Open01", "Mouth_A01"}:
                    dz = (z - center_z) * (2.7 if shape_name == "Mouth_A01" else 3.8)
            elif role == "lip" and shape_name in {"Mouth_Smile01", "Mouth_Smile02"}:
                dz = 0.003 * abs(u)
            elif role == "brow":
                active = shape_name.endswith("_L") and side == "L" or shape_name.endswith("_R") and side == "R"
                if active and shape_name.startswith("Brow_Smily"):
                    dz = 0.007 * (1 - abs(u))
                elif active and shape_name.startswith("Brow_Trouble"):
                    dz = 0.009 * (1 - abs(u)) - 0.003 * abs(u)
                elif active and shape_name.startswith("Brow_Angry"):
                    dz = -0.009 * (1 - abs(u)) + 0.004 * abs(u)
                elif active and shape_name.startswith("Brow_Up"):
                    dz = 0.012 * (1 - 0.2 * abs(u))
            key.data[index].co = (x, y, z + dz)
    return obj


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
    meta.version = "0.4.0"
    meta.authors.clear()
    author = meta.authors.add()
    author.value = "LocalCore"
    meta.copyright_information = "Original LocalCore styling on a Blender Studio Human Base Meshes CC0 foundation."
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
    key_objects = [obj for obj in bpy.data.objects
                   if obj.type == "MESH" and obj.data.shape_keys]
    for expression_name, keys in expressions.items():
        expression = getattr(presets, expression_name)
        for key_name in keys:
            for obj in key_objects:
                block = obj.data.shape_keys.key_blocks.get(key_name)
                if block is None:
                    continue
                bind = expression.morph_target_binds.add()
                bind.node.mesh_object_name = obj.name
                bind.index = key_name
                bind.weight = 1.0
    for name in ("blink", "blink_left", "blink_right"):
        getattr(presets, name).override_blink = "block"
    for name in ("aa", "ih", "ou", "ee", "oh"):
        getattr(presets, name).override_mouth = "block"


def create_stage() -> None:
    bpy.ops.object.camera_add(location=(0.13, -5.3, 1.17))
    camera = bpy.context.object
    camera.name = "Portrait preview camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 1.98
    camera.rotation_euler = (Vector((0, 0, 0.83)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = camera
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 72
    scene.render.resolution_x = 820
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.022, 0.033, 0.054, 1)
    background.inputs["Strength"].default_value = 0.8
    scene.view_settings.view_transform = "AgX"
    for name, location, energy, size, color in (
        ("Soft key", (-3.2, -4.0, 3.8), 370, 3.2, (1.0, 0.79, 0.67)),
        ("Front fill", (3.1, -3.2, 2.1), 250, 3.3, (0.70, 0.86, 1.0)),
        ("Teal hair rim", (0.0, 2.4, 3.0), 45, 2.4, (0.25, 0.72, 0.62)),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.data.color = color
        light.rotation_euler = (Vector((0, 0, 0.93)) - light.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(PREVIEW_PATH)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if not BASE_MESH_PATH.is_file():
        raise FileNotFoundError(BASE_MESH_PATH)
    reset_scene()
    create_materials()
    body, left_eye, right_eye = import_base_meshes()
    rig = create_rig()
    weight_body(body, rig)
    limit_joint_influences(body)
    surface_y = add_front_surface_accessor(body)
    create_outfit_details(rig, surface_y)
    face = create_face(rig, body, left_eye, right_eye)
    create_hair(rig)
    configure_vrm(rig, face)
    create_stage()

    bpy.ops.render.render(write_still=True)
    from bl_ext.blender_org.vrm.editor.extension_accessor import get_armature_extension
    get_armature_extension(rig.data).vrm1.meta.thumbnail_image = bpy.data.images.load(str(PREVIEW_PATH), check_existing=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), compress=True)
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
