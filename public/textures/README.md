# Cube textures

Surface layers only — the cube's colours are flat values (Apple system
colours). Both maps are derived from **CC0** (public domain) sets; no
attribution is required, sources are listed for traceability.

| Files | Used as | Source set | Library |
|---|---|---|---|
| `satin_rough`, `satin_normal` | fine grain of moulded plastic | Metal027 (satin powder coat) | [ambientCG](https://ambientcg.com/view?id=Metal027) |
| `smudge` | fingerprints / handling marks (roughness overlay) | Fingerprints002 | [ambientCG](https://ambientcg.com/view?id=Fingerprints002) |

Regenerate from the original 1K-JPG downloads with:

```bash
python3 scripts/prep_textures.py <downloads_dir> public/textures
```

`<downloads_dir>` holds one folder per ambientCG set (`<Asset>/x/<Asset>_1K-JPG_*.jpg`,
the unzipped archive): `Metal027` and `Fingerprints002`.
