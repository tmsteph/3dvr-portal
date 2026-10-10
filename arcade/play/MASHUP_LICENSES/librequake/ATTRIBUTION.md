# LibreQuake (https://github.com/lavenderdotpet/LibreQuake)

Used: `progs/dog.mdl` (Rottweiler) and `progs/ogre.mdl` (Ogre), skins + vertex animation frames, colours via `gfx/palette.lmp`.
Licence: BSD-3-Clause ("bsd3 is permissive and is what all the models textures and sounds are under", see
README-IMPORTANT-LICENCE-INFO; full text in COPYING-BSD-3-Clause, Copyright (c) 2019-2023 Contributors to the LibreQuake project).
No QuakeC / progs.dat / pop.lmp (GPL-2) material is used.

Converted with /workspace/mashup/tools/mdl_to_sm64js.py into real 3D F3D display lists (one per animation frame:
dog run/attack/death, ogre walk/swing/death; skin resampled to 64x32 RGBA16 and brightened). Output:
src/actors/lq_dog/, src/actors/lq_ogre/.
