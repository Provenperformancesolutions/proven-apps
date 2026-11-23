'use strict';
/**
 * gpsscale.js - Proven Drag: the speed scale from GPS, the reader for the GPS receiver's sentences (NMEA),
 * and GPS height. Pure logic: every time comes in as an argument, nothing is read from the car here.
 *
 * WHY: the biggest error in any time taken from the car's own speed is the scale of that speed (tyre size
 * and wear). Per 1 % of scale, on the test model: 0.05 s on 0-100 km/h for a car that does it in 3 s, 0.12 s
 * for a 6.5 s car, 0.24 s for a 12 s car; 0.07 to 0.12 s on the 1/4 mile. The head unit's GPS is far too
 * slow (1 to 3 fixes a second) to time a run, but over a steady stretch it says how far off the car's
 * speed is. factor = true speed / the car's speed; a run multiplies every speed by it (1.012 = the car
 * reads 1.2 % low, every speed is taken 1.2 % higher).
 *
 *   parseNmea(text)                 -> { rmc: [...], gga: [...], ok, bad, other }   (no position and no course is read out)
 *   const g = new GpsScale({ saved, onResult })
 *   g.speed(t, kmh)                 every vehicle speed sample (either series), t ms on a forward-only clock
 *   g.nmea(t, text)                 SatellitePositioning.updatePosition's nmeaString
 *   g.position(t, lat, lon, src)    src 'gps' (GPSData.GPSPositionCAN) | 'nav' (Positioning.currentLocation), degrees
 *   g.heightCan(t, metres)          GPSPositionExtendedCAN's height
 *   g.result()                      -> { factor, method: 'rmc' | 'legs', count, saved, date } | null
 *   g.status()                      for the Signals page (counts, ratios, satellites: never a position)
 *   g.height(now)                   -> { m, src: 'gga' | 'can' } | null
 *   g.export(wallNow), g.load(saved), g.reset()
 *   scaleFor(setting, manual, result) -> { factor, source, label: 'GPS x0.987' | 'MANUAL +1.25 %' | 'UNCALIBRATED' }
 *
 * METHOD 1, GPS SPEED (RMC sentences). While the vehicle speed is above 60 km/h, has moved by less than
 * 2 km/h over the last 2 s, and the receiver (GGA, if it sends one) reports a fix with 6 or more
 * satellites: ratio = GPS km/h / vehicle km/h (the vehicle speed taken as the middle of those 2 s, because
 * the GPS speed is a little old when it arrives). 60 ratios or more: factor = their median, accepted when
 * the middle 80 % of them lie within 1 % of it and it is between 0.90 and 1.10. That is the brief's rule.
 * HOW OLD the GPS speed is when it arrives is not known, and "less than 2 km/h over 2 s" lets through a car
 * that gains or loses almost 1 km/h every second: every ratio is then off the same way (by up to 1 %, found
 * in the first review) and their spread says nothing. So three things are added to the brief's rule:
 *   - at most one ratio a second (a receiver that speaks ten times a second has its 60 in 6 s of one
 *     stretch of road);
 *   - each ratio is kept with how the speed moved over its 2 s (level: by less than 0.5 km/h; rising;
 *     falling), and a factor is accepted only when it does not hang on that: 60 level ratios (the factor
 *     is their median), or at least 15 rising and 15 falling ones whose two medians lie within 0.3 % of
 *     each other (then the age does not matter and the factor is the median of all);
 *   - a speed sent in whole knots only (no decimal point: steps of 1.85 km/h, 2 to 3 % at these speeds)
 *     gives no ratio.
 *
 * METHOD 2, POSITION LEGS. From the raw GPS position if it arrives, else the navigation's. A leg starts at
 * a fix taken above 60 km/h and grows fix by fix while every fix stays within 5 m of the straight line
 * from the first to the latest and the speed stays above 50 km/h. At 1000 m or more, with the speed at both
 * ends within 3 km/h: ratio = straight-line distance / distance summed up from the vehicle speed between
 * the two fixes' arrival times. Factor = median of the last 5 legs, accepted with 3 or more of them within
 * 0.5 % of it and between 0.90 and 1.10. Distances are flat-earth, on the WGS84 ellipsoid's radii at that
 * latitude (a plain sphere would be wrong by up to 0.5 %, the whole tolerance).
 *
 * WHICH ONE COUNTS: a result worked out since the app started before a saved one, GPS speed before legs.
 * A saved result (factor, how many, date) keeps a calibrated car calibrated; reset() clears it.
 *
 * POSITIONS: latitude and longitude are held in memory only while a leg is measured (the leg's first fix
 * and the others as metres from it). Nothing here returns, saves or logs one: export() and status() hold
 * ratios, counts and distances only. The sentence reader does not even take the position out.
 *
 * WHAT IT ASSUMES ABOUT THE CAR (public reports, not measured by Proven)
 *   - nmeaString holds standard sentences ($GPRMC / $GNRMC ..., $..GGA), several per event, each with its
 *     checksum; RMC field 7 is speed over ground in knots; GGA gives fix quality, satellites, HDOP, height.
 *   - raw GPS position: degrees = (raw - 2147483648) / 3600000; raw 2147483647 or >= 4294967293 = none.
 *     Height: raw - 32768 = metres (reported from ONE car), 65535 = none.
 *   - a fix arrives a constant time after it was taken (then that delay cancels over a leg whose two ends
 *     were driven at the same speed, which is what the 3 km/h rule is for).
 *
 * FIGURES THAT ARE GUESSES: one ratio a second, 0.5 km/h for "level", 15 rising and 15 falling ratios within
 * 0.3 % (above); the newest speed sample may be 3 s old; a GGA older than 5 s no longer vouches
 * for the fix; ratios outside 0.80 to 1.25 are thrown away as nonsense; the last 300 ratios are kept; the
 * navigation's position is used once the raw one has been silent for 5 s; a leg is given up at 3000 m, or
 * when no speed sample arrived for 3 s; GGA height counts for 3 s, the raw height for 5 s; a slope of 5 %
 * makes a leg read 0.1 % short (not corrected).
 */
