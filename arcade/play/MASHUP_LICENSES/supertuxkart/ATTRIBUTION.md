# SuperTuxKart assets used in the sm64js mashup

Source: SuperTuxKart stk-assets SVN r15325 (2014), via the git-svn mirror https://github.com/minghuadev/stk-assets
(karts/tux: tux.b3dz, tuxkart.png, tux_body.png, wheel-*.b3d; karts/License.txt).
Licence (karts/License.txt, copied here as karts-License-upstream.txt):
  "Tux : originally by (??) from original (Super)TuxKart teams, released under GNU GPL" - "Animations : by Rudy85, chronomaster".
GNU GPL text: LICENSE-GPL-3.0.txt (upstream says "GNU GPL" without a version; SuperTuxKart code is GPL-3.0-or-later).

| sm64js actor | upstream files | changes |
|---|---|---|
| src/actors/stk_tux (Tux in his kart, real 3D) | tux.b3d (rest pose), wheel-front/rear-left/right.b3d placed at kart.xml positions, tuxkart.png, tux_body.png | converted to F3D display lists (x mirrored for SM64 handedness, scale 220), lighting baked into vertex colours, the "Terminal.png" prop dropped, textures resampled to 64x32 / 32x64 RGBA16 |

Conversion: /workspace/mashup/tools/b3d.py + b3d_to_sm64js.py (no Blender/Fast64 needed). Nothing comes from the SM64 ROM.
