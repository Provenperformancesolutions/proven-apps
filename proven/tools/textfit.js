'use strict';
/**
 * textfit.js - where the texts of a frame land, and the rules they have to keep. Used by test_fonts.js (Proven
 * Gauges, Proven Warm-Up, the settings the kit draws) and by test_drag_car.js through fakedrag.js (Proven Drag).
 *
 * The apps draw on the kit's frame surface (kit/runtime/record.js, a Recorder). A Recorder knows the text scale of
 * the screen it is for: 1 on the PC and in the kit's standard layout, larger where the kit draws full screen. A text
 * of size s is taken from the baked atlas of the next size up from s x scale, so another screen takes another atlas
 * for the same text. The atlases are baked so that a text is as wide in each of them (bake_proven_fonts.py;
 * test_fonts.js checks it). Still a layout is checked at every scale and not only at the PC's: an atlas can lack a
 * character another one has (the largest hold digits and a few letters only), an atlas baked otherwise would make
 * a text wider on one screen than on another, and the page itself differs where the kit runs the screen (buttons
 * are drawn on it, and on iDrive 7 its lowest panels reach further down).
 * watch() notes, for every frame and for the cached layers it is made of:
 *   texts   { s, x0, y, size, w, font }: the string, its left end, its baseline, its size, its width AT THE FRAME'S
 *           SCALE, its font family
 *   boxes   { x, y, w, h }: every filled or outlined rectangle large enough to hold a text (a panel, a tile, a
 *           status strip, a button, a dial's number window)
 * faults() then says what is wrong with a frame:
 *   - a character that has no glyph in the atlas this text is drawn from (it would be dropped without a mark)
 *   - a text that leaves the page (left, right, top or bottom)
 *   - two texts that lie on each other
 *   - a text that crosses the left or right edge of a box: it starts in a panel and ends outside it, or runs out
 *     of its button, its strip or its tile
 * picture() draws a frame at the pixel size of the screen it was made for, to look at it.
 *
 * The scales are the kit's own figures (kit/runtime/display.js, _place). Proven has measured none of them on a car,
 * and the kit marks its iDrive 8 figures "not measured on a car yet". A PC check: it shows where the kit's own
 * arithmetic puts each text, not what a head unit shows.
 */

/**
 * The screens a frame can be drawn for.
 *   pc      the PC preview, the software renderer and the kit's standard layout on iDrive 7: scale 1
 *   id7     iDrive 7, full screen, the kit running the screen: (1920 - 84) / 1576 = 1.164, 49 px of room under the page
 *   id8     iDrive 8, full screen, the kit running the screen: (764 - 80) / 482 = 1.419, no room under the page
 *   id8bar  iDrive 8, full screen with the kit's 48 px button bar under the page: (764 - 80 - 48) / 482 = 1.319
 */
const MODES = [
    { name: 'pc', scale: 1, own: false, extra: 0, says: 'PC' },
    { name: 'id7', scale: 1.164, own: true, extra: 49, says: 'iDrive 7' },
    { name: 'id8', scale: 1.419, own: true, extra: 0, says: 'iDrive 8' },
    { name: 'id8bar', scale: 1.319, own: false, extra: 0, says: 'iDrive 8 with the button bar' },
];
// a rectangle this large can hold a text: smaller ones are lamps, ticks, swatches and lines
const BOX_MIN_W = 60, BOX_MIN_H = 24;

/**
 * Note texts and boxes on every Recorder of a built app's kit (rec = its kit/record module). Call it before the
 * app is started: the kit takes makeLayer from the module when kit/gauges.js is first loaded.
 * opts.texts === false: boxes only (fakedrag.js notes the texts itself).
 */
function watch(rec, opts) {
    const R = rec.Recorder, P = R.prototype;
    if (P._fitWatched) return;
    P._fitWatched = true;
    const noteTexts = !(opts && opts.texts === false);
    const text0 = P.text, blit0 = P.blit, reset0 = P.reset, make0 = rec.makeLayer;
    if (noteTexts) {
        P.text = function (str, x, y, size, c, o) {
            const w = text0.apply(this, arguments), al = (o && o.align) || 'left';
            (this._texts || (this._texts = [])).push({ s: String(str), x0: al === 'center' ? x - w / 2 : al === 'right' ? x - w : x, y, size, w, font: (o && o.font) || 'label', clip: this._clipNow || null });
            return w;
        };
    }
    const box = (name) => {
        const f0 = P[name];
        if (typeof f0 !== 'function') return;
        P[name] = function (x, y, w, h) {
            if (w >= BOX_MIN_W && h >= BOX_MIN_H) (this._boxes || (this._boxes = [])).push({ x, y, w, h });
            return f0.apply(this, arguments);
        };
    };
    ['fillRect', 'roundRect', 'strokeRoundRect', 'card', 'gradientRect', 'rampRect'].forEach(box);
    const clip0 = P.clip, noclip0 = P.noclip;
    P.clip = function (x, y, w, h) { this._clipNow = { x, y, w, h }; return clip0.apply(this, arguments); };
    P.noclip = function () { this._clipNow = null; return noclip0.apply(this, arguments); };
    P.reset = function () { if (noteTexts) this._texts = []; this._boxes = []; this._clipNow = null; return reset0.apply(this, arguments); };
    P.blit = function (L, x, y) {
        const dx = Math.round(x), dy = Math.round(y);
        if (noteTexts) (L._texts || []).forEach((t) => (this._texts || (this._texts = [])).push(Object.assign({}, t, { x0: t.x0 + dx, y: t.y + dy, layer: true })));
        (L._boxes || []).forEach((b) => (this._boxes || (this._boxes = [])).push({ x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }));
        return blit0.apply(this, arguments);
    };
    rec.makeLayer = function (w, h, draw, ts) {
        let texts = [], boxes = [];
        const L = make0(w, h, (r) => { draw(r); texts = r._texts || []; boxes = r._boxes || []; }, ts);
        if (noteTexts) L._texts = texts;
        L._boxes = boxes;
        return L;
    };
}

