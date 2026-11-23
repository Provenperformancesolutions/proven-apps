'use strict';
/**
 * make_drag_icon.js <an existing Proven icon.png> <out icon.png> - Proven Drag's 140 x 140 tile icon: a chequered
 * flag in the logo's colours over the PROVEN line of the logo, on a transparent background (the HMI draws the
 * tile behind it).
 *
 *   node proven/tools/make_drag_icon.js apps/pps_gauges/icon.png apps/pps_drag/icon.png
 *
 * WHY THIS FILE EXISTS: the icons of Proven Gauges and Proven Warm-Up are made by make_icon.py, which needs
 * Pillow and the logo's artwork file. Neither was on the machine Proven Drag was built on. make_icon.py has the
 * same flag as its third figure ("drag", same coordinates), so with Pillow and the artwork it makes this icon
 * too; until somebody has run that, the icon in the repository is the one this file made.
 * It needs nothing but Node and the kit: the flag is drawn with the kit's own software canvas
 * (kit/runtime/canvas.js) at four times the size and scaled down, and the PROVEN line is taken, pixel for
 * pixel, from the bottom of the icon given as first argument (the rows make_icon.py put it in: 112 and below).
 */
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { Canvas } = require(path.resolve(__dirname, '..', '..', 'kit', 'runtime', 'canvas.js'));

const N = 140, S = 4, WORD_Y = 108;
const WHITE = '#ffffff', BLUE = '#085898', RED = '#e02028';
// the flag: 4 x 3 fields from (FX, FY), each CW x CH, the top edge sagging by OFF at the five column lines
const FX = 37, FY = 14, CW = 22, CH = 20, OFF = [0, 5, 8, 6, 2];
const POLE = { x: 26, w: 7, top: 12, bottom: 104 }, KNOB = { x: 29.5, y: 10, r: 6.5 };

/** An 8-bit RGBA PNG (not interlaced) -> { w, h, d: RGBA bytes }. */
function readPng(file) {
    const b = fs.readFileSync(file);
    if (b.readUInt32BE(0) !== 0x89504e47 || b[24] !== 8 || b[25] !== 6 || b[28] !== 0) throw new Error(file + ': not an 8-bit RGBA PNG');
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20), parts = [];
    for (let i = 8; i < b.length;) { const len = b.readUInt32BE(i); if (b.toString('ascii', i + 4, i + 8) === 'IDAT') parts.push(b.slice(i + 8, i + 8 + len)); i += 12 + len; }
    const raw = zlib.inflateSync(Buffer.concat(parts)), d = Buffer.alloc(w * h * 4), row = w * 4;
    const paeth = (a, bb, c) => { const p = a + bb - c, pa = Math.abs(p - a), pb = Math.abs(p - bb), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? bb : c; };
    for (let y = 0; y < h; y++) {
        const f = raw[y * (row + 1)];
        for (let x = 0; x < row; x++) {
            const v = raw[y * (row + 1) + 1 + x], a = x >= 4 ? d[y * row + x - 4] : 0, up = y ? d[(y - 1) * row + x] : 0, ul = x >= 4 && y ? d[(y - 1) * row + x - 4] : 0;
            d[y * row + x] = (v + (f === 1 ? a : f === 2 ? up : f === 3 ? (a + up) >> 1 : f === 4 ? paeth(a, up, ul) : 0)) & 255;
        }
    }
    return { w, h, d };
}

const src = readPng(process.argv[2]);
if (src.w !== N || src.h !== N) throw new Error('the icon to take the PROVEN line from must be ' + N + ' x ' + N);

// the flag, four times the size
const big = new Canvas(N * S, N * S), k = (v) => v * S;
big.roundRect(k(POLE.x), k(POLE.top), k(POLE.w), k(POLE.bottom - POLE.top), k(POLE.w / 2), WHITE);
big.circle(k(KNOB.x), k(KNOB.y), k(KNOB.r), RED);
for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    const x0 = FX + i * CW, x1 = x0 + CW, yl = FY + j * CH + OFF[i], yr = FY + j * CH + OFF[i + 1];
    big.quad([[k(x0), k(yl)], [k(x1), k(yr)], [k(x1), k(yr + CH)], [k(x0), k(yl + CH)]], (i + j) % 2 ? BLUE : WHITE);
}

// scaled down (colours weighted by their opacity), then the PROVEN line as it is in the other icon
const out = new Canvas(N, N);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
        const i = ((y * S + v) * N * S + x * S + u) * 4, al = big.d[i + 3];
        r += big.d[i] * al; g += big.d[i + 1] * al; b += big.d[i + 2] * al; a += al;
    }
    const o = (y * N + x) * 4;
    if (a) { out.d[o] = Math.round(r / a); out.d[o + 1] = Math.round(g / a); out.d[o + 2] = Math.round(b / a); out.d[o + 3] = Math.round(a / (S * S)); }
}
for (let y = WORD_Y; y < N; y++) for (let x = 0; x < N * 4; x++) out.d[y * N * 4 + x] = src.d[y * N * 4 + x];
fs.writeFileSync(process.argv[3], out.png(9));
console.log('icon', N + ' x ' + N, 'flag from', FX + ',' + FY, 'PROVEN line from', process.argv[2], 'rows', WORD_Y + ' to ' + (N - 1));
