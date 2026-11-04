# Scrap Titan Mech Chassis

**Asset id:** `titan_chassis`
**Needed for:** Phase 1-2 (first playable)

---

## Prompt to paste into Kimi 3D Make

Create one original stylised 3D game asset: **Scrap Titan Mech Chassis**.

WHAT IT IS AND HOW THE GAME USES IT
The player's giant walking mech, the hero of the game. It stands on the left of the screen and walks slowly in place while the world scrolls past. The game builds it from separate parts and animates them: the legs swing from the hips in a heavy walk, the torso bobs and sways, exhaust stacks smoke. The main cannon (a separate model) mounts on the torso's front socket and turns to aim; up to three turret weapons (separate models) bolt onto the three roof mounts. One leg model is used twice, near and far.

STYLE (applies to everything)
- Game: SCRAP TITAN, a 2.5D dieselpunk mech defence game for Android phones. One giant walking mech, the player's, holds the left of the screen while waves of scrap-built raider machines come in from the right.
- Look: stylised, chunky, readable 3D in the spirit of a quality mobile strategy game. Bold simple shapes, slightly exaggerated proportions, softened bevels on big edges, hand-painted textures with light wear, rivets, panel lines and soot painted in rather than modelled. Never photoreal, gory or horrific. No humans, blood or bodies: every enemy is a machine.
- Palette: rust orange #B5562B, brass #C9A04A, gunmetal #3A3F45, ash grey #8A8A85, oil black #1E1E1E, hazard yellow #E8B828.
- Faction colours: the PLAYER side (the Titan, its weapons and escorts) is clean brass and gunmetal with teal #2F8F8A accents and lights. RAIDERS (every enemy) are patched rust, scrap plating and oil black with signal red #C0392B accents and glowing red-orange lights. A player must tell friend from foe instantly by colour alone.
- Camera: the game shows every model from the SIDE, slightly from above (about 12 degrees), at a fixed distance, on a phone screen. The side silhouette is what matters most. Both sides are seen (models are mirrored to face either way), so finish both sides equally; the front and back are seen only at a slight angle; the underside is never seen.
- It must read at phone size. If a detail would be smaller than about 15 cm in the game, paint it into the texture instead of modelling it.
- Original design only. No real brands, logos, insignia, military markings, trademarks, or copies of existing games, films or toys.

DESIGN
- A colossal dieselpunk war walker: boxy riveted armoured torso like a mobile fortress, with a brass-framed cockpit window band (painted, not see-through) high on the front, two tall exhaust stacks on the back, armour skirts at the hips.
- Legs: digitigrade or straight, very heavy, with big piston rams painted along the thigh and shin, round armoured knee and ankle joints, broad flat feet with three blunt toes.
- Brass and gunmetal with teal accents, teal glow on the cockpit band and a few running lights. Hazard-yellow stripes on the feet and hip skirts.
- Feels heroic, heavy and friendly-powerful, the strongest thing on the battlefield.

EXACT DIMENSIONS AND PIVOTS
Overall standing height 14 m when assembled, with the parts at their pivots as below.
`Titan_Torso`
- 7.0 m long front-to-back (Y), 5.5 m wide (X), 6.5 m tall (Z), not counting the exhaust stacks, which rise to 9.0 m above the torso origin.
- Origin: the HIP PIVOT, centre of the hip axle, at the bottom centre of the torso. The torso sits on top of this point.
- Hip sockets (where each leg's origin is placed): X = +2.2 and X = -2.2, Y = 0, Z = 0.
- Main cannon socket (where the cannon's origin is placed): X = 0, Y = -3.2, Z = 4.2 (front face, upper middle). Leave a round armoured collar about 2.0 m across there, open in the middle.
- Turret mount pads (flat round pads 1.6 m across, where turret origins are placed): Mount_1 at X = 0, Y = -1.2, Z = 6.5; Mount_2 at X = 0, Y = 1.4, Z = 6.5; Mount_3 at X = 0, Y = 3.2, Z = 5.2 (rear shoulder).
`Titan_Leg_Upper` (thigh): 3.4 m from the hip pivot down to the knee pivot. About 1.6 m thick. Origin at the HIP pivot (top). Knee pivot at Z = -3.4. Must look right swung 25 degrees forward and back.
`Titan_Leg_Lower` (shin): 3.4 m from the knee pivot down to the ankle pivot. Origin at the KNEE pivot (top). Ankle pivot at Z = -3.4. Must look right bent 0 to 45 degrees.
`Titan_Foot`: 3.6 m long (Y), 2.2 m wide (X), 0.9 m tall. Origin at the ANKLE pivot, which is 0.9 m above the sole; the sole is flat at Z = -0.9. Must look right tilted 15 degrees either way.

OBJECTS AND NAMES
- `Titan_Torso`, `Titan_Leg_Upper`, `Titan_Leg_Lower`, `Titan_Foot`.
- The two exhaust stacks are part of `Titan_Torso`.

TRIANGLE LIMITS
- `Titan_Torso`: at most 3,500 triangles.
- `Titan_Leg_Upper`: at most 900. `Titan_Leg_Lower`: at most 900. `Titan_Foot`: at most 500.

MATERIALS AND TEXTURES
- 1 material, `Titan_Mat`, shared by all parts, with one 2048 x 2048 base colour texture and an optional normal map at the same size.
- An emissive texture at the same size is allowed, only for the teal cockpit band and running lights.

MUST AVOID
- A humanoid robot face, or anything that looks like an existing mech from a film, game or toy line.
- Weapons modelled onto the torso: the weapons are separate models.
- Gaps at the hips, knees or ankles when the parts turn.
- Anything sticking out past the cannon socket that would hide the cannon.

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
