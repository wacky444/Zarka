import math
import os
from PIL import Image, ImageDraw

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'client', 'public', 'assets', 'images', 'Board Game Icons')

def render_ascii(img_rgba):
    chars = ' .:-=+*#%@'
    out = []
    for y in range(0, 64, 2):
        row = ''
        for x in range(0, 64, 2):
            a = img_rgba.getpixel((x, y))[3]
            row += chars[int(a / 256 * len(chars))]
        out.append(row)
    return '\n'.join(out)

def finalize_icon(im256):
    im64 = im256.resize((64, 64), Image.Resampling.BOX)
    rgba = Image.new('RGBA', (64, 64), (255, 255, 255, 0))
    rgba.putalpha(im64)
    return rgba

# 1. Knife Attack
def draw_knife():
    im = Image.new('L', (256, 256), 0)
    d = ImageDraw.Draw(im)
    # Pommel
    d.polygon([(36, 204), (52, 220), (40, 232), (24, 216)], fill=255)
    # Handle
    d.polygon([(46, 194), (62, 210), (102, 170), (86, 154)], fill=255)
    # Crossguard
    d.polygon([(70, 146), (114, 190), (124, 180), (80, 136)], fill=255)
    # Blade
    blade_poly = [
        (96, 142),
        (114, 160),
        (210, 64),
        (228, 32), # tip
        (180, 58),
        (96, 142)
    ]
    d.polygon(blade_poly, fill=255)
    # Fuller
    d.line([(116, 142), (180, 78)], fill=0, width=5)
    # Ribs
    for t in [0.35, 0.65]:
        gx = int(46 + (86 - 46) * t)
        gy = int(194 + (154 - 194) * t)
        d.line([(gx, gy), (gx + 12, gy + 12)], fill=0, width=4)
    return finalize_icon(im)

# 2. Axe Attack
def draw_axe():
    im = Image.new('L', (256, 256), 0)
    d = ImageDraw.Draw(im)
    # Pommel
    d.polygon([(36, 212), (56, 232), (44, 244), (24, 224)], fill=255)
    # Shaft
    d.polygon([(46, 210), (60, 224), (186, 76), (172, 62)], fill=255)
    # Handle wrap grip lines
    for t in [0.15, 0.25, 0.35]:
        hx = int(46 + (172 - 46) * t)
        hy = int(210 + (62 - 210) * t)
        d.line([(hx, hy), (hx + 12, hy + 12)], fill=0, width=3)
    # Axe head back hammer poll
    d.polygon([(150, 94), (168, 74), (138, 44), (120, 64)], fill=255)
    # Curved blade / beard
    blade_poly = [
        (164, 78),
        (226, 44),  # top point
        (236, 70),  # curve top
        (232, 120), # curve mid
        (208, 166), # bottom beard point
        (164, 128), # beard under-curve
        (152, 102),
        (164, 78)
    ]
    d.polygon(blade_poly, fill=255)
    # Inner blade decorative cutout
    d.polygon([(176, 86), (206, 68), (196, 120), (172, 106)], fill=0)
    return finalize_icon(im)

# 3. Chainsaw Attack
def draw_chainsaw():
    im = Image.new('L', (256, 256), 0)
    d = ImageDraw.Draw(im)
    # Rear handle
    d.rounded_rectangle([24, 160, 76, 212], radius=12, fill=255)
    d.rounded_rectangle([38, 174, 62, 198], radius=6, fill=0)
    # Engine body
    d.rounded_rectangle([68, 136, 136, 204], radius=10, fill=255)
    # Top wrap handle
    d.arc([80, 96, 148, 150], start=180, end=340, fill=255, width=12)
    # Engine vents
    d.line([(82, 158), (114, 158)], fill=0, width=4)
    d.line([(82, 172), (114, 172)], fill=0, width=4)
    d.line([(82, 186), (114, 186)], fill=0, width=4)
    # Guide bar
    d.polygon([(132, 142), (224, 104), (236, 118), (224, 132), (132, 170)], fill=255)
    # Nose sprocket
    d.ellipse([218, 104, 242, 128], fill=255)
    # Teeth along top edge
    for i in range(5):
        tx = 144 + i * 16
        ty = 138 - i * 6
        d.polygon([(tx, ty), (tx + 10, ty - 4), (tx + 6, ty - 12)], fill=255)
    # Teeth along bottom edge
    for i in range(5):
        tx = 144 + i * 16
        ty = 166 - i * 6
        d.polygon([(tx, ty), (tx + 10, ty - 4), (tx + 4, ty + 10)], fill=255)
    # Center slot on guide bar
    d.line([(150, 152), (210, 124)], fill=0, width=5)
    return finalize_icon(im)

