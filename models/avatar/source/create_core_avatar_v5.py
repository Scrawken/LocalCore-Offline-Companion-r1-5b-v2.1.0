"""Build LocalCore's adult anime companion and export VRM 1.0.

Run with Blender 5.2 and the VRM Add-on enabled:
    blender --background --python models/avatar/source/create_core_avatar_v5.py

The adult body foundation is Blender Studio Human Base Meshes, CC0. LocalCore
creates the hair, separate clothing shells, facial styling, rig, and VRM metadata.
"""

from __future__ import annotations

import importlib
import math
import os
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree


ROOT = Path(__file__).resolve().parents[3]
OUT_BASE = ROOT / "models" / "avatar"
OUT_DIR = Path(os.environ.get("LOCALCORE_AVATAR_OUT_DIR", str(OUT_BASE)))
BASE_MESH_PATH = Path(__file__).resolve().parent / "assets" / "blender_studio_realistic_female_base.blend"
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
    # Original LocalCore palette: plum, lavender, pearl, and a restrained teal accent.
    make_material("Skin | warm natural", (0.47, 0.25, 0.21, 1), 0.72)
    make_material("Jacket | ink plum", (0.042, 0.027, 0.085, 1), 0.61)
    make_material("Jacket | violet panels", (0.19, 0.125, 0.29, 1), 0.58)
    make_material("Top | pearl lilac", (0.63, 0.59, 0.70, 1), 0.68)
    make_material("Trousers | night blue", (0.045, 0.064, 0.105, 1), 0.76)
    make_material("Waist | plum leather", (0.13, 0.085, 0.20, 1), 0.50)
    make_material("Boots | dark violet", (0.035, 0.042, 0.078, 1), 0.49)
    make_material("Trim | soft teal", (0.08, 0.43, 0.42, 1), 0.42, 0.08, 0.012)
    make_material("Hardware | pale silver", (0.57, 0.66, 0.73, 1), 0.32, 0.62)
    make_material("Hair | midnight plum", (0.028, 0.016, 0.062, 1), 0.42)
    make_material("Hair | lavender sheen", (0.13, 0.075, 0.25, 1), 0.39)
    make_material("Eyes | soft ivory", (0.96, 0.93, 0.88, 1), 0.28)
    make_material("Eyes | deep violet rim", (0.043, 0.032, 0.10, 1), 0.27, 0.08)
    make_material("Eyes | sea glass iris", (0.08, 0.48, 0.48, 1), 0.25, 0.08)
    make_material("Eyes | inner iris", (0.26, 0.67, 0.57, 1), 0.24, 0.04)
    make_material("Eyes | deep pupil", (0.018, 0.025, 0.043, 1), 0.22)
    make_material("Eyes | catchlight", (1.0, 0.98, 0.91, 1), 0.18, 0, 0.18)
    make_material("Face | soft brow", (0.055, 0.035, 0.078, 1), 0.58)


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
    shift_x = -body.location.x
    for obj in loaded.values():
        obj.location.x += shift_x
        for modifier in list(obj.modifiers):
            obj.modifiers.remove(modifier)
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    body.location = (0, 0, 0)
    body.parent = None
    body.data.materials.clear()
    body.data.materials.append(MATERIALS["Skin | warm natural"])
    return body, loaded["BaseEye_L"], loaded["BaseEye_R"]


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
        "LeftShoulder": ((0.09, 0, 1.265), (0.18, 0, 1.235), "Chest"),
        "LeftUpperArm": ((0.18, 0, 1.235), (0.285, 0, 1.105), "LeftShoulder"),
        "LeftLowerArm": ((0.285, 0, 1.105), (0.365, -0.004, 0.89), "LeftUpperArm"),
        "LeftHand": ((0.365, -0.004, 0.89), (0.405, -0.016, 0.78), "LeftLowerArm"),
        "RightShoulder": ((-0.09, 0, 1.265), (-0.18, 0, 1.235), "Chest"),
        "RightUpperArm": ((-0.18, 0, 1.235), (-0.285, 0, 1.105), "RightShoulder"),
        "RightLowerArm": ((-0.285, 0, 1.105), (-0.365, -0.004, 0.89), "RightUpperArm"),
        "RightHand": ((-0.365, -0.004, 0.89), (-0.405, -0.016, 0.78), "RightLowerArm"),
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


