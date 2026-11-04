# The Drowned Works Ground Tile

**Asset id:** `env_drowned_works_ground`
**Needed for:** Phase 4 (zone 4)

---

## Prompt to paste into Kimi 3D Make

Create one original stylised 3D game asset: **The Drowned Works Ground Tile**.

WHAT IT IS AND HOW THE GAME USES IT
The battlefield ground for zone 4, The Drowned Works. The game lays copies of this tile end to end along X to make a ground strip that scrolls past as the Titan walks. Units stand and walk on its top surface, seen from the side and slightly above.

STYLE (applies to everything)
- Game: SCRAP TITAN, a 2.5D dieselpunk mech defence game for Android phones. One giant walking mech, the player's, holds the left of the screen while waves of scrap-built raider machines come in from the right.
- Look: stylised, chunky, readable 3D in the spirit of a quality mobile strategy game. Bold simple shapes, slightly exaggerated proportions, softened bevels on big edges, hand-painted textures with light wear, rivets, panel lines and soot painted in rather than modelled. Never photoreal, gory or horrific. No humans, blood or bodies: every enemy is a machine.
- Palette: rust orange #B5562B, brass #C9A04A, gunmetal #3A3F45, ash grey #8A8A85, oil black #1E1E1E, hazard yellow #E8B828.
- Faction colours: the PLAYER side (the Titan, its weapons and escorts) is clean brass and gunmetal with teal #2F8F8A accents and lights. RAIDERS (every enemy) are patched rust, scrap plating and oil black with signal red #C0392B accents and glowing red-orange lights. A player must tell friend from foe instantly by colour alone.
- Camera: the game shows every model from the SIDE, slightly from above (about 12 degrees), at a fixed distance, on a phone screen. The side silhouette is what matters most. Both sides are seen (models are mirrored to face either way), so finish both sides equally; the front and back are seen only at a slight angle; the underside is never seen.
- It must read at phone size. If a detail would be smaller than about 15 cm in the game, paint it into the texture instead of modelling it.
- Original design only. No real brands, logos, insignia, military markings, trademarks, or copies of existing games, films or toys.

DESIGN
- a flooded refinery basin: cold blue-green water pools, wet mud, corroded tanks and pipes, barnacles, misty grey-teal light (cold and wet, the opposite of the Furnace).
- The front edge (the -Y side, towards the camera) is a broken cliff-like lip showing earth layers, so the strip has a visible side.
- The top surface is gently uneven but its walkable middle stays close to Z = 0.

EXACT DIMENSIONS AND PIVOTS
`Ground_Tile`: 20.0 m long along X, 12.0 m deep along Y, from Z = 0 (walking surface) down to Z = -3.0 at the front lip.
- Origin: centre of the walking surface at Z = 0.
- It must TILE SEAMLESSLY along X: the left and right ends match exactly in shape and texture, so copies placed every 20 m join with no visible seam.
- The walkable band (Y from -3 to +3) stays within 0.15 m of Z = 0.

OBJECTS AND NAMES
- `Ground_Tile`.

TRIANGLE LIMITS
- `Ground_Tile`: at most 1,200 triangles.

MATERIALS AND TEXTURES
- 1 material, `Ground_Mat`, with one 1024 x 1024 base colour texture, and an optional normal map at the same size.

MUST AVOID
- Seams or steps where copies meet.
- Big rocks in the walkable band: units walk through it.

TECHNICAL RULES (all of them are required)
1. Units are metres, at real game size. Stay within 5% of the dimensions in this brief unless a tolerance is stated. Apply all transforms, so that scale is 1,1,1 and rotation is 0,0,0.
2. Axes in Blender terms: Z is up, the model's FRONT faces -Y, its left faces +X. The game turns the model to face the action.
3. Separate parts are separate objects, each with its origin exactly at the pivot this brief gives (the joint it turns about). The game animates these parts itself, so a part must look right when turned about its own origin through the angles stated, with no gaps opening at the joint (overlap the joint with a ball, collar or housing).
4. Keep to the triangle limits. They are hard limits: the game must run on a budget Redmi A3 phone with many enemies on screen. State the real triangle count of every object in your delivery.
5. Clean meshes: closed where solid, no stray pieces, no zero-area faces, no doubled surfaces, nothing hidden inside that can never be seen.
6. All normals face outward. The game draws only the outer side of each face. Check with backface culling ON. Do not use thin one-sided panels for anything seen from both sides; give it real thickness.
7. No text, letters, numbers or logos anywhere.
8. Materials: no more than this brief allows, named as given. Standard PBR with image textures: base colour, with optional normal map, and an emissive map only where this brief allows glowing parts. Metallic 0 unless stated; show metal through painted colour and roughness. No procedural node shaders.
9. Textures: square power-of-two PNG files at the size given. Clean, non-overlapping UVs. No baked lighting or strong painted shadows: the game lights the model.
10. No transparency or alpha cut-outs.
11. No rigs, armatures, animation, colliders, cameras, lights, ground planes or display stands. The game moves the parts.
12. Use the exact object names given.
13. Deliver: a .glb with embedded textures AND a .fbx with a textures folder AND the .blend source, plus preview images from the side, the front and three-quarter view, and one with the parts posed apart so the pivots can be checked. Name every file with the asset id.

---

## Owner's checklist before sending it to Claude

- Every object named in the brief is present, as a separate object, with the exact name.
- Each part's origin sits at its joint: rotate it in Blender and the joint stays closed.
- Triangle counts are stated, and every one is within its limit.
- Seen from the side, it reads clearly at phone size and in the right faction colours.
- No text, logos or real-world insignia.
- Files are named with the asset id and placed in `~/Downloads`, or in `mech-game/unity_assets/INCOMING/<asset id>/`.
