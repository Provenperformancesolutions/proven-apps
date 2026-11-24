'use strict';
/**
 * test_fonts.js <built app: dist/pps_gauges | dist/pps_warmup | dist/pps_drag> [folder for pictures]
 *
 * The font the Proven apps draw with (Rajdhani, baked by bake_proven_fonts.py) and where its texts land. One built
 * app per run: the checks that fit that app are made.
 *
 * For every app:
 *   - the five text atlases the built app carries load, hold every character of the kit's character sets, and
 *     carry a cacheKey, so the ids the car's renderer keeps them under are their own (kit/runtime/record.js)
 *   - the degree sign is large enough to show beside a number (bake_proven_fonts.py draws it larger than the
 *     font has it)
 *   - every digit takes the same room, and a text is as wide whichever atlas a screen takes for it
 *   - the licence of each font is in the built app, each atlas says what it was made from, and the characters
 *     that neither font has are the empty box they were before
 *   - what the kit takes from the 'label' atlas that is not text on the screen: where the head unit's own bar
 *     buttons are (kit/runtime/display.js, buttons())
 *   - the header the kit draws itself in its full-screen layout shows the app's name and every tab
 *   - the settings the kit draws itself where it runs the screen (kit/runtime/sheet.js): no label is cut short and
 *     no value in its own list, at the iDrive 7 and iDrive 8 text sizes. In the list of settings the kit gives a
 *     value 560 px and cuts a longer one: which values that is, is pinned (CUT_AT_560)
 * Proven Gauges: the five gauge sets on a stand-in car (fakecar.js), with and without the ethanol read-out, in
 *   km/h and mph, deg C and deg F, psi, bar and kPa, with nothing from the car, and with every figure at its widest.
 * Proven Warm-Up: the screen in every state on its test bench (warmup_bench.js), as horizontal bars and as round
 *   dials, in deg C and deg F, the announcement, and the picture of the home-screen widget.
 * Proven Drag: its screens are checked in every state by test_drag_car.js, with the same rules (textfit.js).
 *
 * Every screen is drawn at four text sizes (textfit.js MODES): the PC's, iDrive 7's, iDrive 8's, and iDrive 8's
 * with the kit's button bar under the page. At each one: every character has a glyph, no text lies on another,
 * none leaves the page, and none crosses the edge of the panel, tile, strip or button it stands in.
 *
 * With a folder as second argument a picture of every state is saved: <state>-<page>.png at the PC's size, and
 * <state>-<page>-id7.png / -id8.png drawn with the atlases iDrive 7 / iDrive 8 would take, at 1.164 / 1.419
 * times the pixels (the page alone: the header is the kit's there). All by the kit's software drawing code.
 *
 * A PC check. The text sizes are the kit's own figures, which Proven has not measured on a car, and the car's
 * GPU renderer has never been handed these atlases. Nothing here says what a head unit shows.
 *
 * PPS_TEST_ALL=1 in the environment: a failed check does not stop the run; they are listed at the end.
 */
const fs = require('fs'), os = require('os'), path = require('path');
const fit = require('./textfit');
const { checker } = require('./fakecar');

if (!process.argv[2]) { console.error('usage: node proven/tools/test_fonts.js dist/<pps_gauges|pps_warmup|pps_drag> [folder for pictures]'); process.exit(2); }
const APP = path.resolve(process.argv[2]), OUT = process.argv[3] ? path.resolve(process.argv[3]) : null;
const JS = path.join(APP, 'source', 'javascript'), KIT = path.join(JS, 'kit');
const spec = JSON.parse(fs.readFileSync(path.join(KIT, 'app-spec.json'), 'utf8'));
const rec = require(path.join(KIT, 'record')), fonts = require(path.join(KIT, 'fonts')), CV = require(path.join(KIT, 'canvas'));
fit.watch(rec);                         // before the kit's gauges.js is loaded (see textfit.js)
const ok = checker();
const W = 1600, H = 520, BOTTOM = 512;
const MODES = fit.MODES, MODE = {};
MODES.forEach((m) => { MODE[m.name] = m; });
const SIZES = 'at the PC, iDrive 7 and iDrive 8 text sizes';
const many = (list, n) => (list.length ? ':\n        ' + list.slice(0, n || 14).join('\n        ') + (list.length > (n || 14) ? '\n        ... and ' + (list.length - (n || 14)) + ' more' : '') : '');

/* ---------- pictures ---------- */
const save = (name, png) => { if (!OUT || !png) return; fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.isBuffer(png) ? png : png.png()); };
const picture = (frame, k) => fit.picture(rec, CV, frame, k);

/* ---------- what holds for every frame ---------- */
const pageOf = (mode) => ({ fonts, scale: mode.scale, left: 0, right: W, top: 0, bottom: BOTTOM + mode.extra });
const check = (frame, mode) => fit.faults((frame._texts || []).slice(), (frame._boxes || []).slice(), pageOf(mode));
const strings = (frame) => (frame._texts || []).map((t) => t.s);

/* =====================================================================================================
 * every app: the atlases, the licences, what the kit itself takes from them
 * ===================================================================================================== */
const FAMILIES = { label: [18, 24, 32, 44], bold: [24, 32, 44, 64], num: [40, 64, 96, 150], light: [32, 64, 110], gear: [200, 300] };
// the kit's character sets (kit/tools/bake_fonts.py; \u2014 is the long dash of the kit's set)
const TEXT = Array.from({ length: 95 }, (x, i) => String.fromCharCode(32 + i)).join('') + '°μ│·–\u2014…×±²³€↑↓→←✓✕';
const DIGITS = '0123456789.,:-+%°/ kmhKMHrpmbarpsiVNCFgsxµRPDSWLOT';
const GEAR = '0123456789NRPDSM-';
const CHARS = { label: [TEXT, TEXT, TEXT, TEXT], bold: [TEXT, TEXT, TEXT, TEXT], num: [TEXT, DIGITS, DIGITS, DIGITS], light: [TEXT, TEXT, DIGITS], gear: [GEAR, GEAR] };
// What Rajdhani does not have (bake_proven_fonts.py). FROM_UBUNTU: copied from the kit's Ubuntu atlas, so still the
// Ubuntu font's. NO_GLYPH: in neither font. The Ubuntu atlas holds its empty box for a missing character under each
// of them, and that box is copied: they are one and the same picture.
const FROM_UBUNTU = '\u00b2\u00b3\u00b5\u03bc\u2713', NO_GLYPH = '\u2190\u2191\u2192\u2193\u2502\u2715';
// The ink of a glyph in an atlas: its box (alpha of 64 or more) in pixels, and its picture as a string to compare.
const inkArea = (f, cp) => {
    const g = f.glyphs[cp];
    if (!g) return 0;
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = 0; y < g[3]; y++) for (let x = 0; x < g[2]; x++) if (f.alpha[(g[1] + y) * f.atlasW + g[0] + x] >= 64) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return x1 < 0 ? 0 : (x1 - x0 + 1) * (y1 - y0 + 1);
};
const picture1 = (f, cp) => {
    const g = f.glyphs[cp];
    if (!g) return null;
    const rows = [];
    for (let y = 0; y < g[3]; y++) rows.push(Buffer.from(f.alpha.slice((g[1] + y) * f.atlasW + g[0], (g[1] + y) * f.atlasW + g[0] + g[2])).toString('hex'));
    return g[2] + 'x' + g[3] + ':' + rows.join('');
};

