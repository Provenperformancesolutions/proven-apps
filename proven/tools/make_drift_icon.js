'use strict';
/**
 * make_drift_icon.js <an existing Proven icon.png> <out icon.png> - Proven Drift's 140 x 140 tile icon: a car seen
 * from above, turned against an arrow that shows the way it travels, in the logo's colours over the PROVEN line
 * of the logo, on a transparent background (the HMI draws the tile behind it).
 *
 *   node proven/tools/make_drift_icon.js apps/pps_gauges/icon.png apps/pps_drift/icon.png
 *
 * The drawing is Proven's own: the same plain outline the app draws on its Drift tab (a body with a tapered nose
 * and tail, two windows, four wheels), made of straight-edged shapes in this file. No maker's shape, no badge.
 * Like make_drag_icon.js it needs nothing but Node and the kit: it is drawn with the kit's own software canvas
 * (kit/runtime/canvas.js) at four times the size and scaled down, and the PROVEN line is taken, pixel for pixel,
 * from the bottom of the icon given as first argument (the rows make_icon.py put it in: 108 and below).
 */
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { Canvas } = require(path.resolve(__dirname, '..', '..', 'kit', 'runtime', 'canvas.js'));

const N = 140, S = 4, WORD_Y = 108;
const WHITE = '#ffffff', SKY = '#50a8e0', BLUE = '#085898', RED = '#e02028';
const CX = 66, CY = 62, TURN = 38;             // the car's middle, and how far it is turned (degrees, nose to the left)
const K = 0.42;                                // the Drift tab's car is drawn 196 px long: this one is 82

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

// four times the size. A point of the car (x to its right, y to its front) turned counter-clockwise about its middle
const big = new Canvas(N * S, N * S), th = TURN * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
const P = (x, y) => [(CX + (x * c - y * s) * K) * S, (CY - (x * s + y * c) * K) * S];
const shape = (pts) => pts.map((p) => P(p[0], p[1]));
// the way it travels: an arrow straight up, behind the car
big.line(CX * S, CY * S, CX * S, 18 * S, 7 * S, SKY);
big.convex([[CX * S, 1 * S], [(CX - 12) * S, 20 * S], [(CX + 12) * S, 20 * S]], SKY);
// the angle between the two, as an arc from the arrow to the nose
big.arc(CX * S, CY * S, 50 * S, 55 * S, -TURN - 2, -15, RED);
// the wheels (the front ones turned back towards the way it travels), then the body, the windows and the roof
const wheel = (x, y, a) => { const ca = Math.cos(a), sa = Math.sin(a), w = 9, h = 21; return [[-w, h], [w, h], [w, -h], [-w, -h]].map((p) => P(x + p[0] * ca + p[1] * sa, y - p[0] * sa + p[1] * ca)); };
[[-45, 58, th], [45, 58, th], [-45, -56, 0], [45, -56, 0]].forEach((w) => big.convex(wheel(w[0], w[1], w[2]), WHITE));
big.fill(shape([[-28, 98], [28, 98], [39, 86], [42, 60], [42, -78], [36, -96], [-36, -96], [-42, -78], [-42, 60], [-39, 86]]), WHITE);
big.convex(shape([[-32, 46], [32, 46], [27, 20], [-27, 20]]), BLUE);
big.convex(shape([[-27, -40], [27, -40], [31, -64], [-31, -64]]), BLUE);
big.convex(shape([[-27, 14], [27, 14], [27, -34], [-27, -34]]), SKY);

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
console.log('icon', N + ' x ' + N, 'car at', CX + ',' + CY, 'turned', TURN, 'degrees; PROVEN line from', process.argv[2], 'rows', WORD_Y + ' to ' + (N - 1));
