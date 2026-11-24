# The new font: what was done, what was checked, what a car has to show

Proven Gauges 1.1.2, Proven Warm-Up 1.3.2 and Proven Drag 1.0.1 (November 2026).

**Nothing has run on a car with this font.** Proven Gauges and Proven Warm-Up have run on a car with the
font before it. Proven Drag has never been on a car. Everything below was done and measured on a PC
(a Mac, Node.js 24, the kit's software drawing code). Every figure in this file is a PC figure.

## 1. What was done

- **All text the three apps draw is now in Rajdhani** (Copyright (c) 2014 Indian Type Foundry, SIL Open
  Font Licence 1.1). Before, it was the kit's Ubuntu font.
- The head unit cannot draw a font for an app. The kit draws from five prepared pictures of letters,
  the atlases: `kit/runtime/fonts/label.json`, `bold.json`, `num.json`, `light.json` and `gear.json`.
  The five files named here were made again from Rajdhani by `proven/tools/bake_proven_fonts.py`. No
  code of the kit changed. The kit's other atlases did not change either: `gear_barlow.json` and the
  ones for Chinese, Korean and Cyrillic text.
- Rajdhani does not have eleven of the kit's characters. Five of them are the Ubuntu font's:
  superscript 2 and 3, the micro sign, the Greek mu and the tick. They are copied from the kit's
  Ubuntu atlases as they were. The three apps use one of them: the tick in Warm-Up's "READY".
- The other six are in neither font: the four arrows, the box line and the cross. In each of the
  kit's own atlases all six had one and the same picture, the Ubuntu font's empty box for a missing
  character. That box is copied unchanged. So these six showed as an empty box before, and they
  still do. No Proven app draws any of them.
- Each atlas says in its `"source"` line what it was made from: Rajdhani, and the Ubuntu font where
  the atlas holds something of it. `gear.json` holds nothing of the Ubuntu font and names Rajdhani
  alone.
- **The degree sign is drawn 1.4 times as large as Rajdhani has it.** See part 3.
- Each atlas carries a `cacheKey` made from its own content. The car's renderer keeps the atlases of
  all apps together, under an id made from family, size and cacheKey. The Ubuntu atlases have no
  cacheKey, so the 17 new ids are not the 17 old ones.
- The font's licence is in the repository word for word as `kit/runtime/fonts/OFL-Rajdhani.txt`. The
  Ubuntu licence beside it stays. The kit's build step copies both into every app it builds. The
  header of `UFL-Ubuntu.txt` is the kit authors' text and says that the five atlases were made from
  the Ubuntu font. In this copy that holds only for the characters named above, so one paragraph was
  added to that header (in `kit/runtime/fonts` and in `kit/localization/fonts`) which says so. The
  licence text below the header is unchanged. Apart from the five atlases and the added Rajdhani
  licence, this header is the only thing in the kit's folder that changed.
- **One layout change**, in `apps/pps_gauges/main.js`: on the Track set the Speed panel is 372 px wide
  instead of 330, and the Engine oil and Coolant tiles beside it are 302 px each instead of 323. See
  part 3.
- The three version numbers went up, so that the Store offers the update. Proven Drag is still BETA and
  its Store description is the same.

What the apps read from the car, what they work out and what they save did not change. Of the files
of the three apps, only `apps/pps_gauges/main.js` (the lines that place that panel) and the version
number in each `app.json` are different from the version before. This prints exactly those files, the
five atlases and the three licence files (the new `OFL-Rajdhani.txt` and the two copies of
`UFL-Ubuntu.txt` with the added paragraph):

```
git diff --stat bad68cb HEAD -- apps kit
```

## 2. The fit factors

Rajdhani at the same nominal size is wider than Ubuntu in some weights and narrower in others. The
screens were laid out for Ubuntu's widths. So each family is baked a little smaller or larger than its
nominal size: at "nominal size x factor" pixels, rounded to a whole pixel.

| Family | Rajdhani weight | Factor | Nominal sizes and the pixel size baked |
|---|---|---|---|
| label | Medium | 0.959 | 18 > 17, 24 > 23, 32 > 31, 44 > 42 |
| bold | Bold | 1.032 | 24 > 25, 32 > 33, 44 > 45, 64 > 66 |
| num | SemiBold | 0.884 | 40 > 35, 64 > 57, 96 > 85, 150 > 133 |
| light | Regular | 0.985 | 32 > 32, 64 > 63, 110 > 108 |
| gear | Bold | 0.900 | 200 > 180, 300 > 270 |

- These are the factors of the pictures the font was chosen from. None was changed. The pictures of
  the letters in the atlases are the same, pixel for pixel, as in the atlases those pictures were made
  from, but for one character: the degree sign (part 3). That is 1446 of 1461 pictures. What differs
  besides is the room a letter takes in a line: see the next point and part 3.
- **A letter takes the font's own room.** Each glyph is drawn at the whole pixel size in the table. The
  room it takes in a line is not rounded with it: it is the font's own figure, scaled to exactly
  "nominal size x factor". A screen takes the atlas of the next size up from the size it draws at, so
  the PC, iDrive 7 and iDrive 8 take different atlases for the same text. This way the text is as wide
  on each: over 16 lines the widths differ by 0.24 px at most. The first bake of this font took the
  whole-pixel room the rasteriser gives, as the pictures did. The same line was then up to 3 % wider
  from one atlas than from another, and one of the kit's own tests failed (part 5).
- With these factors a line of words in label is as wide as it was in Ubuntu: between 1.2 % narrower
  and 2.0 % wider over the 18 lines measured. The longest status line of Warm-Up is 1107 px where it
  was 1104, in a strip that gives it 1148. One text can differ more than a line does. Short titles in
  bold capitals are narrower than before, "TOO HOT" by about 11 %. A text that is mostly digits is wider:
  see part 3.
- What a factor does to what the driver reads: Rajdhani is a low, wide font, so its letters and digits
  are lower than Ubuntu's at the same width. Capitals in label are 85 to 91 % as tall as before, in
  bold 93 to 96 %. The digits of the big figures (num) are 77 to 83 % as tall: a 150 px speed figure
  has digits 86 px tall where they were 108. The gear digit is about 80 % as tall. This is the look of
  the pictures. Whether the lower figures read well in the car is for a car to show (part 6).
- Raise a factor and that family reads larger and wider on every screen of every app. Lower it and the
  family gains room. The label family has a second job: see part 4.

## 3. Digits on a fixed pitch, a larger degree sign, and the one panel that was too narrow

- Rajdhani gives each digit its own width. A 1 is about 0.33 of the size wide and an 8 about 0.53.
  The font has no fixed-pitch digits of its own. The Ubuntu atlases gave every digit the same room,
  and the screens rely on it: a number drawn right-aligned or centred, or with its unit after it,
  stands still while its digits change.
- With the font's own spacing, as in the pictures the font was chosen from, Proven Drag's clock at
  84 px was 137 px wide as 12.31 and 152 px wide as 12.38. It is drawn right-aligned, so its other
  digits would have moved 15 px each time the last one changed. A 150 px speed was 130 px wide as 111
  and 212 px wide as 888.
- So the tool gives all ten digits of an atlas the room of the widest one and puts each in the middle
  of it. **This is a difference from the pictures the font was chosen from.** The shapes and sizes of
  the digits are the same, pixel for pixel. A 1 and a 7 have more space around them, and a number is
  wider than it was in Ubuntu: by about 6 % in label, 17 % in bold, 12 % in num, 7 % in light and 16 %
  in gear. A 150 px speed of three digits is 212 px wide where it was 189. `FIXED_PITCH_DIGITS = False`
  in the tool bakes the digits as the font spaces them. Every screen fits that way too, and
  `test_fonts.js` then fails the one check that asks for the fixed pitch.
- With the digits on a fixed pitch, a number's width no longer depends on its digits. A screen that
  fits with one three-digit speed fits with every three-digit speed.
- **The degree sign is drawn larger than Rajdhani has it. This is the second difference from the
  pictures the font was chosen from.** Rajdhani's own ring is small and thin, and the pictures showed
  it that way. Beside a temperature it was a faint speck. In the two smallest label atlases its ink
  was 3 and 4 px wide, where the Ubuntu ring was 4 and 6. Over the 15 atlases that hold a degree sign
  it had 0.39 to 0.59 of the Ubuntu ring's ink.
- So the tool draws the degree sign from the same Rajdhani file at 1.4 times the size. Its top stays
  where the font puts it, its middle stays where it was, and it takes the same room in a line. No
  text changed its width and nothing moved on any screen. The ring is 4 and 5 px wide in those two
  atlases and has 0.78 to 1.08 of the Ubuntu ring's ink. It is still Rajdhani's ring: nothing more
  was taken from the Ubuntu font for it. `DEGREE_SCALE = 1.0` in the tool bakes the ring as the font
  has it. `test_fonts.js` then fails its first check, which asks for a ring that shows.
- **The Track set of Gauges did not fit.** Its Speed panel holds the speed, its unit and the gear side
  by side in 330 px. From 100 km/h on, the unit ran into the gear's letter. With the Ubuntu font that
  happened in M, by 14 px, so in 1.1.1 as well; D was clear by 4 px. With Rajdhani it happened in D, S
  and M, by 7, 5 and 26 px. Lowering the gear's or the number's factor would have made that family
  smaller on every screen to gain room on one, so the panel was made wider and the two tiles beside it
  narrower. No text changed size. At 372 px the letter is clear of the unit by 16 px or more.
- Nothing else needed a change. Every other screen of the three apps fits with the factors as they
  are.

## 4. What the kit itself takes from the atlases

The atlases are the kit's, and the kit uses them for more than the apps' pages.

- **The header and the settings.** Where the kit runs the screen itself (GPU renderer, full-screen
  layout), it draws the header with the app's name and tabs, and the list of settings. Both are now in
  Rajdhani. The name and every tab are still drawn on iDrive 7 and iDrive 8, and no setting's label is
  cut short. One value is cut in the list, as it was in the Ubuntu font: Proven Drag's "Slip: speed
  split from first movement, distances after 1 ft" reads "... distances after..." there. The kit gives
  a value 560 px. It is whole in the setting's own list.
- **Where the head unit's own bar buttons are.** In the full-screen layout the kit lays a slim bar
  over the head unit's own buttons. It works out their widths from the label atlas, at 40 px x 1.465
  plus 180 px, a sum the kit's authors fitted to three buttons they measured on a head unit. For the
  eleven labels the three apps can put on a button, the width from Rajdhani differs from the width
  from Ubuntu by 5 px at most, on buttons 370 to 564 px wide, and a button's place in the bar by 8 px
  at most. Against the kit's three measured buttons Rajdhani is off by 0, 6 and 2 px, Ubuntu by 3, 3
  and 1. Where the kit runs the screen itself, the three apps have no button left in that bar.
- **The kit's other apps.** They are not offered from this source. Built from this copy they would
  draw in Rajdhani too, and their screens were not checked with it. `kit/tools/bake_fonts.py` would
  put the Ubuntu atlases back, without a cacheKey.

## 5. What was checked on a PC, and how

- **The bake.** Run twice, the tool wrote the same five files byte for byte. It stops when it is
  handed its own output as the originals, and when the originals' folder is the output folder. A
  script that is not in this repository held the new atlases against those of bad68cb: every character
  the old atlas had at each size is in the new one, and all 17 ids differ from the old ones and from
  each other.
- **The eight sets of checks from before pass, with the same counts**: Gauges 133, 121, 55, 128 and 50,
  Warm-Up 350, Proven Drag 408 and 312. No check pinned a number of the Ubuntu font, so none had to
  be changed. No check about what the apps read, work out or save was touched. `test_drag_car.js` got
  one more rule for its 507 frames (no text crosses the edge of its box) and still counts 312.
- **`test_fonts.js` is new**: 44 checks on Gauges, 94 on Warm-Up, 14 on Proven Drag. It checks the
  atlases in the built app, a degree sign large enough to show, the fixed pitch of the digits, that a
  text is as wide from every atlas, the ids, the two licences, what each atlas says it was made from,
  that the six characters neither font has are one and the same empty box, the bar buttons, the
  kit's header and the kit's list of settings (1008 frames of it over the three apps). For Gauges it
  draws the five sets in 15 states of the car: nothing from the car, each unit, every figure at its
  widest (288 km/h in M8, three-digit deg F, 200000 kPa), the ethanol read-out with and without a
  reading. For Warm-Up it draws 20 states as bars and as dials, in deg C and deg F, with the widget's
  picture each time. Proven Drag's 52 states are in `test_drag_car.js`.
- **Four text sizes.** Each of those frames is drawn at the PC's size (1), iDrive 7's (1.164) and
  iDrive 8's (1.419, and 1.319 with the kit's button bar under the page); Proven Drag's at 1, 1.165
  and 1.419. Each screen takes other atlases, and its page differs: where the kit runs the screen,
  buttons are drawn on the page, and on iDrive 7 the lowest panels reach further down. At each size:
  every character has a glyph, no text lies on another, none leaves the page, none crosses the edge
  of the panel, tile, strip or button it stands in. The sizes are the kit's own figures. Proven has
  not measured them on a car.