async function atlases() {
    await ok.part('the atlases in the built app', async () => {
        const dir = path.join(KIT, 'fonts'), ids = {}, bad = [], keys = {}, sources = {}, boxes = [];
        let n = 0, rows = 0, rings = 0, full = 0;
        Object.keys(FAMILIES).forEach((fam) => {
            const j = JSON.parse(fs.readFileSync(path.join(dir, fam + '.json'), 'utf8'));
            keys[fam] = j.cacheKey;
            sources[fam] = String(j.source || '');
            if (j.sizes.map((s) => s.size).join() !== FAMILIES[fam].join()) bad.push(fam + ': baked sizes ' + j.sizes.map((s) => s.size).join(', ') + ', the kit\'s are ' + FAMILIES[fam].join(', '));
            FAMILIES[fam].forEach((size, i) => {
                const f = fonts.get(fam, size, 'A');
                n++;
                if (!f || f.family !== fam || f.size !== size) { bad.push(fam + ' ' + size + ': fonts.js gives ' + (f ? f.family + ' ' + f.size : 'nothing')); return; }
                rows += f.atlasH + 1;
                if (!f.alpha || f.alpha.length !== f.atlasW * f.atlasH) bad.push(fam + ' ' + size + ': ' + (f.alpha ? f.alpha.length : 0) + ' alpha bytes for ' + f.atlasW + ' x ' + f.atlasH);
                if (f.atlasW > 1024) bad.push(fam + ' ' + size + ': ' + f.atlasW + ' px wide, the car\'s renderer takes 1024');
                const miss = Array.from(CHARS[fam][i]).filter((ch) => !f.glyphs[ch.codePointAt(0)]);
                if (miss.length) bad.push(fam + ' ' + size + ': no glyph for "' + miss.join('') + '"');
                Object.keys(f.glyphs).forEach((k) => {
                    const g = f.glyphs[k], ch = String.fromCodePoint(Number(k));
                    if (!(g[6] > 0)) bad.push(fam + ' ' + size + ': "' + ch + '" has no advance');
                    if (g[0] < 0 || g[1] < 0 || g[0] + g[2] > f.atlasW || g[1] + g[3] > f.atlasH) bad.push(fam + ' ' + size + ': "' + ch + '" lies outside the atlas');
                    if (ch !== ' ' && !(g[2] > 0 && g[3] > 0)) bad.push(fam + ' ' + size + ': "' + ch + '" has no bitmap');
                });
                ids[fam + '@' + size] = rec.atlasId(f, f.family || fam);
                // the degree sign: the tool draws it 1.4 times as large as Rajdhani has it (DEGREE_SCALE), because the
                // font's own ring was a faint speck beside a number. The font's own ring has an ink box of 0.10 to 0.16
                // of a capital C's, the larger one 0.19 or more.
                const ring = inkArea(f, 176), cap = inkArea(f, 67);
                if (f.glyphs[176]) {
                    rings++;
                    if (!(cap > 0 && ring >= 0.18 * cap)) bad.push(fam + ' ' + size + ': the ring of the degree sign is too small to show beside a number (its ink box is ' + ring + ' px, a capital C\'s ' + cap + ')');
                }
                // the characters neither font has: one and the same empty box, as in the kit's own atlas. The ones
                // taken from the Ubuntu font each have a picture of their own.
                if (CHARS[fam][i] === TEXT) {
                    full++;
                    const pics = Array.from(NO_GLYPH).map((ch) => picture1(f, ch.codePointAt(0)));
                    if (!pics[0] || new Set(pics).size !== 1) boxes.push(fam + ' ' + size + ': the four arrows, the box line and the cross are not one and the same picture');
                    const own = Array.from(FROM_UBUNTU).filter((ch) => f.glyphs[ch.codePointAt(0)]).map((ch) => picture1(f, ch.codePointAt(0)));
                    if (new Set(own.concat(pics[0])).size !== own.length + 1) boxes.push(fam + ' ' + size + ': a character taken from the Ubuntu font has the empty box, or the picture of another');
                }
            });
        });
        ok(bad.length === 0, 'the five families load through the kit\'s fonts.js at their ' + n + ' sizes, each with every character of the kit\'s character set, inside an atlas no wider than 1024 px, and the degree sign is large enough to show in the ' + rings + ' atlases that hold one' + many(bad));
        // every digit takes the same room in each atlas, so a number does not change its width with its digits
        const pitch = [], m = new rec.Recorder(1, 1);
        Object.keys(FAMILIES).forEach((fam) => FAMILIES[fam].forEach((size) => {
            const f = fonts.get(fam, size, '0'), adv = Array.from('0123456789').map((ch) => f.glyphs[ch.codePointAt(0)][6]);
            if (new Set(adv).size !== 1) pitch.push(fam + ' ' + size + ': the digits are ' + adv.join(' ') + ' wide');
            // (and each digit's ink lies inside its room)
            Array.from('0123456789').forEach((ch) => { const g = f.glyphs[ch.codePointAt(0)]; if (g[4] < -1 || g[4] + g[2] > g[6] + 1) pitch.push(fam + ' ' + size + ': the ink of "' + ch + '" (' + g[4] + ' to ' + (g[4] + g[2]) + ') leaves its room of ' + g[6]); });
        }));
        const w = (s, fam, size) => m.textWidth(s, size, { font: fam, literal: true });
        ok(pitch.length === 0 && w('111', 'num', 150) === w('888', 'num', 150) && w('12.31', 'num', 84) === w('12.38', 'num', 84) && w('1', 'gear', 170) === w('8', 'gear', 170),
            'the ten digits take the same room in every atlas, as in the Ubuntu font: "111" is as wide as "888" (' + Math.round(w('888', 'num', 150)) + ' px at 150), a running clock keeps its width' + many(pitch));
        // a screen takes the atlas of the next size up from the size it draws at: the same text from another atlas on
        // the PC, iDrive 7 and iDrive 8. It has to be as wide from each (the advances are the font's own, not whole pixels)
        const LINES = [['label', 17, 'Rate and longest gap: while the speed changes. "stopped", "silent": nothing has arrived since.'],
            ['label', 18, 'sport display: waiting for car units  ·  engine unit: not answering'], ['label', 22, 'Keep below 4,000 rpm until warm  ·  waiting for engine oil, gearbox oil and coolant  ·  over 60 min'],
            ['label', 28, 'Manual speed scale (+: the car reads low)'], ['bold', 20, 'DOWNHILL START, SPEED READ HIGH AT LAUNCH'], ['bold', 26, 'UP TO TEMPERATURE'], ['bold', 30, '36°C'],
            ['num', 36, '12.63'], ['num', 46, '-0.04'], ['num', 64, '138'], ['num', 84, '288'], ['num', 136, '199'], ['num', 150, '288'], ['light', 28, 'Ready 87'], ['gear', 124, 'M8'], ['gear', 170, 'D4']];
        const uneven = [];
        let most = 0;
        LINES.forEach(([fam, size, text]) => {
            const ws = MODES.map((mode) => new rec.Recorder(W, H, { textScale: mode.scale }).textWidth(text, size, { font: fam, literal: true }));
            const spread = Math.max.apply(null, ws) - Math.min.apply(null, ws);
            most = Math.max(most, spread);
            if (spread > Math.max(1, ws[0] * 0.0025)) uneven.push(fam + ' ' + size + ' "' + text + '": ' + ws.map((x) => x.toFixed(1)).join(' / ') + ' px');
        });
        ok(uneven.length === 0, 'a text is as wide at every text size, whichever atlas the screen takes: ' + LINES.length + ' lines of the five families at the PC, iDrive 7 and iDrive 8 sizes, the largest difference ' + most.toFixed(2) + ' px' + many(uneven));
        ok(Object.keys(keys).every((f) => /^pps-rajdhani-[0-9a-f]{16}$/.test(keys[f] || '')) && new Set(Object.keys(keys).map((f) => keys[f])).size === 5,
            'each atlas carries its own cacheKey, made from its content: ' + Object.keys(keys).map((f) => f + ' ' + keys[f]).join(', '));
        // the id an atlas of the same family and size has without a cacheKey: the kit's own Ubuntu atlases have none
        const plain = {}, all = Object.keys(ids);
        all.forEach((k) => { const [fam, size] = k.split('@'); plain[k] = rec.atlasId({ size: Number(size), cacheKey: '' }, fam); });
        const others = [];
        fs.readdirSync(dir).filter((f) => /\.json$/.test(f) && !FAMILIES[f.replace('.json', '')]).forEach((f) => {
            const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
            j.sizes.forEach((s) => others.push(rec.atlasId({ size: s.size, cacheKey: j.cacheKey || '' }, j.family || f.replace('.json', ''))));
        });
        const vals = all.map((k) => ids[k]), plains = all.map((k) => plain[k]);
        ok(new Set(vals).size === vals.length && vals.every((v) => plains.indexOf(v) < 0 && others.indexOf(v) < 0),
            'the ' + vals.length + ' ids the car\'s renderer keeps them under are all different, none is the id of the kit\'s Ubuntu atlas of any family and size, none that of another atlas in the app (' + others.length + ' more)');
        ok(rows <= 4096, 'together they take ' + rows + ' rows of the renderer\'s glyph texture, which has two columns of 4096 rows for all apps together');
        const lic = (f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch (e) { return ''; } };
        // what each atlas says it was made from ("source"): Rajdhani, and the Ubuntu font exactly where the atlas holds
        // one of the characters taken from it or its empty box. The gear atlas holds none.
        const taken = Array.from(FROM_UBUNTU + NO_GLYPH);
        const wrong = Object.keys(FAMILIES).filter((fam) => {
            const holds = CHARS[fam].some((set) => taken.some((ch) => set.indexOf(ch) >= 0));
            return !/^Rajdhani \(SIL OFL 1\.1\)/.test(sources[fam]) || /Ubuntu/.test(sources[fam]) !== holds;
        }).map((fam) => fam + ': "' + sources[fam] + '"');
        ok(/Copyright \(c\) 2014, Indian Type Foundry/.test(lic('OFL-Rajdhani.txt')) && /SIL OPEN FONT LICENSE Version 1\.1/.test(lic('OFL-Rajdhani.txt')) && /UBUNTU FONT LICENCE Version 1\.0/.test(lic('UFL-Ubuntu.txt'))
            && wrong.length === 0 && /Ubuntu/.test(sources.label) && !/Ubuntu/.test(sources.gear) && boxes.length === 0 && full > 0,
            'the built app carries the licence of both fonts, OFL-Rajdhani.txt and UFL-Ubuntu.txt, and each atlas says what it was made from: gear holds nothing of the Ubuntu font and names Rajdhani alone, the other four name the Ubuntu font too. ' +
            'In the ' + full + ' atlases with the kit\'s whole character set, superscript 2 and 3, the Greek mu and the tick each have a picture of their own, and the four arrows, the box line and the cross are one and the same empty box, as in the kit\'s own atlases' + many(wrong.concat(boxes)));
    });

    await ok.part('what the kit takes from the atlases itself', async () => {
        // kit/runtime/display.js buttons(): the head unit's own bar buttons are taken to be as wide as their label in the
        // 'label' font at 40 px x 1.465, plus 180 px. The kit measured three of them on a head unit.
        const { HMI7 } = require(path.join(KIT, 'display')), b = HMI7.btn, m = new rec.Recorder(1, 1);
        const wide = (label) => Math.round(m.textWidth(label, b.size, { font: 'label' }) * b.k) + b.pad;
        const measured = { 'Next page': 412, 'Previous page': 507, Settings: 370 };
        const got = Object.keys(measured).map((l) => [l, wide(l), measured[l]]);
        ok(got.every((g) => Math.abs(g[1] - g[2]) <= 8), 'the kit works out where the head unit\'s own bar buttons are from the label atlas: ' +
            got.map((g) => '"' + g[0] + '" ' + g[1] + ' px (the kit measured ' + g[2] + ' on a head unit)').join(', ') + ': each within 8 px');
        const mine = (((spec.screens || [])[0] || {}).buttons || []).map((x) => String(x[1] || x[0]));
        ok(mine.length > 0 && mine.every((l) => wide(l) > b.pad + 40 && wide(l) < 700), 'this app\'s bar buttons by the same sum: ' + mine.map((l) => '"' + l + '" ' + wide(l) + ' px').join(', '));
    });
}

