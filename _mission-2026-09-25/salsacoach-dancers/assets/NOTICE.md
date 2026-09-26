# Asset notice: SalsaCoach Dancers

## Avatars

The two dancers are characters from the **Microsoft Rocketbox Avatar Library**. The library is released under the MIT License by Microsoft (licence text: `LICENSE-Rocketbox.md`, copied from the repository).

- Source: https://github.com/microsoft/Microsoft-Rocketbox at commit `0943055db6ec570bcef9f2c8b41c9e5467c808f9`.
- Leader: `Assets/Avatars/Adults/Male_Adult_08` (texture set `m014`).
- Follower: `Assets/Avatars/Adults/Female_Party_02` (texture set `f022`).
- Suggested citation (the library asks researchers to cite it; the MIT licence does not require it):
  Gonzalez-Franco, M. et al. (2020), "The Rocketbox library and the utility of freely available rigged avatars", *Frontiers in Virtual Reality*, DOI 10.3389/frvir.2020.561558.

### What was changed

- The FBX files were converted to glTF with FBX2glTF 0.9.7.
- Broken texture references and vertex colours were removed.
- The meshes were quantized and meshopt-compressed with glTF-Transform (`tools/prep-avatars.mjs`).
- The TGA textures were re-encoded as WebP in two tiers:
  - 1024 px with normal maps (desktop);
  - 512 px without normal maps (phones).
- The hair and eyelash texture was colour-bled into its transparent pixels so that WebP compresses it well.
- The skeleton, proportions and the artists' textures are otherwise unchanged.
- No animation data from the library is used. All motion is generated at run time from the SalsaCoach Count Lab step table.

## Rights checklist for a public release

| Item | Status |
|---|---|
| Licence permits commercial use, modification and redistribution | Yes, under MIT, as long as the copyright and permission notice travel with the copies. VERIFIED from `LICENSE.md` in the repository. |
| Notice shipped with the assets | Yes: this file and `LICENSE-Rocketbox.md` sit next to the assets. A public page should also credit "Avatars: Microsoft Rocketbox (MIT)", as the prototype page does. |
| Likeness | The characters are artist-made library avatars, not portraits of named people. INFERENCE from the library's documentation. Get a legal read before using them in paid advertising. |
| Trademarks | Do not imply that Microsoft endorses SalsaCoach. |
| Music | None used. The band is synthesized in the browser from traditional public-domain rhythm patterns (clave, bell, conga tumbao, bass tumbao). |
| three.js and the meshopt decoder | MIT. Their licence comments are kept at the end of the bundled script. |