- **The checks do fail when the font is too wide.** With label, bold and num baked 17 % wider than
  they are, `test_fonts.js` failed 12 of 44, 16 of 94 and 2 of 14 checks, and `test_screens.js` 1 of
  50. Proven Drag's screens still passed: they have that much room. With label and bold 36 % wider,
  `test_drag_car.js` failed 48 of 312. And with the Track panel as it was, `test_fonts.js` failed 3
  of its 44 checks on Gauges and `test_screens.js` 1 of its 50, all four on that panel.
- **The checks on the degree sign and on the "source" line fail on the atlases as they were first
  baked.** Those had the degree sign as Rajdhani has it, and one and the same "source" line in all
  five. On them `test_fonts.js` failed 2 of its 14 checks on Proven Drag: the ring was too small in
  all 15 atlases, and the gear atlas named the Ubuntu font.
- **The kit's own tests.** The kit has 47 test files of its own in `kit/tools` that run with Node.js.
  Each gives the same result on this copy as on bad68cb: in the runs made here 44 pass and 3 stop,
  the same three on both. `test_diagnostic_ru.js` and `test_diagnostic_zh.js` stop at their first
  lines: they look for a build of the kit's Fault Scanner, and none was made. They test its Russian
  and Chinese fault texts, which this copy does not have (see the note at the top of README.md). So
  these two have not been run with the new font. Run on a Chinese build, `test_diagnostic_zh.js`
  also measures a text in the label atlas. `test_ambient_others.js` stops on a socket error when the
  temporary folder's path is long, as it was in these runs. With a short path it passes. A fourth,
  `test_ambient_rgb.js`, waits on real time and fails now and then, on both copies alike. The
  results were not the same with the first bake of this font:
  `kit/tools/test_widget_fixes.js` holds a text from one atlas size against the same text from
  another, and it failed, 101.7 px against 104.8 with 2 px allowed. That is how the whole-pixel room
  was found, and why a letter now takes the font's own room (part 2).