/**
 * The header the kit draws itself in its full-screen layout (kit/runtime/gauges.js header(), called by display.js
 * _drawChrome) with the tabs and badges a frame handed it: the app's name and every tab are drawn, on iDrive 7
 * (from the back-arrow column at 84 to the HMI's status icons at 1340) and on iDrive 8 (the whole width).
 */
function kitHeader(G, theme, tabs, badges, name) {
    const out = [];
    [['iDrive 7', 84, 1340 - 84, 1920], ['iDrive 8', 0, 2880, 2880]].forEach(([scr, x, w, sw]) => {
        const c = new rec.Recorder(sw, 80);
        const end = G.header(c, theme, x, 0, w, 80, spec.title, tabs, 0, badges, true, true);
        const drawn = strings(c);
        if (drawn.indexOf(spec.title) < 0) out.push(scr + ': the app\'s name is left out');
        tabs.forEach((t) => { if (drawn.indexOf(String(t).toUpperCase()) < 0) out.push(scr + ': the tab "' + t + '" is left out'); });
        if ((c.tabRects || []).length !== tabs.length) out.push(scr + ': ' + (c.tabRects || []).length + ' of ' + tabs.length + ' tabs can be touched');
        if (end > x + w + 0.5) out.push(scr + ': the header ends at ' + Math.round(end) + ', its room at ' + (x + w));
        fit.faults(c._texts || [], [], { fonts, scale: 1, left: x, right: x + w, top: 0, bottom: 80 }).forEach((f) => out.push(scr + ': ' + f));
        if (name && scr === 'iDrive 7') save(name, (() => { const cv = new CV.Canvas(sw, 80); cv.clear('#000000'); rec.play(c.words(), cv); return cv; })());
    });
    return out;
}

