# assets/wf — Blender/glTF models for Walk the Forest (3D mode)

Empty on purpose. The 3D backdrop (`walk-forest-3d.js`, `?wf=3d`) builds
every stop's set piece procedurally. Any stop can be replaced by a model
made in Blender, with no code beyond one line:

1. Export the model as **binary glTF** (`.glb`) into this folder, named by
   the activity id, e.g. `assets/wf/hammock.glb`. The ids are listed in
   `pocketbook-data.js` (`ACTIVITIES[].id`): `introduce`, `soundscape`,
   `naming`, `hammock`, `barefoot`, `palette`, `senses`, `tinyworld`, `sofa`,
   `fire`, `bivouac`, `sitspot`, `roles`, `project`, `object`, `checkin`,
   `campfire`.
2. Add it to `WF3D_GLTF` near the top of `walk-forest-3d.js`:
   `const WF3D_GLTF = { hammock: 'assets/wf/hammock.glb' };`

The model then owns that stop. The procedural props, people and physics
props (the hammock cloth, the palette line) for that stop are removed, and
the model is placed there instead. `GLTFLoader` is only downloaded when this
map is non-empty.

## Export spec

| | |
|---|---|
| Units | metres (Blender default), **+Y up** (the glTF exporter's default "+Y Up" setting) |
| Orientation | the trail runs away from the camera along **−Z**; the viewer looks at the model from +Z, slightly above |
| Origin | the stop's spot on the trail's centre line, at ground level. The trail is ~3.5m wide (x ≈ −1.75…1.75); keep props mostly at x ≈ ±1.5…4m, beside it |
| Scale reference | people ≈ 1.7m, trail-side trees 9–13m (those are already in the scene; don't include big trees) |
| Budget | under **5,000 triangles** and under **300 KB** per file |
| Materials | Principled BSDF base colour + roughness only. Use the Forest4Youth palette (see `tokens.css`). Baked AO in the base colour is fine. |
| Not supported | Draco/meshopt compression (it would need an extra decoder), lights, cameras, custom shaders |
| Animation | not played yet. Say so if you need it; `THREE.AnimationMixer` would be a small addition |

Check the file at https://gltf-viewer.donmccurdy.com/ before dropping it in,
then open `index.html?wf=3d` and step to that stop.
