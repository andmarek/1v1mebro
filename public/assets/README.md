# Rifle lighting environment

`rifle-lighting.env` is an unmodified copy of `environmentSpecular.env` from **Babylon.js / BabylonJS Assets**. It provides prefiltered environment lighting for the rifle's metal, paint, and glass materials and is served locally rather than downloaded during play.

- Source: https://assets.babylonjs.com/core/environments/environmentSpecular.env
- Asset repository: https://github.com/BabylonJS/Assets/tree/master/core/environments
- Repository license: Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/
- Documentation: https://doc.babylonjs.com/features/featuresDeepDive/materials/using/HDREnvironment/

The rifle model and its generated surface textures are original project code.

# Scrapyard materials

The files in `map/` are unmodified 1K JPEG color, OpenGL normal, and roughness maps from **Poly Haven**, bundled locally. These photographed materials are public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

| Local prefix | Asset | Author |
| --- | --- | --- |
| `sand-` | [Aerial Sand](https://polyhaven.com/a/aerial_sand) | Rob Tuytel |
| `concrete-` | [Dirty Concrete](https://polyhaven.com/a/dirty_concrete) | Rob Tuytel |
| `metal-` | [Rusty Metal Sheet](https://polyhaven.com/a/rusty_metal_sheet) | Amal Kumar |

Downloaded through `https://api.polyhaven.com/files/{asset}` on 2026-09-29. See [Poly Haven's license FAQ](https://docs.polyhaven.com/en/faq). The arena geometry, chipped paint, signage, chain-link pattern, tire marks, and sky gradient are original project code. The Babylon.js environment above now lights both the rifle and map.