/* ---------- the settings the kit draws itself (kit/runtime/sheet.js) ---------- */
// In the list of settings the kit draws a setting's value in at most 560 px and cuts a longer one with "...". These are
// the values that are cut there. The one of Proven Drag was cut in the Ubuntu font as well, one character later; it is
// shown whole in the setting's own list of values.
const CUT_AT_560 = { pps_drag: ['Slip: speed split from first movement, distances after 1 ft'] };
async function settingsSheet(headUnit, register) {
    await ok.part('the settings, where the kit draws them itself (GPU renderer, full-screen layout)', async () => {
        const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pps-fonts-'));
        process.on('exit', () => { try { fs.readdirSync(dataDir).forEach((f) => fs.unlinkSync(path.join(dataDir, f))); fs.rmdirSync(dataDir); } catch (e) { /* gone */ } });
        const quiet = console.log; console.log = () => {};
        const hu = headUnit(APP, { dataDir, fresh: true, sets: { demo: 'off' }, image: () => Promise.resolve(), log: { info() {}, warn() {}, error() {}, debug() {} } });
        console.log = quiet;
        if (register) register();
        const settings = hu.settings, { listSheet } = require(path.join(KIT, 'sheet'));
        const theme = require(path.join(KIT, 'themes')).theme(settings.get('theme'));
        // every setting offered: the switches that show more settings are on, and each "when" holds
        (spec.settings || []).forEach((s) => { if (s.when) Object.keys(s.when).forEach((k) => { settings.values[k] = [].concat(s.when[k])[0]; }); });
        const offered = (spec.settings || []).filter((s) => settings.shown(s));
        const bad = {}, cut = {}, cutValue = {};
        let frames = 0, rowsSeen = 0, valuesSeen = 0;
        // (the rows glide to their place over a few frames: the last frame counts)
        const draw = (sh, mode) => { let r = null; for (let i = 0; i < 14; i++) { r = fit.surface(rec, W, H, mode); sh.draw(r, theme); } frames++; return r; };
        const look = (r, mode, where, list) => {
            // (a row scrolled half out of the list is clipped there: only what is inside the list's window counts)
            const seen = (r._texts || []).filter((t) => !t.clip || (t.y - t.size * 0.7 >= t.clip.y && t.y <= t.clip.y + t.clip.h));
            seen.forEach((t) => {
                if (!/\.\.\.$/.test(t.s)) return;
                // (in the list of settings a label starts at the row's left, its value ends at the row's right)
                if (list && t.x0 > 100) cutValue[t.s.replace(/\s*\.\.\.$/, '')] = true;
                else cut[mode.says + ', ' + where + ': "' + t.s + '"'] = true;
            });
            fit.faults(seen, r._boxes || [], pageOf(mode)).forEach((f) => { bad[mode.says + ', ' + where + ': ' + f] = true; });
        };
        [MODE.id7, MODE.id8].forEach((mode) => {
            const sh = listSheet(settings, null, { version: spec.version });
            const rows = sh.rows();
            rowsSeen = rows.length;
            offered.forEach((s, i) => {
                // the row with each value the setting can have beside its label
                const vals = s.type === 'choice' ? (s.options || []).map((o) => o[0]) : s.type === 'number' ? (s.steps || []) : [settings.get(s.key)];
                const was = settings.values[s.key];
                vals.forEach((v) => { settings.values[s.key] = v; sh.focus = i; look(draw(sh, mode), mode, 'the list at "' + s.label + '"', true); });
                settings.values[s.key] = was;
                // the list of its values
                if (s.type === 'choice' || s.type === 'number') {
                    sh.open = s;
                    const n = sh.rows().length;
                    for (let k = 0; k < n; k += 3) { sh.sub = k; look(draw(sh, mode), mode, 'the values of "' + s.label + '"'); }
                    sh.sub = n - 1; look(draw(sh, mode), mode, 'the values of "' + s.label + '"');
                    valuesSeen += n;
                    sh.open = null;
                }
            });
        });
        const cuts = Object.keys(cut), faults = Object.keys(bad);
        ok(offered.length === rowsSeen && offered.length > 0, 'all ' + offered.length + ' settings are rows of the list the kit draws (with Workshop settings and the other switches on)');
        ok(cuts.length === 0, 'no label is cut short with "..." in the list of settings, and no value in its own list of values (' + valuesSeen / 2 + ' values), at the iDrive 7 and iDrive 8 text sizes (' + frames + ' frames)' + many(cuts));
        // the values the kit cuts at 560 px in the list of settings: the ones pinned, each the start of its whole text
        const want = CUT_AT_560[spec.id] || [], got = Object.keys(cutValue);
        const known = got.every((g) => want.some((w) => w.indexOf(g) === 0 && g.length >= w.length - 12)) && want.every((w) => got.some((g) => w.indexOf(g) === 0));
        ok(known, 'in the list of settings the kit cuts a value at 560 px: ' + (want.length ? 'only "' + want.join('", "') + '", which reads "' + got.join('..." / "') + '..." there and is whole in its own list' : 'none of this app\'s is that long') +
            (known ? '' : ' (CUT: "' + got.join('", "') + '")'));
        ok(faults.length === 0, 'and in them no text lies on another, leaves the page or crosses the edge of its row' + many(faults));
        if (OUT) {
            const sh = listSheet(settings, null, { version: spec.version });
            save('settings-id7', picture(draw(sh, MODE.id7), MODE.id7.scale));
            save('settings-id8', picture(draw(sh, MODE.id8), MODE.id8.scale));
        }
    });
}

/* =====================================================================================================
 * Proven Gauges
 * ===================================================================================================== */