def create_body_shell(name: str, body: bpy.types.Object, rig: bpy.types.Object,
                      material: bpy.types.Material, include_face, offset: float = 0.010,
                      thickness: float = 0.006) -> bpy.types.Object:
    """Create a real, thick garment shell from selected body surface topology."""
    source_faces = [polygon for polygon in body.data.polygons
                    if include_face(Vector(polygon.center), Vector(polygon.normal))]
    if not source_faces:
        raise RuntimeError(f"No body faces selected for garment shell {name}")
    source_vertices = sorted({index for polygon in source_faces for index in polygon.vertices})
    remap = {source_index: index for index, source_index in enumerate(source_vertices)}
    vertices = []
    for source_index in source_vertices:
        source_vertex = body.data.vertices[source_index]
        normal = source_vertex.normal.copy()
        if normal.length < 1e-6:
            normal = Vector((0, 0, 1))
        vertices.append(tuple(source_vertex.co + normal.normalized() * offset))
    faces = [tuple(remap[index] for index in polygon.vertices) for polygon in source_faces]
    mesh = bpy.data.meshes.new(name + " garment shell mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    shell = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(shell)
    for polygon in mesh.polygons:
        polygon.use_smooth = True

    solidify = shell.modifiers.new("Tailored fabric thickness", "SOLIDIFY")
    solidify.thickness = thickness
    solidify.offset = 0.0
    solidify.use_rim = True
    bpy.ops.object.select_all(action="DESELECT")
    shell.select_set(True)
    bpy.context.view_layer.objects.active = shell
    bpy.ops.object.modifier_apply(modifier=solidify.name)

    # Reuse the body's nearest skin weights so the separate fabric follows the rig.
    tree = KDTree(len(body.data.vertices))
    for vertex in body.data.vertices:
        tree.insert(vertex.co, vertex.index)
    tree.balance()
    groups = {group.index: shell.vertex_groups.new(name=group.name)
              for group in body.vertex_groups}
    for vertex in shell.data.vertices:
        _co, source_index, _distance = tree.find(vertex.co)
        for membership in body.data.vertices[source_index].groups:
            group = groups.get(membership.group)
            if group and membership.weight > 0.001:
                group.add([vertex.index], membership.weight, "REPLACE")
    shell.parent = rig
    shell.matrix_parent_inverse = rig.matrix_world.inverted()
    armature = shell.modifiers.new("LocalCore garment rig", "ARMATURE")
    armature.object = rig
    armature.use_deform_preserve_volume = True
    bpy.ops.object.select_all(action="DESELECT")
    shell.select_set(True)
    bpy.context.view_layer.objects.active = shell
    bpy.ops.object.vertex_group_limit_total(limit=4)
    shell.select_set(False)
    return shell


def create_custom_garment(name: str, vertices: list[tuple[float, float, float]],
                          faces: list[tuple[int, ...]], material: bpy.types.Material,
                          body: bpy.types.Object, rig: bpy.types.Object,
                          thickness: float = 0.008) -> bpy.types.Object:
    """Turn an authored surface into a thick, rigged garment mesh."""
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    solidify = obj.modifiers.new("Tailored fabric thickness", "SOLIDIFY")
    solidify.thickness = thickness
    solidify.offset = 0.0
    solidify.use_rim = True
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=solidify.name)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()

    tree = KDTree(len(body.data.vertices))
    for vertex in body.data.vertices:
        tree.insert(vertex.co, vertex.index)
    tree.balance()
    groups = {group.index: obj.vertex_groups.new(name=group.name)
              for group in body.vertex_groups}
    for vertex in obj.data.vertices:
        _co, source_index, _distance = tree.find(vertex.co)
        for membership in body.data.vertices[source_index].groups:
            group = groups.get(membership.group)
            if group and membership.weight > 0.001:
                group.add([vertex.index], membership.weight, "REPLACE")
    obj.parent = rig
    obj.matrix_parent_inverse = rig.matrix_world.inverted()
    armature = obj.modifiers.new("LocalCore garment rig", "ARMATURE")
    armature.object = rig
    armature.use_deform_preserve_volume = True
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.vertex_group_limit_total(limit=4)
    obj.select_set(False)
    return obj