- **Pictures.** Every state was saved as a picture at the PC's size, and at the iDrive 7 and iDrive 8
  sizes with the atlases those screens take. Some were looked at by eye, the rest by the rules above
  only.
- **The stream for the GPU renderer.** The kit's preview was run once for each app with `--gpu`. The
  file was written each time. Every atlas in it is a new one under its new id,
  pixel for pixel, and no id of an Ubuntu atlas is in it. The renderer itself was not run: it is built
  for the head unit.
- All 33 files of the three apps parse at the level of JavaScript the head unit runs (Node.js 8). They
  were not run on Node.js 8.

## 6. What is not known until a car has shown it

- **The car's GPU renderer has never been handed these atlases.** Whether it takes them, and whether
  it draws them as the PC's software code does, is not known. Every picture here is from the software
  code.
- **Room in the renderer's glyph texture.** The renderer keeps the atlases of all apps in one texture:
  two columns of 4096 rows. The five Rajdhani families take 2524 rows when every size is in use. The
  Ubuntu atlases, which the kit's own apps still bring, take 3193. Both sets side by side, with
  several apps open, have not been tried. A renderer whose texture is full refuses the atlas. What the
  screen shows then is not known.
- **How the text reads at arm's length**, on the real screen, in daylight and at night. The small
  labels (17 to 22 px), the degree sign beside a temperature, and the big figures, whose digits are
  about a fifth lower than before.