async function gauges() {
    const { clock, makeCar, healthy, mhdUnit } = require('./fakecar');
    const { headUnit } = require('../../kit/tools/hu-stub');
    const G = require(path.join(KIT, 'gauges'));
    const PAGES = ['street', 'track', 'boost', 'thermal', 'tyres'];
    clock.install();

    /** The app on a stand-in car (as test_screens.js). car.mode: which screen the next frame is drawn for. */
    async function open(opts) {
        opts = opts || {};
        clock.reset();
        const car = makeCar(APP, opts);
        let png = null, frame = null, wantPng = false, n = 0;
        const log = { info: (m) => car.logs.push('info ' + m), warn: (m) => car.logs.push('WARN ' + m), error: (m) => car.logs.push('ERROR ' + (m && m.stack || m)), debug() {} };
        const quiet = console.log; console.log = () => {};          // (the stand-in head unit says which screen it opens)
        const hu = headUnit(APP, { dataDir: car.ctx.dataDir, fresh: true, log, sets: Object.assign({ demo: 'off', splash: false }, opts.settings), image: async (name, cv) => { png = cv; } });
        hu.ctx.signals = car.ctx.signals;
        const canvas = hu.ctx.canvas, image = hu.ui.image, own = {};
        car.mode = MODE.pc;
        hu.ctx.canvas = (w, h) => {
            if (car.mode === MODE.pc) { frame = canvas(w, h); return frame; }
            const r = own[car.mode.name] || (own[car.mode.name] = new rec.Recorder(w, h, { textScale: car.mode.scale }));
            r.reset(); r.tabRects = null; r.chrome = { tabs: null }; r.place = null; r.own = car.mode.own; r.extra = car.mode.extra;
            frame = r;
            return r;
        };
        hu.ui.image = (name, cv) => (wantPng && car.mode === MODE.pc ? image(name, cv) : Promise.resolve());
        delete require.cache[path.join(JS, 'app.js')];               // the app starts anew for every car
        hu.start();
        await clock.advance(10);
        console.log = quiet;
        car.hu = hu;
        car.page = (name) => hu.display.onTab(PAGES.indexOf(name));
        /** Draw one frame for car.mode: the frame (its _texts and _boxes). */
        car.draw = async () => { await hu.loopFn(); return frame; };
        /** Drive for secs, a frame every 16 ms at the PC's size; feed(n) sends the car's signals. */
        car.drive = async (secs, feed) => { car.mode = MODE.pc; for (let t = 0; t < secs * 1000; t += 16) { if (feed) feed(n); n++; await hu.loopFn(); await clock.advance(16); } };
        car.png = async () => { car.mode = MODE.pc; wantPng = true; png = null; await hu.loopFn(); wantPng = false; return png; };
        return car;
    }

    /** Every set of one car at every text size: drawn, checked, saved. Returns { set: the PC's frame texts }. */
    let frames = 0;
    async function sets(car, name, feed, secs) {
        const all = {}, bad = [];
        let tabs = null;
        for (const p of PAGES) {
            await car.page(p);
            await car.drive(secs || 1, feed);
            for (const mode of MODES) {
                car.mode = mode;
                await car.draw();
                const f = await car.draw();
                frames++;
                check(f, mode).forEach((x) => bad.push(mode.name + ' ' + p + ': ' + x));
                if (mode === MODE.pc) all[p] = strings(f);
                else if (f.chrome && f.chrome.tabs) tabs = f.chrome.tabs;
                if (OUT && (mode === MODE.id7 || mode === MODE.id8)) save(name + '-' + p + '-' + mode.name, picture(f, mode.scale));
            }
            if (OUT) save(name + '-' + p, await car.png());
        }
        // the header the kit draws over the page where it runs the screen: this app's tabs, and Settings
        if (tabs) kitHeader(G, car.hu.ctx.theme(), tabs.tabs.concat(['Settings']), tabs.badges, OUT ? name + '-kit-header-id7' : null).forEach((x) => bad.push('the kit\'s header: ' + x));
        const errors = car.logs.filter((l) => /^ERROR|^WARN (history|boost trace|first render|engine unit poll)/.test(l));
        ok(bad.length === 0 && errors.length === 0, name + ': the five sets ' + SIZES + ': every letter has its glyph, no text on another, off the page or over the edge of its box' + many(bad.concat(errors)));
        return all;
    }

    /* ---------- the car's signals (raw values as the car sends them) ---------- */
    const g = (x) => 32500 + Math.round(x * 9.80665 / 0.002);
    /**
     * o: units (false: the car never names them), press (the car's pressure unit: 1 bar, 2 kPa, 3 psi), gear (1 to 8),
     * prog ('S' | 'M'), kmh, rpm, nm, boost (sport display raw), coolant, oil, gearbox, outside (deg C), tyres [4 raw:
     * 0.1 psi, 0.1 bar or 0.1 kPa a step, in the car's unit], tyreTemp (deg C), stand
     */
    const TYRES = { 1: [26, 26, 28, 28], 2: [2600, 2620, 2800, 2810], 3: [350, 352, 380, 381] };
    function signals(h, o) {
        o = Object.assign({ press: 3, kmh: 80, rpm: 3500, nm: 380, boost: 150, coolant: 90, oil: 105, gearbox: 80, outside: 28, tyreTemp: 36 }, o);
        if (!o.tyres) o.tyres = TYRES[o.press];
        if (o.units !== false) h.Vehicle.statusNewCurrentUnitsStatusExt({ unitOfMeasurementAirPressure: o.press, unitOfMeasurementTemperature: 1 });
        h.TPMS.statusTyrePressure({ actualValuePressureTyreFLH: o.tyres[0], actualValuePressureTyreFRH: o.tyres[1], actualValuePressureTyreRLH: o.tyres[2], actualValuePressureTyreRRH: o.tyres[3] });
        h.TPMS.statusTargetTyrePressure({ targetPressureTyreFLH: o.tyres[0], targetPressureTyreFRH: o.tyres[0], targetPressureTyreRLH: o.tyres[2], targetPressureTyreRRH: o.tyres[2] });
        h.TPMS.statusTyreTemperature({ actualValueTemperatureTyreFLH: o.tyreTemp + 40, actualValueTemperatureTyreFRH: o.tyreTemp + 41, actualValueTemperatureTyreRLH: o.tyreTemp + 45, actualValueTemperatureTyreRRH: o.tyreTemp + 46 });
        h.EnvironmentalInformation.ExteriorTemperature({ temperatureExterior: 80 + o.outside * 2 });
        h.CDS.statusEngineTemperature({ temperatureEngineDrive: o.coolant + 48, temperatureEngineOilDrive: o.oil + 48 });
        h.BasicDataSet.basicDataSet({ valueTemperatureTransmissionOil: o.gearbox + 47 });
        h.BasicDataSet.basicDataSet({ valueTemperatureTransmissionOil: o.gearbox + 48 });
        if (o.gear) h.VehicleInformation.statusGearboxDrive({ statusActualGearDrive: o.gear + 2, statusActualStageDrive: 4 });
        if (o.prog) h.MDrive.dataDisplayGearbox({ displayProgramGearbox: o.prog === 'M' ? 2 : 1 });
        return (n) => {
            h.CDS.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: o.rpm * 4 + (n % 5) * 8 });
            h.Vehicle2.statusCarSpeed2({ speedVehicleCentreOfGravity: o.stand ? 0 : o.kmh * 64 + (n % 3) });
            h.FES.statusSwitchDriveDynamicSport2({ displayBoostPressure: o.boost + (n % 20) });
            h.FES.statusActualValueTorque2({ actualValueTorqueCrankshaft: 2047 + 2 * o.nm + (n % 7) });
            h.CDS2.statusLongitudinalAccelerationMassCenter({ longitudinalAccelerationCentreOfGravity: g(o.stand ? 0.02 + (n % 2) * 0.002 : 0.2) });
            h.CDS2.statusLateralAccelerationMassCenter({ lateralAccelerationCentreOfGravity: g(o.stand ? 0.01 + (n % 2) * 0.002 : -0.4) });
        };
    }
    // a car with every figure at its widest: 288 km/h in M8, 6880 rpm, 888 Nm (640 kW), everything hot, tyres at 3.88
    const WIDE = { gear: 8, prog: 'M', kmh: 288, rpm: 6880, nm: 888, boost: 228, coolant: 118, oil: 138, gearbox: 128, outside: 38, tyres: [388, 388, 388, 388], tyreTemp: 88 };
    const WIDE_BAR = Object.assign({}, WIDE, { press: 1, prog: 'S', tyres: [38, 38, 38, 38] }), WIDE_KPA = Object.assign({}, WIDE, { press: 2, tyres: [3880, 3880, 3880, 3880] });
    const BIG = { maxPower: 800, maxTorque: 1200, redline: 7000 };

    await ok.part('Proven Gauges: nothing from the car', async () => {
        let s = await sets(await open({ reply: healthy() }), 'no-values');
        ok(s.thermal.indexOf('NO TEMPERATURE DATA') >= 0 && s.tyres.indexOf('Waiting for the car to say which units it uses.') >= 0, 'the states drawn are the ones meant: "NO TEMPERATURE DATA", "Waiting for the car to say which units it uses."');
        s = await sets(await open({ noLink: true }), 'no-link');
        ok(s.boost.filter((x) => x === 'no diagnostic link').length === 4, 'without a diagnostic link: four tiles say "no diagnostic link"');
    });

    await ok.part('Proven Gauges: a car as it drives, in each unit', async () => {
        let car = await open({ reply: healthy() });
        let s = await sets(car, 'psi-kmh', signals(car.handlers, { gear: 4 }), 3);
        ok(s.street.indexOf('km/h') >= 0 && s.boost.indexOf('Boost in psi  ·  last 60 s') >= 0 && s.tyres.indexOf('Since app start, psi') >= 0, 'km/h and psi (as shipped)');
        car = await open({ settings: { pressUnit: 'bar', speedUnit: 'mph', tempUnit: 'f', powerUnit: 'hp', torqueUnit: 'lbft', boostMax: '3.5' }, reply: healthy() });
        s = await sets(car, 'bar-mph', signals(car.handlers, { gear: 6, press: 1, boost: 105 }), 3);
        ok(s.street.indexOf('mph') >= 0 && s.street.indexOf(' hp') >= 0 && s.street.indexOf(' lb-ft') >= 0 && s.thermal.some((x) => /°F/.test(x)) && s.boost.indexOf('Boost in bar  ·  last 60 s') >= 0 && s.tyres.indexOf('2.6') >= 0, 'mph, deg F, bar (tyres at 2.6), hp and lb-ft');
        car = await open({ settings: { pressUnit: 'kpa', powerUnit: 'ps', boostMax: '3.0' }, reply: healthy() });
        s = await sets(car, 'kpa-kmh', signals(car.handlers, { gear: 3, press: 2, boost: 105 }), 3);
        ok(s.boost.indexOf('Boost in kPa  ·  last 60 s') >= 0 && s.street.indexOf(' PS') >= 0 && s.tyres.indexOf('260') >= 0, 'kPa (tyres at 260) and PS');
        // a manual car (no gear signal), one tyre flat, the car never names its units
        car = await open({ reply: healthy() });
        const feed = signals(car.handlers, { units: false, tyres: [350, 352, 380, 50] });        // (35 / 35 / 38 / 5 psi)
        await car.drive(9, feed);
        s = await sets(car, 'units-unknown', feed, 1);
        ok(s.tyres.indexOf('Car\'s units unknown: pressures read by their size.') >= 0 && s.tyres.indexOf('out of range') >= 0 && s.street.indexOf('EST.') >= 0, 'a car that never names its units, with a flat tyre and an estimated gear');
    });

    await ok.part('Proven Gauges: every figure at its widest', async () => {
        let car = await open({ settings: BIG, reply: healthy() });
        let s = await sets(car, 'wide-psi-kmh', signals(car.handlers, WIDE), 3);
        ok(s.street.indexOf('288') >= 0 && s.street.indexOf('M') >= 0 && s.street.indexOf('8') >= 0 && s.thermal.indexOf('HOT') >= 0 && s.tyres.indexOf('39') >= 0, '288 km/h in M8, hot, in km/h, deg C and psi (tyres at 39)');
        car = await open({ settings: Object.assign({ pressUnit: 'bar', speedUnit: 'mph', tempUnit: 'f', powerUnit: 'hp', torqueUnit: 'lbft', boostMax: '3.5' }, BIG), reply: healthy() });
        s = await sets(car, 'wide-bar-mph', signals(car.handlers, WIDE_BAR), 3);
        ok(s.street.indexOf('179') >= 0 && s.thermal.some((x) => /^2\d\d$/.test(x)) && s.street.indexOf('S') >= 0 && s.tyres.indexOf('3.8') >= 0, '179 mph in S8, three-digit deg F, bar (tyres at 3.8), hp and lb-ft');
        car = await open({ settings: Object.assign({ pressUnit: 'kpa', powerUnit: 'ps', engine: 'diesel' }, BIG), reply: (() => { const h = healthy(); return (a, sid, d) => (a === 0x12 && sid === 0x22 && d[0] === 0xF4 && d[1] === 0x23 ? [0x62, 0xF4, 0x23, 0x4E, 0x20] : h(a, sid, d)); })() });
        s = await sets(car, 'wide-kpa-diesel', signals(car.handlers, WIDE_KPA), 3);
        ok(s.boost.indexOf('200000') >= 0 && s.tyres.indexOf('388') >= 0, 'kPa: a diesel\'s 200000 kPa of rail pressure, tyres at 388');
    });

    await ok.part('Proven Gauges: the ethanol read-out on the Boost set', async () => {
        let car = await open({ settings: { ethanol: '550d' }, reply: healthy({ '22:550D': [0x45] }) });
        let s = await sets(car, 'ethanol-reading', signals(car.handlers, { gear: 4 }), 3);
        ok(s.boost.indexOf('ETHANOL  E27') >= 0 && s.boost.indexOf('engine unit, value 550D') >= 0, 'a reading: "ETHANOL  E27", "engine unit, value 550D"');
        car = await open({ settings: { ethanol: 'obd52' }, reply: healthy({ '22:550D': [0x45] }) });
        s = await sets(car, 'ethanol-not-on-this-car', signals(car.handlers, { gear: 4 }), 3);
        ok(s.boost.indexOf('ETHANOL  NO READING') >= 0 && s.boost.indexOf('not on this car') >= 0, 'no reading: "ETHANOL  NO READING", "not on this car"');
        car = await open({ settings: { ethanol: 'mhd', pressUnit: 'bar', speedUnit: 'mph' }, reply: mhdUnit({ active: 85, can: 84 }) });
        s = await sets(car, 'ethanol-mhd-flex', signals(car.handlers, { gear: 4, press: 1, boost: 105 }), 6);
        ok(s.boost.indexOf('ETHANOL  E85') >= 0 && s.boost.indexOf('MHD flex  ·  sensor E84') >= 0, 'MHD flex, in bar and mph: "ETHANOL  E85", "MHD flex  ·  sensor E84"');
        car = await open({ settings: { ethanol: 'mhd' }, reply: mhdUnit({ family: '6B21' }) });
        s = await sets(car, 'ethanol-mhd-flex-not-supported', signals(car.handlers, { gear: 4 }), 6);
        ok(s.boost.indexOf('software not supported') >= 0, 'MHD flex on a program that is not in the list: "software not supported"');
        // every reason the strip can give, as vitals.js words them
        const h = healthy();
        car = await open({ settings: { ethanol: '550d' }, holdMs: 0, reply: (a, b, c) => (a === 0x12 ? null : h(a, b, c)) });
        const feed = signals(car.handlers, { gear: 4 });
        await car.page('boost'); await car.drive(20, feed);
        s = await sets(car, 'ethanol-engine-unit-silent', feed, 1);
        ok(s.boost.indexOf('ETHANOL  NO READING') >= 0 && s.boost.filter((x) => x === 'not answering').length === 4, 'an engine unit that does not answer: the strip, and four tiles that say "not answering"');
        car = await open({ settings: { ethanol: '550d', demo: 'on' }, reply: healthy({ '22:550D': [0x45] }) });
        s = await sets(car, 'ethanol-demo', null, 3);
        ok(s.boost.indexOf('demo: not read') >= 0 && s.street.some((x) => x === 'D' || x === 'S'), 'the demo drive: "demo: not read", and its gear with D or S');
    });
    console.log('  (' + frames + ' frames drawn and checked)');

    await ok.part('Proven Gauges: the longest line under a boost dial', async () => {
        // every reason vitals.js can give for a boost dial without a reading (boostWhy), and the note on a car that never
        // named its units. On the Boost set the line is centred under the dial at x 250, and the chart's panel starts at 488.
        const fes = ['waiting for car units', 'at its limit', 'not a real value', 'no value', 'nothing', 'not changing'];
        const dme = ['engine data off', 'no diagnostic link', 'diagnostic link down', 'engine unit: not answering', 'engine unit: no boost value', 'engine unit: reading...'];
        const lines = ['no boost from the sport display', 'car\'s units unknown: sport display read as bar / kPa', 'car\'s units unknown: sport display read as psi'].concat(dme);
        fes.forEach((f) => { lines.push('sport display: ' + f); dme.forEach((d) => lines.push('sport display: ' + f + '  ·  ' + d)); });
        const room = 2 * (488 - 250), wide = [];
        let longest = { w: 0 };
        MODES.forEach((mode) => {
            const r = new rec.Recorder(W, H, { textScale: mode.scale });
            lines.forEach((l) => { const w = r.textWidth(l, 18, { literal: true }); if (w > longest.w) longest = { w, l, mode }; if (w > room) wide.push(mode.name + ': "' + l + '" is ' + Math.round(w) + ' px'); });
        });
        ok(wide.length === 0, 'all ' + lines.length + ' lines a boost dial can have under it fit the ' + room + ' px beside the chart at every text size (the longest: "' + longest.l + '", ' + Math.round(longest.w) + ' px at the ' + longest.mode.says + ' size)' + many(wide));
    });
    await settingsSheet(headUnit, () => require(path.join(JS, 'proven-theme')).register());
}

