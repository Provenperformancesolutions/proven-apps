#!/usr/bin/env python3
"""Bake the five text atlases the Proven apps draw with (label, bold, num, light, gear) from Rajdhani.

  python3 bake_proven_fonts.py <folder with the Rajdhani .ttf files> <folder with the kit's ORIGINAL atlases> <output folder>

The head unit has no font rasteriser for apps, so every glyph is drawn here, on a PC, into an atlas:
kit/runtime/fonts/<family>.json, in the format of kit/tools/bake_fonts.py (see that file's header).
kit/runtime/fonts.js loads the atlases, and kit/tools/build.py copies them into every app it builds.

The three folders:
- The Rajdhani .ttf files: Rajdhani-Regular.ttf, -Medium.ttf, -SemiBold.ttf and -Bold.ttf, from
  https://github.com/google/fonts/tree/main/ofl/rajdhani (Copyright (c) 2014 Indian Type Foundry, SIL Open
  Font Licence 1.1). They are read as data and are not part of this repository. Their licence is in this
  repository as kit/runtime/fonts/OFL-Rajdhani.txt.
- The kit's ORIGINAL atlases: label.json, bold.json, num.json, light.json and gear.json as the kit made them
  from the Ubuntu font. They are the files of kit/runtime/fonts in commit bad68cb of this repository, the
  last one before the Proven apps changed font. The files in kit/runtime/fonts NOW are this tool's own
  output and must not be given here: the tool stops if it is handed one of them, and it stops if this
  folder is also the output folder. To get the originals into a folder of their own:
      mkdir ubuntu-atlases
      for f in label bold num light gear; do git show bad68cb:kit/runtime/fonts/$f.json > ubuntu-atlases/$f.json; done
- The output folder: kit/runtime/fonts to change the font of the apps, or any other folder to look first.

How wide a letter is. Each glyph is drawn at a whole pixel size, but the room it takes in a line (its
advance) is the font's own figure scaled to exactly "nominal size x fit", not the whole-pixel figure the
rasteriser gives at that pixel size. A screen takes the atlas of the next size up from the size it draws
at, so the PC, iDrive 7 and iDrive 8 take different atlases for the same text. With the font's own
advances the text is as wide on each of them, and what fits on one fits on the others. (With whole-pixel
advances the same line came out up to 3 % wider on one screen than on another, and the kit's own
kit/tools/test_widget_fixes.js, which holds two atlas sizes against each other, failed.)

Digits on a fixed pitch. The screens show numbers that change many times a second: a speed, a clock, engine
revs. The Ubuntu font gives every digit the same room, and the screens rely on it: a number that is drawn
right-aligned or centred, or that has its unit after it, stands still while its digits change. Rajdhani's
digits each have their own width (a 1 is about 0.33 of the size wide, an 8 about 0.53) and the font has no
fixed-pitch set of its own. So this tool gives all ten digits of an atlas the room of the widest one and
puts each digit in the middle of that room. The shapes and the size of the digits stay as they are; a 1 and
a 7 get more space around them. FIXED_PITCH_DIGITS = False bakes them as the font spaces them.

The degree sign. Rajdhani's own ring is small and thin. Beside a number it was a faint speck: 3 and 4
pixels wide in the two smallest label atlases, and with 0.39 to 0.59 of the ink of the Ubuntu ring. So the
tool draws the degree sign from the same Rajdhani file at DEGREE_SCALE times the pixel size and puts it
into the box of the font's own ring: its top stays where the font puts it, its middle stays where it was,
and it takes the same room in a line. No text changes its width for it. It is still Rajdhani's ring, drawn
larger. DEGREE_SCALE = 1.0 bakes the ring as the font has it.

What is taken from the originals:
- Rajdhani has no superscript 2 and 3, no micro sign, no Greek mu and no tick. Each of those five is
  copied, bitmap and all, from the original atlas of the same family and size, so it is still the Ubuntu
  font's (Ubuntu Font Licence 1.0, kit/runtime/fonts/UFL-Ubuntu.txt).
- Six more characters of the kit's set are in neither font: the four arrows, the box line and the cross.
  In an original atlas all six have one and the same picture, the Ubuntu font's empty box for a missing
  character. That box is copied as it is. So these six showed as an empty box before, and they still do.
  No Proven app draws any of them. The tool tells the box by its being the same picture under several
  characters, and it prints which characters have it.
- A character that Rajdhani lacks and the original atlas has no entry for stops the tool: the new atlases
  hold an entry for every character the originals hold.
- The widths of a sample text, for the figures the tool prints.

Every atlas says in its "source" line what it was made from: Rajdhani, and the Ubuntu font only where the
atlas holds something of it. The gear atlas holds nothing of the Ubuntu font.

Every atlas carries a "cacheKey" made from its own content. The car's GPU renderer keeps one atlas per
family, size and cacheKey for all apps together (kit/runtime/record.js, atlasId), so an atlas with other
glyphs must never go under the key of another one. A key made from the content sees to that by itself.

Needs Pillow. The atlases in this repository were baked with Pillow 11.3.0 on Python 3. Run twice on the
same input, the tool writes the same files, byte for byte. Another Pillow or FreeType version may draw a
pixel differently: the cacheKey then changes with it, which is what it is for.
"""
import base64, hashlib, json, os, struct, sys, zlib
from PIL import Image, ImageDraw, ImageFont