- **How the digits look in motion.** The fixed pitch keeps a number still. How the wider gaps beside a
  1 and a 7 look on a running clock has only been seen in still pictures.
- **The three text sizes** are the kit's figures for iDrive 7 and iDrive 8. The kit marks its iDrive 8
  figures "not measured on a car yet".
- **The header, the settings and the slim button bar** as the kit draws them with this font.
- **Whether the Store builds and installs these versions.** No installable package was built here.

What stays in the car's own font, and so did not change: everything the head unit draws itself. That
is the Store's own screens, the app's name in the head unit's own menu, the head unit's own button bar
and its own settings screen, and the text lines of Warm-Up's small home-screen widget.

## 7. To bake the font again

Needs Python 3 with Pillow (11.3.0 was used) and the four Rajdhani files `Rajdhani-Regular.ttf`,
`-Medium.ttf`, `-SemiBold.ttf` and `-Bold.ttf` from https://github.com/google/fonts/tree/main/ofl/rajdhani.
The tool reads the kit's original Ubuntu atlases, for the eleven characters. It must not be given the
files it is about to write, so take the originals out of commit bad68cb first:

```
mkdir ubuntu-atlases
for f in label bold num light gear; do git show bad68cb:kit/runtime/fonts/$f.json > ubuntu-atlases/$f.json; done
python3 proven/tools/bake_proven_fonts.py <folder with the .ttf files> ubuntu-atlases kit/runtime/fonts
```

Then build the three apps and run every test, `test_fonts.js` on each app among them. A factor is
changed at the top of the tool. Another Pillow version may draw a pixel differently: the cacheKey
changes with the content, so the car's renderer never takes one atlas for another.