/* =====================================================================================================
 * Proven Warm-Up
 * ===================================================================================================== */
async function warmup() {
    const bench = require('./warmup_bench')(APP);
    const { boot, advance } = bench;
    const G = require(path.join(KIT, 'gauges'));
    const { headUnit } = require('../../kit/tools/hu-stub');

    // the widget's picture is drawn on a ScaledCanvas (kit/runtime/canvas.js): its texts, in the widget's own px
    let widgetTexts = null;
    const sText = CV.ScaledCanvas.prototype.text;
    CV.ScaledCanvas.prototype.text = function (str, x, y, size, c, o) {
        const w = sText.apply(this, arguments), al = (o && o.align) || 'left';
        if (widgetTexts) widgetTexts.push({ s: String(str), x0: al === 'center' ? x - w / 2 : al === 'right' ? x - w : x, y, size, w, font: (o && o.font) || 'label' });
        return w;
    };

    // Horizontal bars: a row's name and state stand left of its bar, its temperature right of it. The bar is drawn in
    // slanted pieces, not as a box, so the room on either side of it is given here (main.js: ROW_Y, ROW_H, BAR_X, BAR_W):
    // a text may not come closer than 8 px to the bar.
    const BESIDE_BAR = [];
    [108, 244, 380].forEach((y) => { BESIDE_BAR.push({ x: 24, y, w: 330 - 8 - 24, h: 128 }); BESIDE_BAR.push({ x: 330 + 722 + 8, y, w: 24 + 1204 - (330 + 722 + 8), h: 128 }); });
    let frames = 0;
    /** The car's app with the frame surface of each screen (as fakedrag.js), and its states at every text size. */
    async function start(sets, name) {
        const car = await boot({ sets });
        const hu = car.hu, canvas = hu.ctx.canvas, own = {};
        let frame = null, wantPng = false;
        car.mode = MODE.pc;
        hu.ctx.canvas = (w, h) => {
            if (car.mode === MODE.pc) { frame = canvas(w, h); return frame; }
            const r = own[car.mode.name] || (own[car.mode.name] = new rec.Recorder(w, h, { textScale: car.mode.scale }));
            r.reset(); r.tabRects = null; r.chrome = { tabs: null }; r.place = null; r.own = car.mode.own; r.extra = car.mode.extra;
            frame = r;
            return r;
        };
        const image = hu.ui.image;
        hu.ui.image = (n, cv) => (wantPng && car.mode === MODE.pc ? image(n, cv) : Promise.resolve());
        car.draw = async () => { await hu.loopFn(); return frame; };
        car.png = async () => { car.mode = MODE.pc; wantPng = true; car.picture = null; await hu.loopFn(); wantPng = false; return car.picture; };
        car.name = name;
        car.bars = (sets || {}).gaugeStyle !== 'dials';
        car.screen = true; car.widget = true;
        return car;
    }
    /**
     * The screen as it is now, at every text size, and the widget's picture: checked and saved. what(st): whether the
     * state reached is the one meant. Returns the texts of the PC's frame.
     */
    async function state(car, name, what) {
        const bad = [], st = car.status();
        let pc = null, tabs = null;
        for (const mode of MODES) {
            car.mode = mode;
            await car.draw();
            const f = await car.draw();
            frames++;
            // (the announcement lies over the page on purpose: while it shows, only its own texts are checked)
            const over = (f._texts || []).some((t) => t.s === 'UP TO TEMPERATURE' && t.size === 52);
            const texts = over ? (f._texts || []).slice((f._texts || []).findIndex((t) => t.s === 'UP TO TEMPERATURE' && t.size === 52)) : (f._texts || []).slice();
            fit.faults(texts, over ? [] : (f._boxes || []).slice().concat(car.bars ? BESIDE_BAR : []), pageOf(mode)).forEach((x) => bad.push(mode.name + ': ' + x));
            if (mode === MODE.pc) pc = strings(f); else if (f.chrome && f.chrome.tabs) tabs = f.chrome.tabs;
            if (OUT && (mode === MODE.id7 || mode === MODE.id8)) save(car.name + '-' + name + '-' + mode.name, picture(f, mode.scale));
        }
        car.mode = MODE.pc;
        if (OUT) save(car.name + '-' + name, await car.png());
        if (tabs) kitHeader(G, car.hu.ctx.theme(), tabs.tabs.concat(['Settings']), tabs.badges, OUT ? car.name + '-' + name + '-kit-header-id7' : null).forEach((x) => bad.push('the kit\'s header: ' + x));
        // the widget's picture: 384 x 256, everything inside the box the HMI does not crop, each fluid in its column
        const sw = car.hu.spec.startWidget || {}, size = sw.size || [384, 256], sf = sw.safe || [0.09, 0.17], k = sw.scale || 1;
        const x0 = Math.round(size[0] * sf[0]), y0 = Math.round(size[1] * sf[1]), x1 = size[0] - x0, y1 = size[1] - y0, cw = (x1 - x0 - 20) / 3;
        widgetTexts = [];
        let wpng = null;
        for (const i of car.hu.WIDGETS) wpng = await car.hu.widgetFn(i);
        const wt = widgetTexts; widgetTexts = null;
        const once = wt.slice(0, wt.length / car.hu.WIDGETS.length);
        // (the three columns: a fluid's texts from its name down do not run into the next column)
        const cols = [0, 1, 2].map((i) => ({ x: x0 + i * (cw + 10), y: y0 + 30, w: cw + 9, h: y1 - y0 - 50 }));
        fit.faults(once, cols, { fonts, scale: k, left: x0, right: x1, top: y0, bottom: y1 }).forEach((x) => bad.push('widget: ' + x));
        if (OUT && wpng) save(car.name + '-' + name + '-widget', wpng);
        const meant = what ? what(st, pc, once.map((t) => t.s)) : true;
        const errors = car.errors.map((e) => 'frame: ' + (e && e.stack || e)).concat(car.logs.filter((l) => /^ERROR |^WARN tick |^WARN first render/.test(l)));
        ok(meant && bad.length === 0 && errors.length === 0, car.name + ' ' + name + (meant ? '' : ' (NOT THE STATE MEANT: ' + st.overall + ', ' + JSON.stringify(pc.slice(0, 2)) + ')') + ': the screen ' + SIZES + ' and the widget\'s picture: every letter has its glyph, no text on another, off the page or over the edge of its box' + many(bad.concat(errors)));
        return pc;
    }

    for (const [style, unit] of [['bars', 'c'], ['bars', 'f'], ['dials', 'c'], ['dials', 'f']]) {
        const tag = style + '-' + unit, F = unit === 'f', sets = { gaugeStyle: style, tempUnit: unit };
        await ok.part('Proven Warm-Up: ' + (style === 'bars' ? 'horizontal bars' : 'round dials') + ', deg ' + unit.toUpperCase(), async () => {
            let gb = 20;
            const zf = (c) => { c.egs = c.zf(() => gb); return c; };
            // nothing from the car, then the engine running with nothing
            let car = await start(sets, tag);
            await advance(3000);
            await state(car, 'no-reading', (st, t) => st.overall === 'nodata' && t.indexOf('NO TEMPERATURE DATA') >= 0);
            car.rpm = 900; car.speed = 0; await advance(4000);
            await state(car, 'no-reading-engine-running', (st, t) => st.overall === 'nodata' && t.some((x) => /^Keep below 4,000 rpm/.test(x)));
            // a cold start: warming up, no time yet; then with a time; past the limit; a time over 60 min
            gb = 20; car = zf(await start(sets, tag)); car.rpm = 900; car.speed = 0; car.temps(22, 21);
            await advance(5000);
            await state(car, 'warming-up', (st, t) => st.overall === 'warming' && t.indexOf('WARMING UP') >= 0);
            car.rpm = 5287; await advance(1500);
            await state(car, 'ease-off', (st, t) => st.over && t.indexOf('EASE OFF') >= 0 && t.some((x) => /rpm on a cold engine  ·  keep below 4,000 rpm until warm$/.test(x)));
            car.rpm = 900; await advance(80000);
            await state(car, 'ready-in-over-60-min', (st, t) => st.overall === 'warming' && t.indexOf('READY IN OVER 60 MIN') >= 0);
            for (let s = 0; s < 150; s += 5) { car.temps(22 + Math.round(s / 5), 21 + Math.round(s / 6)); gb = 20 + Math.round(s / 8); await advance(5000); }
            await state(car, 'ready-in-about', (st, t) => st.overall === 'warming' && t.some((x) => /^READY IN ABOUT \d+ MIN$/.test(x)));
            // engine off while cold
            car.rpm = 0; await advance(15000);
            await state(car, 'engine-off', (st, t) => st.overall === 'off' && t.indexOf('ENGINE OFF') >= 0);
            // a watched warm-up to ready: the announcement, then the plain screen
            gb = 30; car = zf(await start(sets, tag)); car.rpm = 900; car.speed = 0; car.temps(40, 30);
            await advance(20000);
            for (let s = 0; s <= 60; s += 5) { car.temps(Math.min(92, 40 + s), Math.min(95, 30 + Math.round(s * 1.2))); gb = Math.min(75, 30 + s); await advance(5000); if (car.status().overall === 'ready') break; }
            await advance(1500);
            await state(car, 'announcement', (st, t) => st.overall === 'ready' && t.filter((x) => x === 'UP TO TEMPERATURE').length >= 2);
            await advance(8000);
            await state(car, 'ready', (st, t) => st.overall === 'ready' && t.indexOf('✓  READY') >= 0 && t.some((x) => /are in their safe range$/.test(x)));
            // a fluid dips; then two
            car.temps(76, 95); await advance(4000);
            await state(car, 'ready-one-dipped', (st, t) => st.overall === 'ready' && t.indexOf(F ? 'BELOW 176°F' : 'BELOW 80°C') >= 0 && t.indexOf('dipped after the warm-up') >= 0);
            car.temps(76, 74); await advance(4000);
            await state(car, 'ready-two-dipped', (st, t) => st.overall === 'ready' && t.some((x) => /have dipped a little$/.test(x)));
            // the gearbox unit stops answering: ready on its last reading
            car.temps(92, 95); car.egs = null; await advance(40000);
            await state(car, 'ready-gearbox-on-its-last-reading', (st, t) => st.overall === 'ready' && st.held.join() === 'gearbox' && t.indexOf('on its last reading, ' + (F ? '167°F' : '75°C')) >= 0);
            // ... and a fluid dips at the same time: the longest status line there is
            car.temps(76, 95); await advance(4000);
            await state(car, 'ready-one-dipped-gearbox-on-its-last-reading', (st, t) => st.overall === 'ready' && t.some((x) => /^Engine oil is in its safe range  ·  coolant has dipped below (80°C|176°F)  ·  gearbox oil on its last reading$/.test(x)));
            // too hot: one, then all three, at three digits
            gb = 75; zf(car); car.temps(92, 121); await advance(8000);
            await state(car, 'too-hot-engine-oil', (st, t) => st.overall === 'hot' && t.some((x) => /^Engine oil above its limit/.test(x)));
            gb = 128; car.temps(124, 138); await advance(8000);
            await state(car, 'too-hot-all-three', (st, t) => st.overall === 'hot' && t.some((x) => /^Engine oil, gearbox oil and coolant above their limits/.test(x)) && t.indexOf(F ? '280' : '138') >= 0);
            // no gearbox reading: waited for (NO READING), then left out (not monitored); a gearbox switched off in Settings
            car = await start(sets, tag); car.rpm = 900; car.speed = 0; car.temps(90, 92);
            await advance(8000);
            await state(car, 'no-gearbox-reading', (st, t) => st.overall === 'warming' && t.indexOf('NO READING') >= 0 && t.indexOf('no gearbox oil temperature reading') >= 0);
            await advance(110000);
            await state(car, 'gearbox-left-out', (st, t) => st.overall === 'ready' && st.unwatched.join() === 'gearbox' && t.some((x) => /gearbox oil not monitored$/.test(x)));
            car = await start(Object.assign({ gearboxSource: 'none', branding: false }, sets), tag); car.rpm = 900; car.speed = 0; car.temps(60, 55);
            await advance(8000);
            await state(car, 'gearbox-not-monitored-no-logo', (st, t) => t.indexOf('NOT MONITORED') >= 0 && t.indexOf('switched off in Workshop settings') >= 0);
            // no engine oil reading, the rest warm; and the demo warm-up
            gb = 70; car = zf(await start(sets, tag)); car.rpm = 900; car.speed = 0; car.temps(90, null);
            await advance(8000);
            await state(car, 'no-engine-oil-reading', (st, t) => st.overall === 'warming' && t.indexOf('no engine oil temperature reading') >= 0);
            car = await start(Object.assign({ demo: 'on' }, sets), tag);
            await advance(12000);
            await state(car, 'demo', (st, t, w) => w.indexOf('DEMO DATA') >= 0);
        });
    }
    console.log('  (' + frames + ' frames drawn and checked)');
    const mishaps = bench.mishaps();
    ok(mishaps.length === 0, 'no frame threw and the app logged no error in any of these drives' + many(mishaps));
    await settingsSheet(headUnit, () => require(path.join(JS, 'proven-theme')).register());
}

