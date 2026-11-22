"""Prepare CC0 texture maps for the cube. Usage: prep_textures.py <downloads_dir> <out_dir>"""
import sys, os
from PIL import Image, ImageOps, ImageChops, ImageFilter

src, out = sys.argv[1], sys.argv[2]

def acg(asset, kind):
    return Image.open(os.path.join(src, asset, 'x', f'{asset}_1K-JPG_{kind}.jpg'))

def save(im, name, size):
    im = im.resize((size, size), Image.LANCZOS)
    path = os.path.join(out, name)
    im.save(path, 'JPEG', quality=90, optimize=True)
    print(f'{name:28s} {size}px {os.path.getsize(path)//1024} KB')

def tile(im, n, size=1024):
    cell = im.resize((size // n, size // n), Image.LANCZOS)
    canvas = Image.new(im.mode, (size, size))
    for y in range(n):
        for x in range(n):
            canvas.paste(cell, (x * size // n, y * size // n))
    return canvas

FLAT_N = (128, 128, 255)

# Satin powder-coated steel, glossy powder coat, matte plastic: micro detail only.
for asset, key in [('Metal027', 'satin'), ('Metal029', 'gloss')]:
    save(acg(asset, 'Roughness').convert('L'), f'{key}_rough.jpg', 512)
    save(acg(asset, 'NormalGL').convert('RGB'), f'{key}_normal.jpg', 512)
# Plastic: its roughness (mean 0.39) can't make a matte finish — normals only.
save(acg('Plastic012A', 'NormalGL').convert('RGB'), 'matte_normal.jpg', 512)

# Brushed steel: keep 1024 for the fine lines; colour as grey luminance variation.
bc = ImageOps.autocontrast(acg('Metal009', 'Color').convert('L'), cutoff=1)
save(Image.blend(bc, Image.new('L', bc.size, 200), 0.6), 'brushed_color.jpg', 1024)  # ±20% albedo variation
save(acg('Metal009', 'Roughness').convert('L'), 'brushed_rough.jpg', 1024)
save(acg('Metal009', 'NormalGL').convert('RGB'), 'brushed_normal.jpg', 1024)

# Fine diamond mesh from the carbon weave: 4×4 tiles, edge to edge.
mesh_c = tile(ImageOps.autocontrast(acg('Fabric004', 'Color').convert('L')), 4)
mesh_c = Image.blend(mesh_c, Image.new('L', mesh_c.size, 150), 0.5)  # halve the contrast
mesh_n = tile(acg('Fabric004', 'NormalGL').convert('RGB'), 4)
save(mesh_c, 'mesh_color.jpg', 1024)
save(mesh_n, 'mesh_normal.jpg', 1024)

# Terrazzo: invert (white chips on near-black), keep only the larger chips.
t = acg('Terrazzo005', 'Color').convert('L')
inv = ImageOps.invert(ImageOps.autocontrast(t, cutoff=1))
# Keep only the brightest (largest) chips, soft-edged; drop the fine dust → sparse flecks.
inv = inv.point(lambda v: int(255 * min(1, max(0, (v / 255 - 0.62) / 0.3)) ** 1.2))
inv = inv.point(lambda v: int(40 + (255 - 40) * v / 255))  # dark grey base, white chips
save(inv, 'terrazzo_color.jpg', 1024)
save(acg('Terrazzo005', 'Roughness').convert('L'), 'terrazzo_rough.jpg', 512)
save(acg('Terrazzo005', 'NormalGL').convert('RGB'), 'terrazzo_normal.jpg', 512)

# Smudges / fingerprints: a roughness overlay shared by every cubie (each
# cubie samples it at its own offset and scale).
save(Image.open(os.path.join(src, 'Fingerprints002', 'x', 'Fingerprints002_1K-JPG_Roughness.jpg')).convert('L'), 'smudge.jpg', 512)

# Velvet: drop the colour, keep the nap.
vv = os.path.join(src, 'velour_velvet')
v = Image.open(os.path.join(vv, 'velour_velvet_diff_1k.jpg')).convert('L')
va = ImageOps.autocontrast(v, cutoff=1)
save(Image.blend(va, Image.new('L', va.size, 210), 0.55), 'velvet_color.jpg', 512)  # keep the crush marks subtle
save(Image.open(os.path.join(vv, 'velour_velvet_rough_1k.jpg')).convert('L'), 'velvet_rough.jpg', 512)
save(Image.open(os.path.join(vv, 'velour_velvet_nor_gl_1k.jpg')).convert('RGB'), 'velvet_normal.jpg', 512)