# 4. Shoot Pistol
def draw_pistol():
    im = Image.new('L', (256, 256), 0)
    d = ImageDraw.Draw(im)
    # Slide & Barrel
    d.polygon([
        (48, 92),
        (176, 92),
        (176, 126),
        (140, 126),
        (134, 134),
        (48, 134)
    ], fill=255)
    # Front sight & rear sight
    d.rectangle([166, 84, 174, 92], fill=255)
    d.rectangle([54, 84, 62, 92], fill=255)
    # Ejection port
    d.rectangle([112, 98, 138, 108], fill=0)
    # Slide serrations
    for sx in [64, 72, 80]:
        d.line([(sx, 104), (sx, 126)], fill=0, width=3)
    # Grip frame
    d.polygon([
        (56, 134),
        (94, 134),
        (76, 222),
        (38, 214)
    ], fill=255)
    # Magazine base plate
    d.polygon([(34, 212), (78, 222), (74, 230), (30, 220)], fill=255)
    # Trigger guard loop
    d.rounded_rectangle([86, 132, 132, 172], radius=10, fill=255)
    d.rounded_rectangle([96, 140, 122, 162], radius=6, fill=0)
    # Trigger
    d.polygon([(104, 136), (110, 146), (106, 154), (102, 148)], fill=255)
    # Muzzle flash burst
    flash_pts = [
        (184, 104),
        (200, 92),
        (216, 74),
        (208, 98),
        (238, 92),
        (214, 108),
        (240, 116),
        (210, 118),
        (224, 134),
        (198, 120),
        (184, 114)
    ]
    d.polygon(flash_pts, fill=255)
    return finalize_icon(im)

# 5. Shoot Rocket Launcher
def draw_rocket_launcher():
    im = Image.new('L', (256, 256), 0)
    d = ImageDraw.Draw(im)
    # Exhaust nozzle
    d.polygon([(26, 158), (44, 152), (50, 172), (32, 178)], fill=255)
    # Main launch tube
    d.polygon([(46, 154), (176, 106), (180, 124), (50, 172)], fill=255)
    # Front tube ring
    d.polygon([(174, 104), (186, 100), (190, 124), (178, 128)], fill=255)
    # Dual handles
    d.polygon([(92, 146), (104, 142), (98, 174), (86, 178)], fill=255)
    d.polygon([(130, 132), (142, 128), (136, 164), (124, 168)], fill=255)
    # Optical scope
    d.polygon([(108, 128), (144, 116), (146, 104), (110, 116)], fill=255)
    # Rocket warhead
    warhead_pts = [
        (188, 102),
        (212, 94),
        (238, 84),
        (220, 110),
        (196, 118)
    ]
    d.polygon(warhead_pts, fill=255)
    # Fins
    d.polygon([(194, 98), (200, 84), (208, 92)], fill=255)
    d.polygon([(202, 116), (208, 128), (214, 114)], fill=255)
    # Backblast flame
    bb_pts = [
        (28, 164),
        (14, 158),
        (22, 168),
        (10, 174),
        (22, 176),
        (16, 184),
        (30, 174)
    ]
    d.polygon(bb_pts, fill=255)
    return finalize_icon(im)

# 6. Place C4 (Diagonal squarish C4 with stencil C4 cutout & top detonator cap)
def draw_place_c4():
    im = Image.new('L', (256, 256), 0)
    d = ImageDraw.Draw(im)
    cx, cy = 128, 134
    ang = math.radians(-25)
    cos_a, sin_a = math.cos(ang), math.sin(ang)

    def r(x, y):
        dx, dy = x - cx, y - cy
        return (dx * cos_a - dy * sin_a + cx, dx * sin_a + dy * cos_a + cy)

    s = 64
    block_pts = [r(cx - s, cy - s), r(cx + s, cy - s), r(cx + s, cy + s), r(cx - s, cy + s)]
    d.polygon(block_pts, fill=255)

    # Top detonator cap
    cap = [r(cx - 26, cy - s - 26), r(cx + 26, cy - s - 26), r(cx + 26, cy - s), r(cx - 26, cy - s)]
    d.polygon(cap, fill=255)
    # Blinking indicator pip on top of cap
    pip_center = r(cx, cy - s - 34)
    d.ellipse([pip_center[0] - 6, pip_center[1] - 6, pip_center[0] + 6, pip_center[1] + 6], fill=255)
    d.line([r(cx, cy - s - 26), pip_center], fill=255, width=5)

    # Stencil 'C4' cutout in center
    # 'C'
    c_outer = [
        r(cx - 44, cy - 30), r(cx - 10, cy - 30), r(cx - 10, cy - 14), r(cx - 28, cy - 14),
        r(cx - 28, cy + 14), r(cx - 10, cy + 14), r(cx - 10, cy + 30), r(cx - 44, cy + 30)
    ]
    d.polygon(c_outer, fill=0)
    # '4'
    f_pts = [
        r(cx + 28, cy - 30), r(cx + 44, cy - 30), r(cx + 44, cy + 30), r(cx + 28, cy + 30),
        r(cx + 28, cy + 8), r(cx + 8, cy + 8), r(cx + 8, cy - 12), r(cx + 28, cy - 30)
    ]
    d.polygon(f_pts, fill=0)
    d.polygon([r(cx + 20, cy - 4), r(cx + 28, cy - 16), r(cx + 28, cy - 4)], fill=255)

    return finalize_icon(im)