/* =====================================================================================================
 * Proven Drag: its screens are in test_drag_car.js; here the kit's own header and settings
 * ===================================================================================================== */
async function drag() {
    const { headUnit } = require('../../kit/tools/hu-stub');
    const G = require(path.join(KIT, 'gauges'));
    await ok.part('Proven Drag: the header the kit draws (the screens themselves are checked by test_drag_car.js)', async () => {
        require(path.join(JS, 'proven-theme')).register();
        const theme = require(path.join(KIT, 'themes')).theme('proven'), tabs = require(path.join(JS, 'screens')).TABS.concat(['Settings']);
        const bad = kitHeader(G, theme, tabs, [{ text: 'BETA' }, { text: 'DEMO' }], OUT ? 'kit-header-id7' : null);
        ok(tabs.length === 5 && bad.length === 0, 'the kit\'s full-screen header shows "Proven Drag", its four tabs, Settings, and the BETA and DEMO badges on iDrive 7 and iDrive 8' + many(bad));
    });
    await settingsSheet(headUnit, null);
}

(async () => {
    await atlases();
    if (spec.id === 'pps_gauges') await gauges();
    else if (spec.id === 'pps_warmup') await warmup();
    else if (spec.id === 'pps_drag') await drag();
    else ok(false, 'not a Proven app: ' + spec.id);
    ok.done();
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