# the kit's own character sets and sizes (kit/tools/bake_fonts.py); \u2014 is the long dash of the kit's set
TEXT = ''.join(chr(c) for c in range(32, 127)) + '°μ│·–\u2014…×±²³€↑↓→←✓✕'
DIGITS = '0123456789.,:-+%°/ ' + 'kmhKMHrpmbarpsiVNCFgsxµRPDSWLOT'
GEAR = '0123456789NRPDSM-'

# FIT: how much smaller or larger than its nominal size each family is drawn.
# The screens of the apps were laid out for the widths of the Ubuntu font. Rajdhani at the same nominal size
# is wider in some weights and narrower in others, so each family is baked at "nominal size x fit" pixels.
# With these factors a typical line of words of the apps is as wide as it was in Ubuntu, and it stands in the
# place it was laid out for. The factor also scales the height: a 150 px speed figure is drawn from a
# 150 x 0.884 = 133 px Rajdhani. Raise a factor and that family reads larger and wider everywhere; lower
# it and the family gains room. The glyphs are drawn at that pixel size rounded to a whole pixel (the tool
# prints it), so a glyph is up to about 1.5 % larger or smaller than the factor says. Its advance is not
# rounded: the widths of a text follow the factor exactly, in every baked size.
# A number is wider than it was in Ubuntu, because every digit has the room of the widest one
# (FIXED_PITCH_DIGITS): by about 6 % in label, 17 % in bold, 12 % in num, 7 % in light and 16 % in gear.
# The kit also takes the width of the head unit's own bar buttons from the label family
# (kit/runtime/display.js, buttons()): label has to stay as wide as Ubuntu's was. test_fonts.js checks that.
# These are the factors of the pictures the font was chosen from. Change one only where a screen does not
# fit, and run proven/tools/test_fonts.js on the three apps and the two picture tests after it.
FAMILIES = {
    # family: (file, fit, [(nominal size, characters)])
    'label': ('Rajdhani-Medium.ttf',   0.959, [(18, TEXT), (24, TEXT), (32, TEXT), (44, TEXT)]),
    'bold':  ('Rajdhani-Bold.ttf',     1.032, [(24, TEXT), (32, TEXT), (44, TEXT), (64, TEXT)]),
    'num':   ('Rajdhani-SemiBold.ttf', 0.884, [(40, TEXT), (64, DIGITS), (96, DIGITS), (150, DIGITS)]),
    'light': ('Rajdhani-Regular.ttf',  0.985, [(32, TEXT), (64, TEXT), (110, DIGITS)]),
    'gear':  ('Rajdhani-Bold.ttf',     0.900, [(200, GEAR), (300, GEAR)]),
}
# Every digit in the room of the widest one, as in the Ubuntu atlases (see the top of this file). With False a
# number changes its width with its digits: a running clock then shakes, and a unit after a number moves.
FIXED_PITCH_DIGITS = True
# The degree sign is drawn this many times as large as the font has it, in the same box and the same room
# (see the top of this file). At 1.4 its ring has about the ink of the Ubuntu ring: between 0.78 and 1.08
# of it over the 15 atlases that hold one, where the font's own ring had 0.39 to 0.59. This is a difference
# from the pictures the font was chosen from. With 1.0 the ring is the font's own, and test_fonts.js fails
# its first check, which asks for a ring that shows.
DEGREE_SCALE = 1.4
DEGREE = '\u00b0'
# what an atlas says it was made from: Rajdhani, and the Ubuntu font where the atlas holds something of it
SOURCE = 'Rajdhani (SIL OFL 1.1)'
FROM_UBUNTU = '; from the Ubuntu font (UFL 1.0): '
UBUNTU_NAMES = {'\u00b2': 'superscript 2', '\u00b3': 'superscript 3', '\u00b5': 'micro sign', '\u03bc': 'Greek mu', '\u2713': 'tick'}
EMPTY_BOX = 'its empty box for a missing character'
KEY_PREFIX = 'pps-rajdhani-'
ATLAS_W = 1024                  # the widest atlas the car's renderer takes (kit/renderd/src/gfx.c)