# 7. Place Trap
def draw_place_trap():
    im = Image.new('L', (256, 256), 0)
    d = ImageDraw.Draw(im)
    # Heavy base frame
    d.rounded_rectangle([36, 184, 220, 208], radius=6, fill=255)
    # Trigger pressure pan
    d.ellipse([104, 160, 152, 184], fill=255)
    # Side spring brackets
    d.rectangle([32, 168, 48, 190], fill=255)
    d.rectangle([208, 168, 224, 190], fill=255)
    # Left and right curved jaws
    d.arc([40, 56, 216, 220], start=170, end=270, fill=255, width=22)
    d.arc([40, 56, 216, 220], start=270, end=370, fill=255, width=22)
    # Teeth on left jaw
    teeth_left = [
        ((58, 138), (82, 142), (72, 122)),
        ((72, 106), (96, 114), (88, 92)),
        ((96, 78), (116, 92), (112, 70)),
    ]
    for pts in teeth_left:
        d.polygon(pts, fill=255)
    # Teeth on right jaw
    teeth_right = [
        ((198, 138), (174, 142), (184, 122)),
        ((184, 106), (160, 114), (168, 92)),
        ((160, 78), (140, 92), (144, 70)),
    ]
    for pts in teeth_right:
        d.polygon(pts, fill=255)
    return finalize_icon(im)

# 8. Steal
def draw_steal():
    im = Image.new('L', (256, 256), 0)
    d = ImageDraw.Draw(im)
    # Sleek burglar domino mask silhouette
    mask_pts = [
        (16, 116),
        (48, 86),
        (100, 78),
        (128, 98),   # nose bridge notch
        (156, 78),
        (208, 86),
        (240, 116),
        (248, 142),
        (222, 170),
        (176, 178),
        (128, 146),  # bottom bridge notch
        (80, 178),
        (34, 170),
        (8, 142)
    ]
    d.polygon(mask_pts, fill=255)
    # Clean slanted almond eye cutouts
    d.polygon([(48, 126), (68, 108), (102, 114), (106, 134), (84, 146), (54, 142)], fill=0)
    d.polygon([(208, 126), (188, 108), (154, 114), (150, 134), (172, 146), (202, 142)], fill=0)
    return finalize_icon(im)

# 9. Give
def draw_give():
    im = Image.new('L', (256, 256), 0)
    d = ImageDraw.Draw(im)
    # Wrist
    d.polygon([(28, 184), (74, 156), (92, 184), (46, 212)], fill=255)
    # Palm cup
    d.polygon([(70, 158), (132, 158), (140, 192), (84, 192)], fill=255)
    # Fingers
    d.polygon([(130, 160), (176, 160), (172, 172), (130, 172)], fill=255)
    d.polygon([(128, 174), (168, 176), (164, 188), (128, 184)], fill=255)
    d.polygon([(96, 146), (124, 136), (130, 148), (104, 156)], fill=255)
    # Gift package
    d.rounded_rectangle([132, 72, 204, 144], radius=6, fill=255)
    # Ribbon cross cutout
    d.rectangle([162, 72, 174, 144], fill=0)
    d.rectangle([132, 102, 204, 114], fill=0)
    # Bow on top
    d.ellipse([142, 54, 168, 76], fill=255)
    d.ellipse([168, 54, 194, 76], fill=255)
    d.ellipse([148, 60, 162, 72], fill=0)
    d.ellipse([174, 60, 188, 72], fill=0)
    # Presenting arrow
    d.polygon([(216, 98), (236, 108), (216, 118)], fill=255)
    return finalize_icon(im)

# 10. Detect
def draw_detect():
    im = Image.new('L', (256, 256), 0)
    d = ImageDraw.Draw(im)
    # Outer ring
    d.ellipse([28, 28, 228, 228], outline=255, width=12)
    # Inner range circle
    d.ellipse([72, 72, 184, 184], outline=255, width=8)
    # Center target blip
    d.ellipse([120, 120, 136, 136], fill=255)
    # Crosshair
    d.line([(128, 32), (128, 224)], fill=255, width=6)
    d.line([(32, 128), (224, 128)], fill=255, width=6)
    # Radar sweep wedge
    d.pieslice([36, 36, 220, 220], start=275, end=340, fill=255)
    # Contact blips
    d.ellipse([156, 68, 174, 86], fill=255)
    d.ellipse([88, 160, 104, 176], fill=255)
    return finalize_icon(im)

