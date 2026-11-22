# Cube textures

All maps are derived from **CC0** (public domain) photogrammetry sets.
No attribution is required; sources are listed for traceability.

The cube's colours are flat values; these maps add only the surface: the fine
grain of moulded plastic (`satin_*`) and handling smudges (`smudge`).

| Files | Source set | Library |
|---|---|---|
| `satin_*` | Metal027 (black powder-coated steel) | [ambientCG](https://ambientcg.com/view?id=Metal027) |
| `smudge` | Fingerprints002 (roughness) | [ambientCG](https://ambientcg.com/view?id=Fingerprints002) |

Regenerate from the original 1K-JPG downloads with:

```bash
python3 scripts/prep_textures.py <downloads_dir> public/textures
```

`<downloads_dir>` holds one folder per ambientCG set
(`<Asset>/x/<Asset>_1K-JPG_*.jpg`, the unzipped archive).
