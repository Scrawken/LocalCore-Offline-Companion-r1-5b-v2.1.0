# LocalCore Core companion

`LocalCore-Core.vrm` is the built-in adult anime companion, version 0.4.0. It
appears as **LocalCore Core (built-in)** in the app's character picker. The
model has a 21-bone humanoid rig, VRM 1.0 expression and speech shapes, and an
embedded thumbnail. Imported VRMs remain available through the local character
library.

## Files

- `LocalCore-Core.vrm` — built-in runtime avatar.
- `LocalCore-Core.blend` — editable Blender scene.
- `LocalCore-Core-preview.png` — standalone render.
- `source/create_core_avatar_v4.py` — reproducible Blender build and VRM export.
- `source/assets/blender_studio_stylized_female_base.blend` — selected female
  body and eye meshes from Blender Studio's Human Base Meshes v1.4.1 bundle.
- `archive/pre-v0.4.0-2026-10-20/` — previous built-in model, preserved before
  this redesign.
- `archive/anime-human-0.2.0-2026-10-20/` and
  `archive/prototype-2026-10-20/` — earlier iterations.

## Build

The source script expects Blender 5.2 and the VRM Add-on for Blender 4.10.2 or
newer installed as the `bl_ext.blender_org.vrm` extension:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python models/avatar/source/create_core_avatar_v4.py
```

The face has VRM 1.0 presets for happy, sad, angry, relaxed, surprised, neutral,
blink, and the five mouth visemes. The LocalCore viewer recognizes the named
morph targets directly.

## Mesh basis and permissions

The body and eye topology comes from Blender Studio's Human Base Meshes v1.4.1,
listed as CC0 on [Blender's demo files page](https://www.blender.org/download/demo-files/).
The subset and source details are in `source/assets/README.md`. The hair, outfit
styling, face features, rig, and VRM metadata are created for LocalCore. The
D.Mon file is a visual reference only; its mesh and textures are not included.

The VRM metadata allows general and corporate use, modification, and
redistribution. It disallows antisocial or hate, excessively violent or sexual,
and political or religious use.
