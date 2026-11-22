# Cube textures

All maps are derived from **CC0** (public domain) photogrammetry / PBR sets.
No attribution is required; sources are listed for traceability.

The dark theme (`?theme=dark`) uses all of them, one finish per cubie. The light
theme uses only `satin_*` (as the fine grain of moulded plastic) and `smudge`;
its colours are flat values.

| Files | Source set | Library |
|---|---|---|
| `satin_*` | Metal027 (black powder-coated steel) | [ambientCG](https://ambientcg.com/view?id=Metal027) |
| `gloss_*` | Metal029 (glossy powder coat) | [ambientCG](https://ambientcg.com/view?id=Metal029) |
| `matte_normal` | Plastic012A (black plastic) | [ambientCG](https://ambientcg.com/view?id=Plastic012A) |
| `brushed_*` | Metal009 (brushed steel) | [ambientCG](https://ambientcg.com/view?id=Metal009) |
| `mesh_*` | Fabric004 (carbon weave), tiled 4×4 | [ambientCG](https://ambientcg.com/view?id=Fabric004) |
| `terrazzo_*` | Terrazzo005, inverted (white chips on dark) | [ambientCG](https://ambientcg.com/view?id=Terrazzo005) |
| `velvet_*` | velour_velvet, desaturated | [Poly Haven](https://polyhaven.com/a/velour_velvet) |
| `smudge` | Fingerprints002 (roughness), shared overlay | [ambientCG](https://ambientcg.com/view?id=Fingerprints002) |

Regenerate from the original 1K-JPG downloads with:

```bash
python3 scripts/prep_textures.py <downloads_dir> public/textures
```

`<downloads_dir>` holds one folder per ambientCG set (`<Asset>/x/<Asset>_1K-JPG_*.jpg`,
the unzipped archive, incl. `Fingerprints002`) and
`velour_velvet/velour_velvet_{diff,nor_gl,rough}_1k.jpg`.
