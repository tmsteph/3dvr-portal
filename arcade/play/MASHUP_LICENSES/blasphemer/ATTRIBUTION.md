# Blasphemer assets used in the sm64js mashup

Source: https://github.com/Blasphemer/blasphemer release v0.1.8 (blasphem-0.1.8.zip -> blasphem.wad)
Licence: BSD-3-Clause, "Contributors to the Blasphemer project" (LICENSE-BSD-3-Clause.md); contributors in CREDITS-upstream.md.
Release notes v0.1.8: "Added Ghoul (Mummy) by Rei", "Added Harpy (Imp) by Rei".

| sm64js actor | WAD sprite lumps | changes |
|---|---|---|
| src/actors/blasphemer_ghoul (Ghoul)  | MUMM A-D (walk), E-G (attack), I-O (death), 8 rotations | Doom patch -> 64x64 RGBA5551 with Blasphemer PLAYPAL |
| src/actors/blasphemer_harpy (Harpy)  | IMPX A-C (fly), D-E (attack), H-L (death), 8 rotations | same |

Conversion: /workspace/mashup/tools/wad_sprites.py + gen_sm64js_sprite_actor.py. Textures embedded, not from the ROM.
Redistribution must keep LICENSE-BSD-3-Clause.md with the copyright notice.
