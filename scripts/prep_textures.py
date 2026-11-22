"""Prepare CC0 texture maps for the cube. Usage: prep_textures.py <downloads_dir> <out_dir>"""
import sys, os
from PIL import Image

src, out = sys.argv[1], sys.argv[2]

def acg(asset, kind):
    return Image.open(os.path.join(src, asset, 'x', f'{asset}_1K-JPG_{kind}.jpg'))

def save(im, name, size):
    im = im.resize((size, size), Image.LANCZOS)
    path = os.path.join(out, name)
    im.save(path, 'JPEG', quality=90, optimize=True)
    print(f'{name:28s} {size}px {os.path.getsize(path)//1024} KB')

# Fine grain of moulded plastic: roughness + normal detail of Metal027's
# satin powder coat (no colour — the cube's colours are flat values).
save(acg('Metal027', 'Roughness').convert('L'), 'satin_rough.jpg', 512)
save(acg('Metal027', 'NormalGL').convert('RGB'), 'satin_normal.jpg', 512)

# Smudges / fingerprints: a roughness overlay shared by every cubie (each
# cubie samples it at its own offset and scale).
save(Image.open(os.path.join(src, 'Fingerprints002', 'x', 'Fingerprints002_1K-JPG_Roughness.jpg')).convert('L'), 'smudge.jpg', 512)