def create_tailored_jacket(body: bpy.types.Object, rig: bpy.types.Object) -> None:
    # Open-front jacket with a flared hem and a relaxed shoulder line.
    profile = [
        (0.885, 0.218, 0.168), (0.925, 0.214, 0.166), (0.980, 0.184, 0.148),
        (1.045, 0.158, 0.134), (1.105, 0.158, 0.137), (1.170, 0.180, 0.157),
        (1.225, 0.188, 0.166), (1.275, 0.170, 0.150), (1.326, 0.135, 0.120),
    ]
    ring_segments = 72
    first_angle = 0.34
    last_angle = 2.0 * math.pi - first_angle
    vertices = []
    faces = []
    for z, width, depth in profile:
        for index in range(ring_segments + 1):
            angle = first_angle + (last_angle - first_angle) * index / ring_segments
            x = width * math.sin(angle)
            y = -depth * math.cos(angle)
            vertices.append((x, y, z))
    for row in range(len(profile) - 1):
        for segment in range(ring_segments):
            a = row * (ring_segments + 1) + segment
            b = a + 1
            faces.append((a, b, b + ring_segments + 1, a + ring_segments + 1))
    create_custom_garment("Jacket | open tailored body", vertices, faces,
                          MATERIALS["Jacket | ink plum"], body, rig, 0.010)

    # Rounded sleeves are lofted along the natural arm line, with real fabric thickness.
    for sign, side in ((1, "L"), (-1, "R")):
        controls = [
            (sign * 0.145, -0.003, 1.255, 0.056, 0.050),
            (sign * 0.215, -0.003, 1.205, 0.055, 0.049),
            (sign * 0.286, -0.006, 1.095, 0.047, 0.043),
            (sign * 0.347, -0.009, 0.955, 0.038, 0.035),
            (sign * 0.389, -0.014, 0.825, 0.032, 0.030),
        ]
        points = [Vector(control[:3]) for control in controls]
        widths = [(control[3], control[4]) for control in controls]
        path = []
        radii = []
        steps = 12
        for index in range(len(points) - 1):
            p0, p1 = points[max(0, index - 1)], points[index]
            p2, p3 = points[index + 1], points[min(len(points) - 1, index + 2)]
            for step in range(steps):
                t = step / steps
                t2, t3 = t * t, t * t * t
                point = 0.5 * ((2 * p1) + (-p0 + p2) * t +
                               (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                               (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
                path.append(point)
                radii.append((widths[index][0] * (1 - t) + widths[index + 1][0] * t,
                              widths[index][1] * (1 - t) + widths[index + 1][1] * t))
        path.append(points[-1])
        radii.append(widths[-1])
        sleeve_vertices = []
        sleeve_faces = []
        sides = 24
        for index, point in enumerate(path):
            tangent = (path[min(index + 1, len(path) - 1)] -
                       path[max(0, index - 1)]).normalized()
            front = Vector((0, -1, 0))
            front -= tangent * front.dot(tangent)
            front.normalize()
            across = tangent.cross(front).normalized()
            for side_index in range(sides):
                angle = 2 * math.pi * side_index / sides
                vertex = point + across * (math.cos(angle) * radii[index][0]) + \
                         front * (math.sin(angle) * radii[index][1])
                sleeve_vertices.append(tuple(vertex))
        for row in range(len(path) - 1):
            for segment in range(sides):
                a = row * sides + segment
                b = row * sides + (segment + 1) % sides
                sleeve_faces.append((a, b, b + sides, a + sides))
        create_custom_garment(f"Jacket | shaped sleeve {side}", sleeve_vertices,
                              sleeve_faces, MATERIALS["Jacket | ink plum"], body, rig, 0.008)


def create_shoes(rig: bpy.types.Object) -> None:
    for sign, side in ((1, "L"), (-1, "R")):
        add_ellipsoid(f"Boot | shaped toe box {side}", (sign * 0.12, -0.145, 0.050),
                      (0.066, 0.112, 0.036), MATERIALS["Boots | dark violet"],
                      "LeftFoot" if sign > 0 else "RightFoot", rig, 40, 24)
        add_ellipsoid(f"Boot | sole {side}", (sign * 0.12, -0.150, 0.010),
                      (0.070, 0.118, 0.012), MATERIALS["Jacket | ink plum"],
                      "LeftFoot" if sign > 0 else "RightFoot", rig, 40, 20)


def create_coat_skirt(body: bpy.types.Object, rig: bpy.types.Object) -> None:
    """Add a flared outer hip layer over the fitted trousers."""
    profile = [
        (0.690, 0.238, 0.180), (0.735, 0.234, 0.178),
        (0.810, 0.222, 0.169), (0.880, 0.210, 0.160),
        (0.940, 0.195, 0.150),
    ]
    segments = 64
    vertices = []
    faces = []
    for z, width, depth in profile:
        for index in range(segments):
            angle = 2.0 * math.pi * index / segments
            hem_wave = 0.012 * math.cos(angle)
            vertices.append((width * math.sin(angle), -depth * math.cos(angle), z + hem_wave))
    for row in range(len(profile) - 1):
        for segment in range(segments):
            a = row * segments + segment
            b = row * segments + (segment + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    skirt = create_custom_garment("Jacket | flared overskirt", vertices, faces,
                                  MATERIALS["Jacket | violet panels"], body, rig, 0.009)
    skirt.name = "Jacket | separate flared overskirt"


def create_waistband(body: bpy.types.Object, rig: bpy.types.Object) -> None:
    profile = [(0.908, 0.208, 0.161), (0.948, 0.199, 0.154)]
    segments = 64
    vertices = []
    faces = []
    for z, width, depth in profile:
        for index in range(segments):
            angle = 2.0 * math.pi * index / segments
            vertices.append((width * math.sin(angle), -depth * math.cos(angle), z))
    for segment in range(segments):
        a = segment
        b = (segment + 1) % segments
        faces.append((a, b, b + segments, a + segments))
    create_custom_garment("Waist | raised plum waistband", vertices, faces,
                          MATERIALS["Waist | plum leather"], body, rig, 0.006)
    add_ellipsoid("Waist | silver clasp", (0, -0.166, 0.928),
                  (0.016, 0.005, 0.012), MATERIALS["Hardware | pale silver"],
                  "Hips", rig, 24, 14)


def create_front_top_panel(rig: bpy.types.Object, surface_y) -> bpy.types.Object:
    """A separate, softly scooped front layer under the open jacket."""
    vertices = []
    faces = []
    columns = 25
    rows = 23
    for row in range(rows):
        t = row / (rows - 1)
        for column in range(columns):
            u = (column / (columns - 1)) * 2.0 - 1.0
            half_width = 0.084 + 0.018 * (1.0 - t)
            x = -0.013 + u * half_width
            bottom = 0.955 + 0.012 * abs(u)
            top = 1.302 - 0.050 * (1.0 - abs(u))
            z = bottom * (1.0 - t) + top * t
            vertices.append((x, surface_y(x, z, 0.045), z))
    for row in range(rows - 1):
        for column in range(columns - 1):
            a = row * columns + column
            faces.append((a, a + 1, a + 1 + columns, a + columns))
    mesh = bpy.data.meshes.new("Pearl blouse panel mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(MATERIALS["Top | pearl lilac"])
    mesh.update()
    panel = bpy.data.objects.new("Blouse | separate pearl front panel", mesh)
    bpy.context.scene.collection.objects.link(panel)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    solidify = panel.modifiers.new("Blouse fabric thickness", "SOLIDIFY")
    solidify.thickness = 0.006
    solidify.offset = 0.0
    bpy.ops.object.select_all(action="DESELECT")
    panel.select_set(True)
    bpy.context.view_layer.objects.active = panel
    bpy.ops.object.modifier_apply(modifier=solidify.name)
    return attach_rigid(panel, "Chest", rig)


def create_outfit_details(body: bpy.types.Object, rig: bpy.types.Object, surface_y) -> None:
    jacket = MATERIALS["Jacket | ink plum"]
    pants = MATERIALS["Trousers | night blue"]
    boots = MATERIALS["Boots | dark violet"]
    waist = MATERIALS["Waist | plum leather"]
    trim = MATERIALS["Trim | soft teal"]
    hardware = MATERIALS["Hardware | pale silver"]

    create_body_shell("Jacket | separate long sleeve shell", body, rig, jacket,
                      lambda c, n: 0.79 <= c.z <= 1.405 and abs(c.x) <= 0.435,
                      offset=0.030, thickness=0.012)
    create_body_shell("Jacket | soft wrist cuffs", body, rig,
                      MATERIALS["Jacket | violet panels"],
                      lambda c, n: 0.805 <= c.z <= 0.855 and abs(c.x) >= 0.31,
                      offset=0.030, thickness=0.008)
    create_body_shell("Trousers | high waist shell", body, rig, pants,
                      lambda c, n: 0.135 <= c.z <= 0.925 and abs(c.x) <= 0.292,
                      offset=0.009, thickness=0.007)
    create_coat_skirt(body, rig)

    skirt_profile = [(0.690, 0.238, 0.180), (0.735, 0.234, 0.178),
                     (0.810, 0.222, 0.169), (0.880, 0.210, 0.160),
                     (0.940, 0.195, 0.150)]

    def skirt_surface_y(x: float, z: float, offset: float = 0.014) -> float:
        lower, upper = skirt_profile[0], skirt_profile[-1]
        for index in range(len(skirt_profile) - 1):
            if skirt_profile[index][0] <= z <= skirt_profile[index + 1][0]:
                lower, upper = skirt_profile[index], skirt_profile[index + 1]
                break
        amount = max(0.0, min(1.0, (z - lower[0]) / (upper[0] - lower[0])))
        width = lower[1] * (1 - amount) + upper[1] * amount
        depth = lower[2] * (1 - amount) + upper[2] * amount
        ratio = min(0.98, abs(x) / width)
        return -depth * math.sqrt(1.0 - ratio * ratio) - offset

    for sign, side in ((1, "L"), (-1, "R")):
        add_detail_curve(f"Overskirt | front seam {side}", [
            (sign * 0.095, 0.92), (sign * 0.09, 0.85),
            (sign * 0.085, 0.77), (sign * 0.08, 0.705),
        ], 0.0018, trim, "Hips", rig, skirt_surface_y, 0.006)
    add_detail_curve("Overskirt | hem piping", [
        (-0.19, 0.702), (-0.13, 0.700), (-0.065, 0.699),
        (0, 0.698), (0.065, 0.699), (0.13, 0.700), (0.19, 0.702),
    ], 0.0020, MATERIALS["Hardware | pale silver"], "Hips", rig,
       skirt_surface_y, 0.006)
    create_body_shell("Boots | ankle and foot shells", body, rig, boots,
                      lambda c, n: c.z <= 0.19 and abs(c.x) <= 0.235,
                      offset=0.011, thickness=0.009)
    create_shoes(rig)
    create_waistband(body, rig)

    create_front_top_panel(rig, surface_y)
    for index, z in enumerate((1.17, 1.11, 1.05), start=1):
        add_ellipsoid(f"Blouse | silver button {index}",
                      (-0.013, surface_y(-0.013, z, 0.052), z),
                      (0.0042, 0.0025, 0.0042), hardware, "Chest", rig, 20, 12)
    # Raised seams make the jacket and inset read as layered fabric in the app.
    for sign, side in ((1, "L"), (-1, "R")):
        add_detail_curve(f"Jacket | front piping {side}", [
            (-0.013 + sign * 0.093, 1.285), (-0.013 + sign * 0.102, 1.23),
            (-0.013 + sign * 0.104, 1.15), (-0.013 + sign * 0.104, 1.02),
        ], 0.0026, trim, "Chest", rig, surface_y, 0.044)
    add_detail_curve("Jacket | pearl collar edge", [
        (-0.11, 1.302), (-0.083, 1.282), (-0.049, 1.260),
        (-0.013, 1.248), (0.023, 1.260), (0.057, 1.282), (0.084, 1.302),
    ], 0.003, hardware, "Chest", rig, surface_y, 0.046)

    # Small geometric identity badge, kept deliberately understated.
    badge_points = [(-0.125, 1.235), (-0.110, 1.253), (-0.095, 1.235), (-0.110, 1.217)]
    vertices = [(x, surface_y(x, z, 0.046), z) for x, z in badge_points]
    mesh = bpy.data.meshes.new("Core badge mesh")
    mesh.from_pydata(vertices, [], [(0, 1, 2), (0, 2, 3)])
    mesh.materials.append(trim)
    mesh.update()
    badge = bpy.data.objects.new("Core companion badge", mesh)
    bpy.context.scene.collection.objects.link(badge)
    attach_rigid(badge, "Chest", rig)


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
                     surface_y, surface_offset: float = 0.014) -> bpy.types.Object:
    curve = bpy.data.curves.new(name + " geometry", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 18
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(xz_points) - 1)
    for point, (x, z) in zip(spline.bezier_points, xz_points):
        point.co = (x, surface_y(x, z, surface_offset), z)
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    return attach_rigid(obj, bone, rig)


def hair_lock(name: str, points: list[tuple[float, float, float]], widths: list[float],
              material: bpy.types.Material, rig: bpy.types.Object) -> bpy.types.Object:
    controls = [Vector(point) for point in points]
    path: list[Vector] = []
    radii: list[float] = []
    steps = 12
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
    sides = 18
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
            vertex = point + across * (math.cos(angle) * radii[index]) + front * (math.sin(angle) * radii[index] * 0.58)
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
    deep = MATERIALS["Hair | midnight plum"]
    sheen = MATERIALS["Hair | lavender sheen"]
    center_x = -0.013
    crown = add_ellipsoid("Hair | scalp cap", (center_x, 0.004, 1.558),
                          (0.095, 0.128, 0.101), deep, "Head", rig, 56, 36)
    bm = bmesh.new()
    bm.from_mesh(crown.data)
    lower_front = [face for face in bm.faces
                   if face.calc_center_median().z < 1.568 and face.calc_center_median().y < 0.018]
    if lower_front:
        bmesh.ops.delete(bm, geom=lower_front, context="FACES")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(crown.data)
    bm.free()
    for polygon in crown.data.polygons:
        polygon.use_smooth = True

    # A full, soft back layer gives the style real volume behind the neck.
    nape = add_ellipsoid("Hair | shoulder length back layer", (center_x, 0.092, 1.416),
                         (0.132, 0.096, 0.226), deep, "Head", rig, 48, 32)
    for polygon in nape.data.polygons:
        polygon.use_smooth = True

    # Broad, tapered fringe pieces follow one side part and keep both eyes clear.
    fringes = [
        ("side swept fringe", [(-0.067, -0.043, 1.619), (-0.040, -0.095, 1.589), (0.012, -0.126, 1.548)], [0.010, 0.014, 0.002], deep),
        ("center fringe", [(-0.026, -0.075, 1.633), (0.012, -0.119, 1.597), (0.048, -0.125, 1.553)], [0.010, 0.014, 0.002], sheen),
    ]
    for label, points, widths, material in fringes:
        hair_lock("Hair | " + label, points, widths, material, rig)

    # Layered side locks reach the shoulders; the right one is slightly longer.
    hair_lock("Hair | left face framing layer", [
        (-0.075, -0.037, 1.616), (-0.105, -0.075, 1.510),
        (-0.132, -0.045, 1.365), (-0.102, -0.006, 1.235),
    ], [0.024, 0.036, 0.031, 0.004], deep, rig)
    hair_lock("Hair | right face framing layer", [
        (0.070, -0.036, 1.616), (0.104, -0.071, 1.505),
        (0.123, -0.043, 1.355), (0.151, -0.008, 1.105),
    ], [0.022, 0.034, 0.030, 0.004], deep, rig)
    hair_lock("Hair | left lavender ribbon", [
        (-0.052, -0.098, 1.574), (-0.066, -0.108, 1.485),
        (-0.077, -0.070, 1.348), (-0.087, -0.024, 1.251),
    ], [0.008, 0.011, 0.008, 0.0015], sheen, rig)
    hair_lock("Hair | right lavender ribbon", [
        (0.046, -0.098, 1.574), (0.069, -0.103, 1.47),
        (0.083, -0.066, 1.324), (0.099, -0.031, 1.155),
    ], [0.007, 0.010, 0.007, 0.0015], sheen, rig)

    # A single slim temple pin replaces the toy-like pair of bright clips.
    add_ellipsoid("Hair | silver temple pin", (0.087, -0.088, 1.574),
                  (0.015, 0.004, 0.003), MATERIALS["Hardware | pale silver"],
                  "Head", rig, 24, 12)


def create_face(rig: bpy.types.Object, body: bpy.types.Object,
                left_eye: bpy.types.Object, right_eye: bpy.types.Object) -> bpy.types.Object:
    sclera = MATERIALS["Eyes | soft ivory"]
    eye_centers: dict[str, Vector] = {}
    for side, obj in (("L", left_eye), ("R", right_eye)):
        obj.location.y -= 0.003
        obj.scale = (1.22, 1.0, 1.24)
        eye_centers[side] = obj.matrix_world @ Vector((0, 0, 0))
        obj.data.materials.clear()
        obj.data.materials.append(sclera)
        obj = attach_rigid(obj, "Head", rig)
        obj.name = f"Eye sclera {side}"
        add_eye_shape_keys(obj, side)

    # Modest layered irises sit on the supplied eye geometry without enlarging it.
    for side, center in eye_centers.items():
        x, y, z = center
        parts = [
            (f"Eye iris rim {side}", (x, y - 0.0180, z), (0.0104, 0.0020, 0.0122), MATERIALS["Eyes | deep violet rim"]),
            (f"Eye iris {side}", (x, y - 0.0187, z), (0.0088, 0.0017, 0.0107), MATERIALS["Eyes | sea glass iris"]),
            (f"Eye inner iris {side}", (x, y - 0.0196, z - 0.0014), (0.0056, 0.0012, 0.0042), MATERIALS["Eyes | inner iris"]),
            (f"Eye pupil {side}", (x, y - 0.0200, z), (0.0032, 0.0011, 0.0064), MATERIALS["Eyes | deep pupil"]),
            (f"Eye catchlight {side}", (x - 0.0030, y - 0.0210, z + 0.0038), (0.0020, 0.0008, 0.0021), MATERIALS["Eyes | catchlight"]),
        ]
        for name, center, scale, material in parts:
            obj = add_ellipsoid(name, center, scale, material, "Head", rig, 24, 16)
            add_eye_shape_keys(obj, side)

    surface_y = add_front_surface_accessor(body)
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []

    # Fine arched brows follow the sculpted brow line. The sculpted base mouth
    # remains unobstructed; there is no lipstick or dark mouth overlay.
    roles: list[tuple[str, float, float]] = []
    for side in ("L", "R"):
        center = eye_centers[side]
        first = len(vertices)
        steps = 18
        for index in range(steps + 1):
            t = index / steps
            u = 2 * t - 1
            x = center.x + u * 0.022
            z = center.z + 0.025 + math.sin(math.pi * t) * 0.004
            thickness = 0.0015 + 0.0010 * math.sin(math.pi * t) ** 0.5
            for dz in (-thickness, thickness):
                zz = z + dz
                vertices.append((x, surface_y(x, zz, 0.006), zz))
                roles.append((side, u, z))
        for index in range(steps):
            a = first + index * 2
            faces.append((a, a + 1, a + 3, a + 2))

    mesh = bpy.data.meshes.new("Core eyebrow expression mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(MATERIALS["Face | soft brow"])
    mesh.update()
    obj = bpy.data.objects.new("Core_Expressive_Brows", mesh)
    bpy.context.scene.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = attach_rigid(obj, "Head", rig)

    obj.shape_key_add(name="Basis")
    basis = obj.data.shape_keys.key_blocks["Basis"]
    shape_names = ["Brow_Smily_L", "Brow_Smily_R", "Brow_Trouble_L", "Brow_Trouble_R",
                   "Brow_Angry_L", "Brow_Angry_R", "Brow_Up_L", "Brow_Up_R"]
    for shape_name in shape_names:
        key = obj.shape_key_add(name=shape_name)
        for index, vertex in enumerate(basis.data):
            x, y, z = vertex.co
            side, u, _center_z = roles[index]
            active = shape_name.endswith("_L") and side == "L" or shape_name.endswith("_R") and side == "R"
            dz = 0.0
            if active and shape_name.startswith("Brow_Smily"):
                dz = 0.005 * (1 - abs(u))
            elif active and shape_name.startswith("Brow_Trouble"):
                dz = 0.007 * (1 - abs(u)) - 0.002 * abs(u)
            elif active and shape_name.startswith("Brow_Angry"):
                dz = -0.006 * (1 - abs(u)) + 0.003 * abs(u)
            elif active and shape_name.startswith("Brow_Up"):
                dz = 0.008 * (1 - 0.2 * abs(u))
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
    meta.version = "0.5.0"
    meta.authors.clear()
    author = meta.authors.add()
    author.value = "LocalCore"
    meta.copyright_information = "Original LocalCore character styling on a Blender Studio Human Base Meshes CC0 foundation."
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
        "happy": ["Brow_Smily_L", "Brow_Smily_R"],
        "sad": ["Brow_Trouble_L", "Brow_Trouble_R", "Eye_Wail"],
        "angry": ["Brow_Angry_L", "Brow_Angry_R"],
        "relaxed": ["なごみ"],
        "surprised": ["Brow_Up_L", "Brow_Up_R", "Eye_Ha"],
        "aa": [], "ih": [], "ou": [], "ee": [], "oh": [],
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
        getattr(presets, name).override_mouth = "none"


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
        ("Lavender hair rim", (0.0, 2.4, 3.0), 22, 2.4, (0.43, 0.34, 0.68)),
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
    create_outfit_details(body, rig, surface_y)
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