# a typical text of the three apps per family, for the width figures the tool prints (the samples of num,
# light and gear are mostly digits: with the digits on a fixed pitch they come out wider than in Ubuntu)
SAMPLE = {
    'label': 'Closed roads and track days only. Slip: 0-100 from first movement, distances after 1 ft. Speed, notified present 10.0/s 100 ms',
    'bold':  'NO SPEED FROM THE CAR RUN FINISHED 0-100 KM/H 1/4 MILE TIMESLIP SIGNALS Results Speed Sources Wheels Oil Coolant Gearbox',
    'num':   '0123456789 12.29 186.8 4.61 197 0.00 103 87 1.24',
    'light': '0123456789 12.29 186.8 Ready Warming up 87',
    'gear':  '0123456789NRPDSM',
}


def die(msg):
    sys.stderr.write('bake_proven_fonts: ' + msg + '\n')
    sys.exit(1)


def cmap_codes(path):
    """The character codes a TrueType file maps to a glyph (cmap formats 4 and 12). Reads the file as data."""
    b = open(path, 'rb').read()
    n = struct.unpack('>H', b[4:6])[0]
    off = None
    for i in range(n):
        tag, _sum, o, _len = struct.unpack('>4sIII', b[12 + 16 * i:28 + 16 * i])
        if tag == b'cmap':
            off = o
    if off is None:
        die('%s has no character map' % path)
    codes = set()
    ntab = struct.unpack('>H', b[off + 2:off + 4])[0]
    for i in range(ntab):
        pid, eid, so = struct.unpack('>HHI', b[off + 4 + 8 * i:off + 12 + 8 * i])
        s = off + so
        fmt = struct.unpack('>H', b[s:s + 2])[0]
        if fmt == 4 and (pid, eid) in ((3, 1), (0, 3), (0, 4), (0, 6)):
            segx2 = struct.unpack('>H', b[s + 6:s + 8])[0]
            seg = segx2 // 2
            ends = struct.unpack('>%dH' % seg, b[s + 14:s + 14 + segx2])
            starts = struct.unpack('>%dH' % seg, b[s + 16 + segx2:s + 16 + 2 * segx2])
            deltas = struct.unpack('>%dh' % seg, b[s + 16 + 2 * segx2:s + 16 + 3 * segx2])
            ro = s + 16 + 3 * segx2
            ranges = struct.unpack('>%dH' % seg, b[ro:ro + segx2])
            for k in range(seg):
                for c in range(starts[k], ends[k] + 1):
                    if c == 0xFFFF:
                        continue
                    if ranges[k] == 0:
                        g = (c + deltas[k]) & 0xFFFF
                    else:
                        p = ro + 2 * k + ranges[k] + 2 * (c - starts[k])
                        g = struct.unpack('>H', b[p:p + 2])[0]
                        if g:
                            g = (g + deltas[k]) & 0xFFFF
                    if g:
                        codes.add(c)
        elif fmt == 12 and (pid, eid) in ((3, 10), (0, 4), (0, 6)):
            ng = struct.unpack('>I', b[s + 12:s + 16])[0]
            for k in range(ng):
                a, z, _g = struct.unpack('>III', b[s + 16 + 12 * k:s + 28 + 12 * k])
                codes.update(range(a, z + 1))
    return codes


def original(folder, fam):
    """The kit's own Ubuntu atlas of a family, or stop: this tool's own output is not an original."""
    p = os.path.join(folder, fam + '.json')
    if not os.path.isfile(p):
        die('no original atlas %s' % p)
    j = json.load(open(p, encoding='utf-8'))
    if j.get('cacheKey') or not str(j.get('source', '')).startswith('Ubuntu'):
        die('%s is not the kit\'s original Ubuntu atlas (source "%s"%s). Take the originals from commit '
            'bad68cb: see the top of this file.' % (p, j.get('source'), ', it has a cacheKey' if j.get('cacheKey') else ''))
    return {s['size']: s for s in j['sizes']}


