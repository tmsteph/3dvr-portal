# SuperTux assets used in the sm64js mashup

Source: https://github.com/SuperTux/supertux (commit 00673d1dfefeedf39aaf502ac0cfb1fd005174d6, cloned 2026-10-03)
Licence: SuperTux is GPL-3.0-or-later (LICENSE-GPL-3.0.txt); upstream README: "Most of the data subdirectory is also
licensed under CC-BY-SA". Credits: SuperTux Team / contributors, see AUTHORS-upstream.txt and data/credits.stxt upstream
("Most graphics as of 0.7 were created by Rustybox, Eauix, WeLuvGoatz, FrostC, FilipOK and Bruhmoent").
These derived files are therefore distributed under GPL-3.0-or-later (and CC-BY-SA where upstream offers it).

| sm64js actor | upstream files | changes |
|---|---|---|
| src/actors/supertux_iceblock  (Mr. Iceblock) | data/images/creatures/iceblock/iceblock-0..7.png, iceblock-squished.png | cropped, nearest-scaled x1.64 to 64x64, mirrored copy, RGBA5551 |
| src/actors/supertux_snowball  (Snowball)     | data/images/creatures/snowball/snowball-0..7.png, snowball-squished.png | same |
| src/actors/supertux_mrbomb    (Mr. Bomb)     | data/images/creatures/mr_bomb/left-0..7.png, ticking-0..4.png | same (x1.41) |
| src/actors/supertux_fireflower (Fire Flower) | data/images/powerups/fireflower/fire_flower-0..3.png | same (x1.90) |
| src/actors/supertux_iceflower  (Ice Flower)  | data/images/powerups/iceflower/ice_flower-0..4.png | same (x1.90) |
| src/actors/supertux_firebullet (fireball)    | data/images/objects/bullets/fire_bullet.png | x2 nearest, 4 copies rotated 0/90/180/270 deg (spin), 64x64 RGBA5551 |
| src/actors/supertux_icebullet  (ice bullet; also the frozen-enemy overlay) | data/images/objects/bullets/ice_bullet.png | same |

Conversion: /workspace/mashup/tools/png_sprite_frames.py + gen_sm64js_sprite_actor.py. Textures are embedded in
model.inc.js; nothing comes from the Super Mario 64 ROM.