/** A frame surface as the kit makes it for a screen (kit/runtime/display.js, canvas()). */
function surface(rec, w, h, mode) {
    const r = new rec.Recorder(w, h, { textScale: mode.scale });
    r.reset(); r.tabRects = null; r.chrome = { tabs: null }; r.place = null; r.own = mode.own; r.extra = mode.extra;
    return r;
}

/** Where a text's ink is taken to be: from its baseline up 0.7 of its size, a pixel in from either end. */
const inkOf = (t) => ({ x0: t.x0 + 1, x1: t.x0 + t.w - 1, y0: t.y - t.size * 0.70, y1: t.y });
const round = (x) => Math.round(x);

/**
 * What is wrong with one frame. texts, boxes: as watch() noted them. o:
 *   fonts    the built app's kit/fonts module          scale    the frame's text scale
 *   left, right, top, bottom   the page: no text may leave it
 *   allow    (optional) (text, box) => true for a text that is meant to cross that box
 */
function faults(texts, boxes, o) {
    const out = [];
    const live = texts.filter((t) => t.s.trim() && t.w > 0);
    texts.forEach((t) => {
        if (!t.s.trim()) return;
        const f = o.fonts.get(t.font, t.size * o.scale, t.s);
        const miss = f ? Array.from(t.s).filter((ch) => ch !== ' ' && !f.glyphs[ch.codePointAt(0)]) : Array.from(t.s);
        if (miss.length) out.push('"' + t.s + '" (' + t.font + ' ' + t.size + ' px) has no glyph for "' + miss.join('') + '"');
    });
    live.forEach((t) => {
        if (t.x0 < o.left - 0.5 || t.x0 + t.w > o.right + 0.5) out.push('"' + t.s + '" leaves the page (' + round(t.x0) + ' to ' + round(t.x0 + t.w) + ', the page is ' + o.left + ' to ' + o.right + ')');
        if (t.y - t.size * 0.7 < o.top || t.y > o.bottom) out.push('"' + t.s + '" leaves the page at the ' + (t.y > o.bottom ? 'bottom' : 'top') + ' (baseline ' + round(t.y) + ')');
    });
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const a = inkOf(live[i]), b = inkOf(live[j]);
        if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) out.push('"' + live[i].s + '" and "' + live[j].s + '" overlap at ' + round(Math.max(a.x0, b.x0)) + ',' + round(Math.max(a.y0, b.y0)));
    }
    out.push.apply(out, crossings(live, boxes, o.allow));
    return out;
}

/**
 * Texts that cross the left or right edge of a box they stand in. A text stands in a box when the middle of its
 * ink is between the box's top and bottom. It crosses an edge when it has ink on both sides of it.
 */
function crossings(texts, boxes, allow) {
    const out = [], seen = {};
    texts.forEach((t) => {
        if (!t.s.trim() || !(t.w > 0)) return;
        const a = inkOf(t), mid = (a.y0 + a.y1) / 2;
        (boxes || []).forEach((b) => {
            if (mid < b.y || mid > b.y + b.h) return;
            const l = b.x, r = b.x + b.w;
            const overL = a.x0 < l - 0.5 && a.x1 > l + 0.5, overR = a.x0 < r - 0.5 && a.x1 > r + 0.5;
            if (!overL && !overR) return;
            if (allow && allow(t, b)) return;
            const say = '"' + t.s + '" (' + round(t.x0) + ' to ' + round(t.x0 + t.w) + ') crosses the ' + (overL && overR ? 'edges' : overL ? 'left edge' : 'right edge') + ' of its box (' + round(l) + ' to ' + round(r) + ')';
            if (!seen[say]) { seen[say] = true; out.push(say); }
        });
    });
    return out;
}

/**
 * A frame drawn for a screen of text scale k, as the kit's software drawing code draws it at k times the pixels:
 * each glyph comes from the atlas that screen takes, at about its baked size. rec, canvas: the built app's
 * kit/record and kit/canvas modules. Returns a Canvas (its png() is the picture). The page alone: where the kit
 * runs the screen, the header over it is the kit's.
 */
function picture(rec, canvas, frame, k) {
    const scaled = (w, h) => {
        const s = new canvas.ScaledCanvas(w, h, k);
        // (a cached layer is drawn at k times the pixels as well, and put down pixel for pixel)
        s.blit = function (src, x, y) { this.canvas.blit(src, Math.round(x * k), Math.round(y * k)); return this; };
        return s;
    };
    const done = [];
    const soft = (id) => {
        const L = rec.layerById.get(id);
        if (!L || L._softK === k) return;
        (L.sublayers ? Array.from(L.sublayers) : []).forEach(soft);
        const s = scaled(L.w, L.h);
        rec.play(L.words, s);
        L.soft = s.canvas; L._softK = k; done.push(L);
    };
    (frame.layersUsed ? Array.from(frame.layersUsed) : []).forEach(soft);
    // (on iDrive 7 the page's lowest panels reach further down than the PC's 520 px: frame.extra)
    const out = scaled(frame.w, frame.h + (frame.extra || 0));
    rec.play(frame.words(), out);
    done.forEach((L) => { L.soft = null; L._softK = 0; });        // (a picture at the PC's size draws its layers anew)
    return out.canvas;
}

module.exports = { MODES, watch, surface, faults, crossings, inkOf, picture };