const { SpeedWindow } = require('./steady');

const KNOT_KMH = 1.852;
const MIN_KMH = 60, STEADY_MS = 2000, STEADY_KMH = 2, SPEED_AGE_MS = 3000;
const GGA_AGE_MS = 5000, MIN_SATS = 6;
const RATIO_LO = 0.8, RATIO_HI = 1.25, FACTOR_LO = 0.90, FACTOR_HI = 1.10;
const RMC_NEED = 60, RMC_KEEP = 300, RMC_SPREAD = 0.01;
const RMC_EVERY_MS = 1000, LEVEL_KMH = 0.5, SIDE_NEED = 15, SIDE_APART = 0.003;
const LEG_START_KMH = 60, LEG_FLOOR_KMH = 50, LEG_M = 1000, LEG_MAX_M = 3000, LEG_OFF_M = 5, LEG_END_KMH = 3;
const LEGS_KEEP = 5, LEGS_NEED = 3, LEGS_SPREAD = 0.005;
const GPS_ALIVE_MS = 5000, ODO_GAP_MS = 3000;
const GGA_HEIGHT_MS = 3000, CAN_HEIGHT_MS = 5000;
const MANUAL_MAX = 400;            // the "Manual speed scale" setting reaches this far either way (hundredths of a percent)
// WGS84
const WGS_A = 6378137, WGS_E2 = 0.00669437999014;

