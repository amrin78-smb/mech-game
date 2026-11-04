# Elite Vanguard

**Asset id:** `enemy_elite_vanguard`
**Needed for:** Phase 3 (zones 2 and 3)

---

## Prompt to paste into Kimi 3D Make

Create one original stylised 3D game asset: **Elite Vanguard**.

WHAT IT IS AND HOW THE GAME USES IT
The toughest regular raider: shielded and armoured, slow, every stat high. The game animates two legs, swings one weapon arm and shows or hides a shoulder shield.

STYLE (applies to everything)
- Game: SCRAP TITAN, a 2.5D dieselpunk mech defence game for Android phones. One giant walking mech, the player's, holds the left of the screen while waves of scrap-built raider machines come in from the right.
- Look: stylised, chunky, readable 3D in the spirit of a quality mobile strategy game. Bold simple shapes, slightly exaggerated proportions, softened bevels on big edges, hand-painted textures with light wear, rivets, panel lines and soot painted in rather than modelled. Never photoreal, gory or horrific. No humans, blood or bodies: every enemy is a machine.
- Palette: rust orange #B5562B, brass #C9A04A, gunmetal #3A3F45, ash grey #8A8A85, oil black #1E1E1E, hazard yellow #E8B828.
- Faction colours: the PLAYER side (the Titan, its weapons and escorts) is clean brass and gunmetal with teal #2F8F8A accents and lights. RAIDERS (every enemy) are patched rust, scrap plating and oil black with signal red #C0392B accents and glowing red-orange lights. A player must tell friend from foe instantly by colour alone.
- Camera: the game shows every model from the SIDE, slightly from above (about 12 degrees), at a fixed distance, on a phone screen. The side silhouette is what matters most. Both sides are seen (models are mirrored to face either way), so finish both sides equally; the front and back are seen only at a slight angle; the underside is never seen.
- It must read at phone size. If a detail would be smaller than about 15 cm in the game, paint it into the texture instead of modelling it.
- Original design only. No real brands, logos, insignia, military markings, trademarks, or copies of existing games, films or toys.

DESIGN
- A tall knight-like heavy walker: crown of exhaust spikes, layered armour, a huge hammer-piston weapon arm, a shoulder-mounted shield plate, red visor slit.
- Raider side: patched rust plates, oil black, signal red accents, glowing red-orange lights.

EXACT DIMENSIONS AND PIVOTS
`Vanguard_Body`: 3.0 m long, 3.0 m wide, 3.6 m tall. Origin: HIP pivot, centre of the underside, 2.6 m above the ground in play. Hip sockets X = ±0.9, Y = 0, Z = 0. Weapon arm shoulder at X = 1.6, Y = -0.3, Z = 2.8. Shield at X = -1.6, Y = -0.6, Z = 2.4.
`Vanguard_Leg`: 2.6 m from hip to sole. Origin at the HIP. Swings 20 degrees.
`Vanguard_Arm`: 3.4 m from shoulder to the hammer head. Origin at the SHOULDER. Swings from 80 degrees back to 60 forward.
`Vanguard_Shield`: 0.4 m thick, 2.0 m wide, 2.6 m tall. Origin at its back centre.

OBJECTS AND NAMES
- `Vanguard_Body`, `Vanguard_Leg`, `Vanguard_Arm`, `Vanguard_Shield`.

TRIANGLE LIMITS
- `Vanguard_Body`: at most 1,100. `Vanguard_Leg`: at most 250. `Vanguard_Arm`: at most 400. `Vanguard_Shield`: at most 250.

MATERIALS AND TEXTURES
- 1 material, `Vanguard_Mat`, with one 1024 x 1024 base colour texture, and an optional normal map at the same size.
- An emissive texture at the same size is allowed, only for its red-orange eye lights and engine glow.

MUST AVOID
- Humans, faces, skulls, blood, gore, or anything meant to frighten a child.
- Real military vehicles, markings or camouflage.
- Thin spindly details that vanish at phone size.
- Parts that only look right from the front: the game sees the side.

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