def sample_width(glyphs, text):
    """Width of a text in an atlas, as kit/runtime/fonts.js measures it (glyphs keyed by int or str)."""
    w = 0
    for ch in text:
        g = glyphs.get(ord(ch)) or glyphs.get(str(ord(ch))) or glyphs.get(63) or glyphs.get('63')
        if g:
            w += g[6]
    return w


def units_per_em(path):
    """The font's design units per em (head table). Reads the file as data."""
    b = open(path, 'rb').read()
    n = struct.unpack('>H', b[4:6])[0]
    for i in range(n):
        tag, _sum, o, _len = struct.unpack('>4sIII', b[12 + 16 * i:28 + 16 * i])
        if tag == b'head':
            return struct.unpack('>H', b[o + 18:o + 20])[0]
    die('%s has no head table' % path)


def source_line(real, boxes):
    """The "source" line of an atlas: what it was made from (real, boxes: the characters taken from the original)."""
    if not real and not boxes:
        return SOURCE
    named = [UBUNTU_NAMES.get(ch, 'U+%04X' % ord(ch)) for ch in sorted(real)]
    return SOURCE + FROM_UBUNTU + ', '.join(named + ([EMPTY_BOX] if boxes else []))


def larger(path, px, ch, im):
    """A glyph drawn DEGREE_SCALE times as large, in the box of the font's own (im): same top, same middle."""
    big = ImageFont.truetype(path, max(6, int(round(px * DEGREE_SCALE))), layout_engine=ImageFont.Layout.BASIC)
    bb = big.getbbox(ch, anchor='ls')
    bim = Image.new('L', (max(1, bb[2] - bb[0]), max(1, bb[3] - bb[1])), 0)
    ImageDraw.Draw(bim).text((-bb[0], -bb[1]), ch, font=big, fill=255, anchor='ls')
    own, ink = im.getbbox(), bim.getbbox()          # where the ink is, in each picture
    if not own or not ink:
        die('%s draws nothing for U+%04X at %d px' % (os.path.basename(path), ord(ch), px))
    ring = bim.crop(ink)
    x = int(round((own[0] + own[2]) / 2.0 - ring.width / 2.0))
    y = own[1]
    if x < 0 or x + ring.width > im.width or y + ring.height > im.height:
        die('U+%04X at %.2f times its size does not fit its box at %d px: lower DEGREE_SCALE' % (ord(ch), DEGREE_SCALE, px))
    out = Image.new('L', im.size, 0)
    out.paste(ring, (x, y))
    return out


def bake(path, size, charset, fit, have, old):
    """One size of one family: (the atlas entry, the pixel size drawn, the characters taken from the original:
    those with a glyph of their own there, and those that have the original's empty box)."""
    px = max(6, int(round(size * fit)))
    font = ImageFont.truetype(path, px, layout_engine=ImageFont.Layout.BASIC)
    # the font at one pixel per design unit: its advances there are the font's own figures, with nothing rounded away
    upm = units_per_em(path)
    design = ImageFont.truetype(path, upm, layout_engine=ImageFont.Layout.BASIC)
    ascent, descent = font.getmetrics()
    imgs, taken = [], {}
    old_alpha = None
    for ch in dict.fromkeys(charset):
        if ord(ch) in have:
            bbox = font.getbbox(ch, anchor='ls')            # relative to the pen and the baseline
            adv = design.getlength(ch) * size * fit / upm     # (not font.getlength(ch): that is rounded to whole pixels)
            w, h = max(0, bbox[2] - bbox[0]), max(0, bbox[3] - bbox[1])
            im = None
            if w and h:
                im = Image.new('L', (w, h), 0)
                ImageDraw.Draw(im).text((-bbox[0], -bbox[1]), ch, font=font, fill=255, anchor='ls')
                if ch == DEGREE and DEGREE_SCALE != 1.0:
                    im = larger(path, px, ch, im)      # the same box, offset and room: only the ring is larger
            imgs.append((ch, im, (bbox[0], bbox[1]), adv))
            continue
        # not in Rajdhani: the original's glyph, bitmap and measures, as it is
        g = old['glyphs'].get(str(ord(ch))) if old else None
        if not g:
            die('U+%04X is neither in %s nor in the original atlas at size %d' % (ord(ch), os.path.basename(path), size))
        if old_alpha is None:
            old_alpha = Image.frombytes('L', (old['atlasW'], old['atlasH']), zlib.decompress(base64.b64decode(old['alpha'])))
        gx, gy, gw, gh, ox, oy, adv = g
        pic = old_alpha.crop((gx, gy, gx + gw, gy + gh)) if gw and gh else None
        imgs.append((ch, pic, (ox, oy), adv))
        taken[ch] = (pic.size, pic.tobytes()) if pic else None
    # the original's empty box for a missing character: one and the same picture under several characters
    seen = {}
    for ch, pic in taken.items():
        if pic:
            seen.setdefault(pic, []).append(ch)
    boxes = set(ch for chars in seen.values() if len(chars) > 1 for ch in chars)
    real = set(taken) - boxes
    if FIXED_PITCH_DIGITS:
        # all ten digits in the room of the widest, each in the middle of it (moved by whole pixels: the bitmap is as drawn)
        room = max(adv for ch, _im, _o, adv in imgs if ch in '0123456789')
        imgs = [(ch, im, (o[0] + int(round((room - adv) / 2.0)), o[1]), room) if ch in '0123456789' else (ch, im, o, adv) for ch, im, o, adv in imgs]
    # shelf-pack, as kit/tools/bake_fonts.py
    x = y = rowh = 0
    place = {}
    for ch, im, _o, _a in imgs:
        if im is None:
            place[ch] = (0, 0, 0, 0)
            continue
        if im.width > ATLAS_W:
            die('a glyph of size %d is wider than the atlas' % size)
        if x + im.width > ATLAS_W:
            x, y, rowh = 0, y + rowh + 1, 0
        place[ch] = (x, y, im.width, im.height)
        x += im.width + 1
        rowh = max(rowh, im.height)
    H = y + rowh + 1
    atlas = Image.new('L', (ATLAS_W, H), 0)
    glyphs = {}
    for ch, im, o, adv in imgs:
        gx, gy, gw, gh = place[ch]
        if im is not None:
            atlas.paste(im, (gx, gy))
        glyphs[ord(ch)] = [gx, gy, gw, gh, o[0], o[1], round(adv, 2)]
    entry = {'size': size, 'ascent': ascent, 'descent': descent, 'atlasW': ATLAS_W, 'atlasH': H,
             'alpha': base64.b64encode(zlib.compress(atlas.tobytes(), 9)).decode(), 'glyphs': glyphs}
    return entry, px, real, boxes