const isNum = (x) => typeof x === 'number' && isFinite(x);
function median(list) {
    const a = list.slice().sort((x, y) => x - y), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
const num = (s) => { const x = s === undefined || s === '' ? NaN : Number(s); return isFinite(x) ? x : null; };

/**
 * Read the receiver's sentences out of one nmeaString. Only sentences whose checksum is right count.
 *   rmc: [{ valid: status 'A', kmh: speed over ground (null if absent), coarse: sent without a decimal point }]
 *   gga: [{ quality: 0 = no fix, sats, hdop, alt: metres above sea level (null if absent) }]
 *   ok: sentences with a good checksum; bad: wrong or missing checksum; other: good, but neither RMC nor GGA
 * Latitude, longitude and the course over ground are not taken out.
 */
function parseNmea(text) {
    const out = { rmc: [], gga: [], ok: 0, bad: 0, other: 0 };
    if (typeof text !== 'string') return out;
    const parts = text.split('$');
    for (let i = 1; i < parts.length; i++) {
        const m = /^([^*\r\n]*)\*([0-9A-Fa-f]{2})/.exec(parts[i]);
        if (!m) { out.bad++; continue; }
        let sum = 0;
        for (let k = 0; k < m[1].length; k++) sum ^= m[1].charCodeAt(k);
        if (sum !== parseInt(m[2], 16)) { out.bad++; continue; }
        out.ok++;
        const f = m[1].split(','), type = f[0].length === 5 ? f[0].slice(2) : '';
        if (type === 'RMC') {
            const knots = num(f[7]);
            out.rmc.push({ valid: f[2] === 'A', kmh: knots === null || knots < 0 ? null : knots * KNOT_KMH, coarse: knots !== null && String(f[7]).indexOf('.') < 0 });
        } else if (type === 'GGA') {
            out.gga.push({ quality: num(f[6]), sats: num(f[7]), hdop: num(f[8]), alt: f[10] === 'M' || f[10] === undefined || f[10] === '' ? num(f[9]) : null });
        } else out.other++;
    }
    return out;
}

/** GPSPositionCAN raw -> degrees, or null for "no value". */
const decodeGpsCan = (raw) => (!isNum(raw) || raw >= 4294967293 || raw === 2147483647 || raw < 0 ? null : (raw - 2147483648) / 3600000);
/** statusHeightGPSCAN raw -> metres, or null for "no value". */
const decodeHeightCan = (raw) => (!isNum(raw) || raw >= 65535 || raw < 0 ? null : raw - 32768);
const validPos = (lat, lon) => isNum(lat) && isNum(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);

/** The first own member of v (or of an object one level inside it) whose name matches re. */
function member(v, re) {
    if (!v || typeof v !== 'object') return undefined;
    const keys = Object.keys(v);
    for (const k of keys) if (re.test(k) && typeof v[k] !== 'object') return v[k];
    for (const k of keys) {
        const inner = v[k];
        if (inner && typeof inner === 'object') for (const j of Object.keys(inner)) if (re.test(j) && typeof inner[j] !== 'object') return inner[j];
    }
    return undefined;
}
/** A GPSPositionCAN value (two raw members, found by "Latitude" / "Longitude" in their names) -> { lat, lon } degrees, or null. */
function gpsCanPosition(v) {
    const lat = decodeGpsCan(member(v, /latitude/i)), lon = decodeGpsCan(member(v, /longitude/i));
    return lat !== null && lon !== null && validPos(lat, lon) ? { lat, lon } : null;
}
/** A Positioning.currentLocation value (coordinatesValid, latitude, longitude in degrees) -> { lat, lon }, or null. */
function navPosition(v) {
    const ok = member(v, /^coordinatesValid$/i), lat = member(v, /^latitude$/i), lon = member(v, /^longitude$/i);
    if (ok === false || ok === 0) return null;
    return validPos(lat, lon) ? { lat, lon } : null;
}

class GpsScale {
    /** o.saved: what export() gave last time;  o.onResult(result): the result that counts has changed. */
    constructor(o) {
        this.o = o || {};
        this.w = new SpeedWindow(6000);
        this.odo = 0; this.odoT = null; this.odoV = 0;
        this.reset();
        if (this.o.saved) this.load(this.o.saved);
    }

    /** "Reset calibration": forget everything learned, the saved result too. */
    reset() {
        this.rmc = { ratios: [], total: 0, result: null, median: null, spread: null, lastT: -Infinity, level: 0, up: 0, down: 0 };
        this.legs = { ratios: [], total: 0, result: null, leg: null, lastGps: -Infinity, src: null, fixes: 0 };
        this.saved = { rmc: null, legs: null };
        this.gga = null; this.canH = null;
        this.sentences = { ok: 0, bad: 0, other: 0, rmcValid: 0, rmcVoid: 0, rmcCoarse: 0, gga: 0 };
        this.told = null;
    }

    /** A saved result per method, as export() wrote it. Anything that is not a sane factor is ignored. */
    load(saved) {
        ['rmc', 'legs'].forEach((m) => {
            const s = saved && saved[m];
            if (s && isNum(s.factor) && s.factor >= FACTOR_LO && s.factor <= FACTOR_HI) {
                this.saved[m] = { factor: s.factor, method: m, count: isNum(s.count) ? s.count : 0, date: isNum(s.date) ? s.date : null, saved: true };
            }
        });
    }

    /** For the saved file: { rmc, legs }, each null or { factor, count, date }. wallNow dates what was learned since the start. */
    export(wallNow) {
        const out = {};
        ['rmc', 'legs'].forEach((m) => {
            const r = this[m].result || this.saved[m];
            if (r && !r.saved && !isNum(r.date)) r.date = isNum(wallNow) ? wallNow : null;
            out[m] = r ? { factor: Math.round(r.factor * 100000) / 100000, count: r.count, date: isNum(r.date) ? r.date : null } : null;
        });
        return out;
    }

    /** The factor that counts: learned since the start before saved, GPS speed before legs. null: none. */
    result() {
        return this.rmc.result || this.legs.result || this.saved.rmc || this.saved.legs || null;
    }

    _tell() {
        const r = this.result(), key = r ? r.method + (r.saved ? 's' : '') + r.factor.toFixed(4) : '';
        if (key === this.told) return;
        this.told = key;
        if (r && this.o.onResult) this.o.onResult(r);
    }

    /* ---------- the vehicle speed ---------- */

    speed(t, kmh) {
        if (!isNum(t) || !isNum(kmh)) return;
        this.w.add(t, kmh);
        const L = this.legs;
        if (this.odoT !== null && t > this.odoT) {
            // a hole in the speed: the distance over it is not known well enough for a leg
            if (t - this.odoT > ODO_GAP_MS) L.leg = null;
            this.odo += (this.odoV + kmh) / 2 / 3.6 * (t - this.odoT) / 1000;
        }
        if (this.odoT === null || t > this.odoT) { this.odoT = t; this.odoV = kmh; }
        if (L.leg && kmh < LEG_FLOOR_KMH) L.leg = null;
    }

    /** Metres driven (by the vehicle speed) up to time t. */
    _odoAt(t) { return this.odoT === null ? 0 : this.odo + this.odoV / 3.6 * (t - this.odoT) / 1000; }

    /* ---------- method 1: GPS speed ---------- */

    nmea(t, text) {
        const p = parseNmea(text), c = this.sentences;
        c.ok += p.ok; c.bad += p.bad; c.other += p.other; c.gga += p.gga.length;
        for (const g of p.gga) this.gga = { t, quality: g.quality, sats: g.sats, hdop: g.hdop, alt: g.alt };
        for (const r of p.rmc) {
            if (!r.valid || r.kmh === null) { c.rmcVoid++; continue; }
            c.rmcValid++;
            if (r.coarse) { c.rmcCoarse++; continue; }          // whole knots: too coarse for a ratio
            this._ratio(t, r.kmh);
        }
        return p;
    }

    _fixGood(t) {
        const g = this.gga;
        if (!g) return true;                                    // this receiver sends no GGA: RMC status A has to do
        // (quality 1 to 8 and at most 99 satellites: anything else is not what a receiver says)
        return t - g.t <= GGA_AGE_MS && g.quality >= 1 && g.quality <= 8 && g.sats >= MIN_SATS && g.sats <= 99;
    }

    _ratio(t, gpsKmh) {
        if (!this.w.steady(t, STEADY_MS, STEADY_KMH, SPEED_AGE_MS) || !this._fixGood(t)) return;
        const r = this.w.range(t, STEADY_MS), v = (r.min + r.max) / 2;
        if (!(r.min > MIN_KMH)) return;
        const ratio = gpsKmh / v, R = this.rmc;
        if (!(ratio > RATIO_LO && ratio < RATIO_HI)) return;
        if (t - R.lastT < RMC_EVERY_MS) return;                  // one a second
        R.lastT = t;
        // how the speed moved over those 2 s: the GPS speed is some unknown time old, so a ratio taken while the car
        // gains or loses speed is off by that much
        const v1 = this.w.valueAt(t), v0 = this.w.valueAt(t - STEADY_MS), d = isNum(v1) && isNum(v0) ? v1 - v0 : 0;
        R.ratios.push({ r: ratio, d }); R.total++;
        if (R.ratios.length > RMC_KEEP) R.ratios.shift();
        const of = (list) => list.map((x) => x.r);
        const level = of(R.ratios.filter((x) => Math.abs(x.d) < LEVEL_KMH)), up = of(R.ratios.filter((x) => x.d >= LEVEL_KMH)), down = of(R.ratios.filter((x) => x.d <= -LEVEL_KMH));
        R.level = level.length; R.up = up.length; R.down = down.length;
        if (R.ratios.length < RMC_NEED) return;
        const a = of(R.ratios).sort((x, y) => x - y), n = a.length, med = median(a);
        const lo = a[Math.floor(0.1 * (n - 1))], hi = a[Math.ceil(0.9 * (n - 1))];
        R.median = med; R.spread = Math.max(med - lo, hi - med) / med;
        if (!(R.spread <= RMC_SPREAD)) return;
        // ... and the factor must not hang on whether the car was gaining or losing speed
        let factor = null, count = n;
        if (level.length >= RMC_NEED) { factor = median(level); count = level.length; } else if (up.length >= SIDE_NEED && down.length >= SIDE_NEED && Math.abs(median(up) - median(down)) / med <= SIDE_APART) factor = med;
        if (factor !== null && factor >= FACTOR_LO && factor <= FACTOR_HI) {
            R.result = { factor, method: 'rmc', count, saved: false, date: null };
            this._tell();
        }
    }

    /* ---------- method 2: position legs ---------- */

    _legStart(t, lat, lon, src, v) {
        const phi = lat * Math.PI / 180, s = Math.sin(phi), w = Math.sqrt(1 - WGS_E2 * s * s);
        // metres per degree of latitude and of longitude at this latitude (WGS84)
        const ky = WGS_A * (1 - WGS_E2) / (w * w * w) * Math.PI / 180, kx = WGS_A / w * Math.cos(phi) * Math.PI / 180;
        return { src, lat0: lat, lon0: lon, kx, ky, odo0: this._odoAt(t), v0: v, pts: [], len: 0 };
    }

    position(t, lat, lon, src) {
        if (!isNum(t) || !validPos(lat, lon)) return;
        const L = this.legs;
        if (src === 'gps') L.lastGps = t;
        else if (t - L.lastGps < GPS_ALIVE_MS) return;           // the raw position is arriving: the navigation's is not used
        L.src = src; L.fixes++;
        const l = this.w.last(), v = l && t - l.t <= SPEED_AGE_MS ? l.v : null;
        const fresh = () => (v !== null && v > LEG_START_KMH ? this._legStart(t, lat, lon, src, v) : null);
        const leg = L.leg;
        if (!leg || leg.src !== src || v === null) { L.leg = fresh(); return; }
        const x = (lon - leg.lon0) * leg.kx, y = (lat - leg.lat0) * leg.ky, len = Math.sqrt(x * x + y * y);
        if (len <= leg.len) { if (len < leg.len - LEG_OFF_M) L.leg = fresh(); return; }      // no further (the same fix again), or turned back
        for (const q of leg.pts) if (Math.abs(q.x * y - q.y * x) / len > LEG_OFF_M) { L.leg = fresh(); return; }
        leg.pts.push({ x, y });
        if (leg.pts.length > 400) leg.pts = leg.pts.filter((_, i) => i % 2 === 1);
        leg.len = len;
        if (len < LEG_M) return;
        if (Math.abs(v - leg.v0) <= LEG_END_KMH) {
            const driven = this._odoAt(t) - leg.odo0, ratio = driven > 0 ? len / driven : 0;
            if (ratio > RATIO_LO && ratio < RATIO_HI) {
                L.ratios.push(ratio); L.total++;
                if (L.ratios.length > LEGS_KEEP) L.ratios.shift();
                const med = median(L.ratios), within = L.ratios.filter((r) => Math.abs(r / med - 1) <= LEGS_SPREAD).length;
                if (within >= LEGS_NEED && med >= FACTOR_LO && med <= FACTOR_HI) {
                    L.result = { factor: med, method: 'legs', count: within, saved: false, date: null };
                    this._tell();
                }
            }
            L.leg = fresh();
        } else if (len >= LEG_MAX_M) L.leg = fresh();
    }

    /* ---------- height ---------- */

    heightCan(t, m) { if (isNum(t) && isNum(m)) this.canH = { t, m }; }

    /** Height above sea level now: the receiver's own (GGA) if it is fresh, else the raw GPS height. */
    height(now) {
        const g = this.gga;
        if (g && isNum(g.alt) && g.alt > -1000 && g.alt < 10000 && g.quality >= 1 && g.quality <= 8 && now - g.t <= GGA_HEIGHT_MS) return { m: g.alt, src: 'gga' };
        if (this.canH && now - this.canH.t <= CAN_HEIGHT_MS) return { m: this.canH.m, src: 'can' };
        return null;
    }

    /* ---------- for the Signals page ---------- */

    status(now) {
        const R = this.rmc, L = this.legs, g = this.gga, res = this.result();
        return {
            result: res ? { factor: res.factor, method: res.method, count: res.count, saved: !!res.saved, date: res.date } : null,
            rmc: { ratios: R.ratios.length, total: R.total, need: RMC_NEED, median: R.median, spread: R.spread, accepted: !!R.result, level: R.level, up: R.up, down: R.down },
            legs: {
                ratios: L.ratios.slice(), total: L.total, need: LEGS_NEED, accepted: !!L.result, source: L.src, fixes: L.fixes,
                legMetres: L.leg ? Math.round(L.leg.len) : null,
            },
            sentences: Object.assign({}, this.sentences),
            // (for the screen: only figures a receiver can say)
            fix: g ? {
                quality: isNum(g.quality) && g.quality >= 0 && g.quality <= 8 ? g.quality : null, sats: isNum(g.sats) && g.sats >= 0 && g.sats <= 99 ? g.sats : null,
                hdop: isNum(g.hdop) && g.hdop > 0 && g.hdop < 100 ? g.hdop : null, age: isNum(now) ? now - g.t : null,
            } : null,
            height: isNum(now) ? this.height(now) : null,
        };
    }
}

/**
 * The scale a run uses. setting: 'gps' | 'off' | 'manual'; manual: the "Manual speed scale" setting, hundredths
 * of a percent, -400 to +400 (the settings list offers steps of 25: 0.25 %; + means the car reads low, the speed
 * is multiplied by 1 + manual / 10000); result: GpsScale.result().
 * -> { factor, source: 'gps-rmc' | 'gps-legs' | 'manual' | 'off' | 'none', label }
 */
function scaleFor(setting, manual, result) {
    if (setting === 'manual') {
        const h = Math.max(-MANUAL_MAX, Math.min(MANUAL_MAX, Math.round(Number(manual) || 0)));
        return { factor: 1 + h / 10000, source: 'manual', label: 'MANUAL ' + (h < 0 ? '-' : '+') + (Math.abs(h) / 100).toFixed(2) + ' %' };
    }
    if (setting !== 'off' && result && isNum(result.factor)) {
        return { factor: result.factor, source: 'gps-' + result.method, label: 'GPS x' + result.factor.toFixed(3) };
    }
    return { factor: 1, source: setting === 'off' ? 'off' : 'none', label: 'UNCALIBRATED' };
}

/** Height change between two height() readings over dist metres: { m, pct }, or null without both. */
function heightChange(a, b, dist) {
    if (!a || !b || !isNum(a.m) || !isNum(b.m) || !(dist > 0)) return null;
    return { m: b.m - a.m, pct: (b.m - a.m) / dist * 100 };
}

module.exports = {
    GpsScale, parseNmea, scaleFor, heightChange, decodeGpsCan, decodeHeightCan, gpsCanPosition, navPosition,
    KNOT_KMH, RMC_NEED, LEGS_NEED,
};
