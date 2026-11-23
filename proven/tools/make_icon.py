"""make_icon.py <logo.png> <out icon.png> [gauge|temp|drag] - an app's 140 x 140 tile icon: a gauge (Proven Gauges),
a thermometer (Proven Warm-Up) or a chequered flag (Proven Drag) in the logo's colours over the PROVEN line of the
logo, on a transparent background (the HMI draws the tile behind it).

The "drag" figure was written without being run: the machine Proven Drag was built on had neither Pillow nor the
logo's artwork file. The icon in apps/pps_drag was made by make_drag_icon.js, which draws the same flag from the
same coordinates and takes the PROVEN line from an icon this script made. Run this once with "drag" where Pillow
and the artwork are, and compare the two pictures, before relying on it."""
import math, sys
from PIL import Image, ImageDraw

S = 8                                            # supersampling
N = 140
WHITE, SKY, BLUE, RED = (255, 255, 255, 255), (80, 168, 224, 255), (8, 88, 152, 255), (224, 32, 40, 255)

def main(src, out, glyph='gauge'):
    im = Image.new('RGBA', (N * S, N * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if glyph == 'temp':
        # thermometer: white tube, red column and bulb, three marks, and a green "up to temperature" tick
        GREEN = (47, 210, 122, 255)
        x, top, bot, w, rb = 52 * S, 10 * S, 66 * S, 11 * S, 20 * S
        d.rounded_rectangle([x - w, top, x + w, bot + rb], radius=w, fill=WHITE)
        d.ellipse([x - rb, bot - 2 * S, x + rb, bot - 2 * S + 2 * rb], fill=WHITE)
        d.rounded_rectangle([x - w + 5 * S, top + 5 * S, x + w - 5 * S, bot + rb], radius=w - 5 * S, fill=(0, 0, 0, 0))
        d.ellipse([x - rb + 5 * S, bot + 3 * S, x + rb - 5 * S, bot - 7 * S + 2 * rb], fill=RED)
        d.rounded_rectangle([x - 3 * S, 34 * S, x + 3 * S, bot + rb], radius=3 * S, fill=RED)
        for yy in (22, 36, 50):
            d.rounded_rectangle([x + w + 5 * S, yy * S - 2 * S, x + w + 17 * S, yy * S + 2 * S], radius=2 * S, fill=WHITE)
        d.line([92 * S, 58 * S, 104 * S, 72 * S, 126 * S, 40 * S], fill=GREEN, width=9 * S, joint='curve')
        for px_, py_ in ((92, 58), (126, 40)):
            d.ellipse([px_ * S - 4.5 * S, py_ * S - 4.5 * S, px_ * S + 4.5 * S, py_ * S + 4.5 * S], fill=GREEN)
    elif glyph == 'drag':
        # chequered flag: a white pole with a red knob, 4 x 3 fields in white and the logo's dark blue, the top edge
        # sagging by OFF at the five column lines (the same figures as in make_drag_icon.js)
        FX, FY, CW, CH, OFF = 37, 14, 22, 20, (0, 5, 8, 6, 2)
        d.rounded_rectangle([26 * S, 12 * S, 33 * S, 104 * S], radius=3.5 * S, fill=WHITE)
        d.ellipse([(29.5 - 6.5) * S, (10 - 6.5) * S, (29.5 + 6.5) * S, (10 + 6.5) * S], fill=RED)
        for i in range(4):
            for j in range(3):
                x0, x1 = FX + i * CW, FX + (i + 1) * CW
                yl, yr = FY + j * CH + OFF[i], FY + j * CH + OFF[i + 1]
                d.polygon([(x0 * S, yl * S), (x1 * S, yr * S), (x1 * S, (yr + CH) * S), (x0 * S, (yl + CH) * S)],
                          fill=WHITE if (i + j) % 2 == 0 else BLUE)
    else:
        cx, cy, r, th = 70 * S, 60 * S, 46 * S, 9 * S
        box = [cx - r, cy - r, cx + r, cy + r]
        pil = lambda a: a - 90                       # 0 = up, clockwise -> PIL (0 = 3 o'clock, clockwise)
        def arc(a0, a1, col):
            d.arc(box, pil(a0), pil(a1), fill=col, width=th)
        def cap(a, col):
            x, y = cx + math.sin(math.radians(a)) * (r - th / 2), cy - math.cos(math.radians(a)) * (r - th / 2)
            d.ellipse([x - th / 2, y - th / 2, x + th / 2, y + th / 2], fill=col)
        arc(-135, 70, WHITE); cap(-135, WHITE)
        arc(78, 135, RED); cap(135, RED)
        for a in (-90, -45, 0, 45):                  # ticks
            x0, y0 = cx + math.sin(math.radians(a)) * (r - th - 3 * S), cy - math.cos(math.radians(a)) * (r - th - 3 * S)
            x1, y1 = cx + math.sin(math.radians(a)) * (r - th - 9 * S), cy - math.cos(math.radians(a)) * (r - th - 9 * S)
            d.line([x0, y0, x1, y1], fill=WHITE, width=3 * S)
        a = 48                                       # needle
        nx, ny = cx + math.sin(math.radians(a)) * (r - th - 2 * S), cy - math.cos(math.radians(a)) * (r - th - 2 * S)
        d.line([cx, cy, nx, ny], fill=RED, width=5 * S)
        d.ellipse([cx - 7 * S, cy - 7 * S, cx + 7 * S, cy + 7 * S], fill=WHITE)
        d.ellipse([cx - 3 * S, cy - 3 * S, cx + 3 * S, cy + 3 * S], fill=RED)
    im = im.resize((N, N), Image.LANCZOS)
    # the PROVEN line of the logo: colour from the artwork, opacity from its brightness (the background is black)
    logo = Image.open(src).convert('RGB')
    bbox = logo.point(lambda v: 255 if v > 60 else 0).convert('L').getbbox()
    logo = logo.crop(bbox)
    word = logo.crop((0, 0, logo.size[0], int(logo.size[0] * 0.14)))
    w = 130; h = round(w * word.size[1] / word.size[0])
    word = word.resize((w, h), Image.LANCZOS)
    alpha = Image.eval(Image.merge('RGB', word.split()).convert('L', matrix=None), lambda v: v)
    r_, g_, b_ = word.split()
    mx = Image.new('L', word.size)
    mx.putdata([max(p) for p in word.getdata()])
    # un-premultiply so edges keep the artwork's colour
    px = [(min(255, round(p[0] * 255 / m)), min(255, round(p[1] * 255 / m)), min(255, round(p[2] * 255 / m)), m) if m else (0, 0, 0, 0)
          for p, m in zip(word.getdata(), mx.getdata())]
    wl = Image.new('RGBA', word.size); wl.putdata(px)
    im.alpha_composite(wl, ((N - w) // 2, 112))
    im.save(out)
    print('icon', im.size, 'word line', (w, h))

main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else 'gauge')