# 11. Explode C4 / Detonate C4
def draw_explode_c4():
    im = Image.new('L', (256, 256), 0)
    d = ImageDraw.Draw(im)
    # Detonator clacker
    d.rounded_rectangle([32, 114, 76, 196], radius=6, fill=255)
    # Antenna
    d.line([(54, 114), (54, 64)], fill=255, width=6)
    d.ellipse([48, 58, 60, 70], fill=255)
    # Trigger button
    d.rectangle([60, 104, 72, 114], fill=255)
    # Grip ribs
    d.line([(42, 142), (66, 142)], fill=0, width=4)
    d.line([(42, 158), (66, 158)], fill=0, width=4)
    d.line([(42, 174), (66, 174)], fill=0, width=4)
    # Radio transmission arcs
    d.arc([40, 40, 100, 100], start=300, end=40, fill=255, width=6)
    d.arc([24, 24, 124, 124], start=305, end=35, fill=255, width=6)
    # Explosive blast
    cx, cy = 168, 136
    num_pts = 14
    outer_r = 82
    inner_r = 44
    blast_pts = []
    for i in range(num_pts * 2):
        angle = i * (math.pi / num_pts)
        r = outer_r if (i % 2 == 0) else inner_r
        if i in [2, 6, 14, 20]:
            r += 14
        bx = int(cx + r * math.cos(angle))
        by = int(cy + r * math.sin(angle))
        blast_pts.append((bx, by))
    d.polygon(blast_pts, fill=255)
    # Inner blast cutout
    inner_pts = []
    for i in range(8 * 2):
        angle = i * (math.pi / 8) + 0.2
        r = 28 if (i % 2 == 0) else 14
        bx = int(cx + r * math.cos(angle))
        by = int(cy + r * math.sin(angle))
        inner_pts.append((bx, by))
    d.polygon(inner_pts, fill=0)
    # Flying debris
    d.polygon([(228, 64), (240, 72), (232, 80)], fill=255)
    d.polygon([(224, 188), (238, 196), (226, 206)], fill=255)
    return finalize_icon(im)

# 12. Concentrate / Focus (Person silhouette with illuminated battery core in chest)
def draw_concentrate():
    im = Image.new('L', (256, 256), 0)
    d = ImageDraw.Draw(im)
    # Head
    d.ellipse([100, 20, 156, 76], fill=255)
    # Neck
    d.rectangle([118, 74, 138, 92], fill=255)
    # Shoulders and athletic bust
    bust_poly = [
        (110, 90), (146, 90),
        (218, 122), (228, 142),
        (216, 224), (200, 236),
        (56, 236), (40, 224),
        (28, 142), (38, 122)
    ]
    d.polygon(bust_poly, fill=255)
    # Battery terminal cap cutout on chest
    d.rounded_rectangle([116, 98, 140, 110], radius=4, fill=0)
    # Battery rectangular body cutout in center of chest
    d.rounded_rectangle([92, 110, 164, 220], radius=10, fill=0)
    # 3 solid horizontal charging bars inside the battery
    d.rounded_rectangle([102, 186, 154, 210], radius=4, fill=255) # bottom bar
    d.rounded_rectangle([102, 152, 154, 176], radius=4, fill=255) # middle bar
    d.rounded_rectangle([102, 118, 154, 142], radius=4, fill=255) # top bar
    return finalize_icon(im)

ICON_FACTORIES = {
    'knife_attack': (draw_knife, ['knife.png']),
    'axe_attack': (draw_axe, ['axe.png']),
    'chainsaw_attack': (draw_chainsaw, ['chainsaw.png']),
    'shoot_pistol': (draw_pistol, ['pistol.png']),
    'shoot_rocket_launcher': (draw_rocket_launcher, ['rocket_launcher.png']),
    'place_c4': (draw_place_c4, ['c4.png']),
    'place_trap': (draw_place_trap, ['trap.png']),
    'steal': (draw_steal, ['steal.png']),
    'give': (draw_give, ['give.png']),
    'detect': (draw_detect, ['detect.png']),
    'explode_c4': (draw_explode_c4, ['detonate_c4.png']),
    'concentrate': (draw_concentrate, ['focus.png']),
}

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Generating action icons into: {OUTPUT_DIR}\n")
    for key, (func, filenames) in ICON_FACTORIES.items():
        img = func()
        print(f"--- Generated icon: {key} ---")
        print(render_ascii(img))
        for fn in filenames:
            out_path = os.path.join(OUTPUT_DIR, fn)
            img.save(out_path, 'PNG')
            print(f"Saved: {out_path}")
        print()

if __name__ == '__main__':
    main()