def main():
    if len(sys.argv) != 4:
        die('usage: bake_proven_fonts.py <Rajdhani .ttf folder> <the kit\'s ORIGINAL atlases folder> <output folder>')
    srcdir, olddir, out = sys.argv[1:4]
    if os.path.realpath(olddir) == os.path.realpath(out):
        die('the folder of the originals is the output folder: the tool would read what it overwrites. '
            'Take the originals from commit bad68cb into a folder of their own: see the top of this file.')
    # everything is read and baked before the first file is written
    done = []
    for fam, (fname, fit, sizes) in FAMILIES.items():
        path = os.path.join(srcdir, fname)
        if not os.path.isfile(path):
            die('no font file %s' % path)
        have = cmap_codes(path)
        old = original(olddir, fam)
        baked, pxs, real, boxes, widths = [], [], set(), set(), []
        for size, chars in sizes:
            entry, px, r, b = bake(path, size, chars, fit, have, old.get(size))
            baked.append(entry)
            pxs.append(px)
            real.update(r)
            boxes.update(b)
            if size in old:
                widths.append(sample_width(entry['glyphs'], SAMPLE[fam]) / sample_width(old[size]['glyphs'], SAMPLE[fam]))
        key = KEY_PREFIX + hashlib.sha256(json.dumps(baked, separators=(',', ':')).encode()).hexdigest()[:16]
        data = {'family': fam, 'source': source_line(real - boxes, boxes), 'cacheKey': key, 'fit': fit, 'sizes': baked}
        done.append((fam, fname, fit, sizes, pxs, real - boxes, boxes, widths, data))
    os.makedirs(out, exist_ok=True)
    for fam, fname, fit, sizes, pxs, real, boxes, widths, data in done:
        p = os.path.join(out, fam + '.json')
        with open(p, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(data, f, separators=(',', ':'))
        print('%-5s %-21s fit %.3f  %s  sample width against Ubuntu %s  from Ubuntu: %s  its empty box under: %s  rows %d  %d KiB  %s' % (
            fam, fname, fit,
            ' '.join('%d>%dpx' % (s, px) for (s, _c), px in zip(sizes, pxs)),
            ' '.join('x%.3f' % w for w in widths),
            ''.join(sorted(real)) or 'none', ''.join(sorted(boxes)) or 'none',
            sum(e['atlasH'] for e in data['sizes']), os.path.getsize(p) // 1024, data['cacheKey']))


if __name__ == '__main__':
    main()
