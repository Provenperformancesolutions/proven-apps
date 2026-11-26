'use strict';
/**
 * test_drift_box.js [dist/pps_drift | apps/pps_drift] - Proven Drift's record of starts and stops (box.js) on its
 * own: what it writes and where, what it makes of what it finds at a start, and above all what it does with a
 * file it did not write. Its record in RAM lives in /tmp on the head unit, where any process can put a file,
 * a link or a pipe: none of that may make the app throw, wait, write somewhere else, or put odd text on a
 * screen. Here "/tmp" is a folder of the test's own; the real /tmp is not touched.
 *
 * What this cannot show: the head unit itself. Whether an app's user may write to /tmp there is known from the
 * kit's own comment only (kit/runtime/mgu.js keeps its drawn frames there); how long a write takes on its flash
 * is not known. The uncaught-error and exit hooks are run for real in test_drift_real.js.
 *
 * PPS_TEST_ALL=1 in the environment: a failed check does not stop the run; they are listed at the end.
 */
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const { checker } = require('./fakecar');

const ARG = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'apps', 'pps_drift'));
const JS = fs.existsSync(path.join(ARG, 'source', 'javascript', 'box.js')) ? path.join(ARG, 'source', 'javascript') : ARG;
if (!fs.existsSync(path.join(JS, 'box.js'))) { console.error('usage: node proven/tools/test_drift_box.js [dist/pps_drift | apps/pps_drift]'); process.exit(2); }
const BoxMod = require(path.join(JS, 'box'));
const { Box, Vitals, clean, readSmall, writeSmall, ownDir, MAX_BYTES, ERR_MAX, KEEP, DISK_FILE, RAM_FILE, RAM_RETRY_MS, SIGS } = BoxMod;
// (the highest life number the record holds, written out here and not taken from the app: the limit itself is checked)
const MAX_N = 999999999;
const ok = checker();

const UID = process.getuid(), GROUPS = { askCar: 'own reads', gpsOn: 'GPS', wheelsOn: 'wheels', sourcesOn: 'other sources', pedalOn: 'pedal', studyOn: 'study', sigOn: 'signals' };
const made = [];
const rmrf = (d) => { try { const st = fs.lstatSync(d); if (st.isDirectory()) { fs.chmodSync(d, 0o700); fs.readdirSync(d).forEach((f) => rmrf(path.join(d, f))); fs.rmdirSync(d); } else fs.unlinkSync(d); } catch (e) { /* gone */ } };
process.on('exit', () => made.forEach(rmrf));
const dir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pps-drift-box-')); made.push(d); return d; };
// a clock and an uptime the test moves by hand
const T = { mono: 1000000, wall: Date.UTC(2026, 10, 25, 9, 0, 0), up: 5000 };
const pass = (ms) => { T.mono += ms; T.wall += ms; T.up += ms / 1000; };
const logs = [];
const log = { info: (s) => logs.push(s), warn: (s) => logs.push('WARN ' + s) };
/** One start of the app's record: tmp stands in for /tmp, data for the app's data folder. */
const NAMES = ['Vehicle2', 'CDS2', 'SteeringAngle', 'SpeedAcceleration', 'XView', 'AcceleratorPedal', 'Powertrain', 'CDS', 'FES', 'DrivingVector', 'MDrive', 'SatellitePositioning'];
const start = (tmp, data, o) => new Box(Object.assign({ id: 'pps_drift', ver: '1.0.1', dataDir: data, tmp, mono: () => T.mono, wall: () => T.wall, uptime: () => T.up, groups: GROUPS, names: NAMES, log }, o));
const ramDir = (tmp, uid) => path.join(tmp, 'pps-box-pps_drift-' + (uid === undefined ? UID : uid));
const ramFile = (tmp, uid) => path.join(ramDir(tmp, uid), RAM_FILE);
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const NOTE = { mem: 58, memMax: 60, cpu: 31, cpuMax: 44, lag: 40, lagMax: 85, fps: 58, path: 'gpu', nps: 310, asked: 0, answered: 0, show: 'drift', state: 'ready', ok: 3, want: 3, failed: 0 };
const text = (b) => b.lines().map((l) => l.parts.join(', '));
const life = (n, more) => Object.assign({ n, wall: T.wall - 60000, up: T.up - 60, s: 24, end: null, code: null, err: '', on: [], note: NOTE, uid: UID, disk: true, ram: true }, more);
const plant = (tmp, lives, uid) => { const d = ramDir(tmp, uid); try { fs.mkdirSync(d, 0o755); } catch (e) { /* there */ } fs.writeFileSync(path.join(d, RAM_FILE), typeof lives === 'string' ? lives : JSON.stringify({ v: 1, rev: 5, lives })); };
const printable = (s) => /^[\x20-\x7e]*$/.test(s);

(async () => {
    /* ================= a life from its start to each kind of end ================= */
    await ok.part('what is written, where, and with which rights', async () => {
        const tmp = dir(), data = dir();
        const b = start(tmp, data);
        const sd = fs.lstatSync(ramDir(tmp)), sf = fs.lstatSync(ramFile(tmp)), r = read(ramFile(tmp)), c = read(path.join(data, DISK_FILE));
        ok(b.me.n === 1 && b.lives.length === 0 && b.before === null && b.byItself === false && b.ram === true && b.disk === true, 'a first start: life 1, nothing before it, the record in RAM and its copy in the data folder both written');
        ok(sd.isDirectory() && (sd.mode & 0o777) === 0o755 && sd.uid === UID && sf.isFile() && (sf.mode & 0o777) === 0o644 && fs.readdirSync(ramDir(tmp)).join() === RAM_FILE,
            'in RAM: a folder of its own, mode 0755, with one file, mode 0644, and no temporary file left beside it');
        ok(r && c && r.v === 1 && r.app === 'pps_drift' && r.ver === '1.0.1' && r.lives.length === 1 && r.lives[0].n === 1 && r.lives[0].end === null && r.lives[0].up === 5000 && r.lives[0].wall === T.wall && /^\d\d\.\d\d\. \d\d:\d\d:\d\d$/.test(r.lives[0].at) &&
            r.lives[0].disk === true && r.lives[0].ram === true && c.lives[0].disk === true && c.lives[0].ram === true && r.lives[0].uid === UID,
            'each says: life 1, when it started (wall clock as a number and as text, and the head unit\'s uptime), no end yet, and which copies of it exist');
        // the last note every 2 s; the copy in the data folder a minute apart at most, and only while quiet
        let diskWrites = 0, lastRev = c.rev;
        for (let i = 0; i < 100; i++) { pass(2000); b.note(Object.assign({}, NOTE, { mem: 58 + i }), i < 50); const x = read(path.join(data, DISK_FILE)); if (x.rev !== lastRev) { diskWrites++; lastRev = x.rev; } }
        const r2 = read(ramFile(tmp));
        ok(r2.lives[0].s === 200 && r2.lives[0].note.mem === 157 && r2.lives[0].note.show === 'drift' && r2.rev > r.rev + 90, '100 notes, one every 2 s: the record in RAM has the last one (200 s alive, the note\'s figures), written every time');
        // (CHANGED for 1.0.1's second part: "written once, a minute after the start". One more write when the life is 10 s old,
        // so that a life that ends young and whose record in RAM is lost with the power has a real note in the data folder)
        ok(diskWrites === 2 && read(path.join(data, DISK_FILE)).lives[0].s === 70, 'the copy in the data folder was written twice in those 200 s: when the life was 10 s old and a minute after that, and not at all in the second half, while a drift was said to run (' + diskWrites + ' write; it says ' + read(path.join(data, DISK_FILE)).lives[0].s + ' s alive)');
        // how far set-up had got: which interfaces were still under way, which had failed (names the app knows, nothing else)
        b.note(Object.assign({}, NOTE, { ok: 1, want: 4, failed: 1, wait: ['CDS2', 'Powertrain', 'made up', 7, 'CDS2'], bad: ['SteeringAngle', '<b>'] }), false);
        const su = read(ramFile(tmp)).lives[0].note;
        ok(su.wait.join() === 'CDS2,Powertrain' && su.bad.join() === 'SteeringAngle' && /set-up 1 of 4 \(under way: CDS2 Powertrain\) \(1 failed: SteeringAngle\)/.test(text(b)[0]),
            'a note taken while set-up is under way says how far it had got: "set-up 1 of 4 (under way: CDS2 Powertrain) (1 failed: SteeringAngle)". Only names of interfaces the app knows are kept');
        b.on(['gpsOn', 'nonsense', 'wheelsOn']);
        b.on(['gpsOn']);
        ok(read(ramFile(tmp)).lives[0].on.join() === 'gpsOn,wheelsOn', 'what is switched on is kept with the life: only keys the app knows, and one that was on stays listed after it is switched off (its subscription stays to the end of the life)');
        b.on(['sigOn']);
        const withSig = read(ramFile(tmp)).lives[0].on.join();
        b.off(['sigOn', 'nonsense']);
        ok(withSig === 'gpsOn,wheelsOn,sigOn' && read(ramFile(tmp)).lives[0].on.join() === 'gpsOn,wheelsOn', '(the repair of 1.0.1) a setting that leaves nothing behind when it is switched off (the signal listeners) is taken off the list again: off(keys)');
    });

    await ok.part('the four kinds of end, as the next start reads them', async () => {
        const ends = [
            ['asked', (b) => { b.end('asked'); b.end('exit', 0); }, /^#1 .* lived 24 s, asked to stop by the car, Last note: memory 58 MB \(most 60\), processor 31 % \(most 44\), hold-up 40 ms \(most 85\), Drift tab, ready, set-up done, 58 frames\/s GPU, 310 values\/s, own reads 0 of 0, on: GPS$/, false],
            ['error', (b) => { b.end('error', 'TypeError: Cannot read property \'x\' of undefined'); b.end('exit', 1); }, /^#1 .* lived 24 s, THE APP'S OWN ERROR \(exit code 1\): TypeError: Cannot read property 'x' of undefined, Last note: memory 58 MB/, true],
            // (CHANGED for 1.0.1's second part: an exit code other than 0 with no word before it is a stop by itself too: it read "exit code 3", unmarked)
            ['exit', (b) => { b.end('exit', 3); }, /^#1 .* lived 24 s, EXIT CODE 3 AND NO WORD BEFORE IT, Last note: /, true],
            ['exit 0', (b) => { b.end('exit', 0); }, /^#1 .* lived 24 s, exit code 0, Last note: /, false],
            // (a signal that ends the process: noted, so that it does not read like kill -9. A later exit code does not undo it)
            // (CHANGED in the repair of 1.0.1: an exit code that follows a signal is shown on the line, as the second check asked)
            ['signal', (b) => { b.end('signal', 'SIGTERM'); b.end('error', 'too late'); b.end('exit', 0); }, /^#1 .* lived 24 s, ENDED BY THE SIGNAL SIGTERM \(sent from outside the app\), exit code 0, Last note: memory 58 MB/, true],
            ['signal alone', (b) => { b.signal('SIGHUP', true); }, /^#1 .* lived 24 s, ENDED BY THE SIGNAL SIGHUP \(sent from outside the app\), Last note: memory 58 MB/, true],
            ['signal made up', (b) => { b.end('signal', 'SIGSOMETHING <b>'); }, /^#1 .* lived 24 s, ENDED BY THE SIGNAL not known \(sent from outside the app\), Last note: /, true],
            ['none', () => {}, /^#1 .* lived 24 s, NO WORD \(killed, crashed or power lost\), Last note: memory 58 MB/, true],
        ];
        for (const e of ends) {
            const tmp = dir(), data = dir();
            const b = start(tmp, data);
            b.on(['gpsOn']);
            pass(24000);
            b.note(NOTE, true);
            e[1](b);
            // (once the app was asked to stop, or has failed, a later note or end does not undo it)
            if (e[0] === 'asked' || e[0] === 'error' || e[0] === 'signal' || e[0] === 'signal alone') b.note(Object.assign({}, NOTE, { mem: 1 }), true);
            if (e[0] === 'asked') b.end('error', 'too late');
            pass(12000);
            const n = start(tmp, data), lines = text(n);
            ok(n.me.n === 2 && n.lives.length === 1 && e[2].test(lines[1]) && /^#2 now: 0 s \(started 12 s after #1('s last note| ended)\)/.test(lines[0]) && n.byItself === e[3] && n.lines()[1].warn === e[3],
                (e[0] === 'none' ? 'no end written (the process was killed, crashed in native code, or the power went)' : 'end "' + e[0] + '"') + ': the next start says "' + lines[1].slice(0, 110) + ' ...", ' + (e[3] ? 'and that the app stopped by itself' : 'and does not say that the app stopped by itself'));
        }
    });

    await ok.part('five lives are kept; the newer of the two copies is taken; an emptied data folder; a restart of the head unit', async () => {
        const tmp = dir(), data = dir();
        let b = null;
        for (let i = 0; i < 8; i++) { b = start(tmp, data); pass(10000); b.note(NOTE, true); b.end(i % 2 ? 'asked' : 'exit', 0); pass(5000); }
        ok(b.me.n === 8 && b.lives.length === KEEP - 1 && b.lives.map((l) => l.n).join() === '7,6,5,4' && read(ramFile(tmp)).lives.length === KEEP && b.lines().length === KEEP, 'eight starts: the last five lives are kept (8, 7, 6, 5, 4), newest first, in the file and on the screen');
        // RAM is newer than the data folder (it is written every 2 s): its record is the one taken
        b = start(tmp, data);
        pass(30000); b.note(Object.assign({}, NOTE, { mem: 77 }), false);
        let n = start(tmp, data);
        ok(n.readFrom === 'ram' && n.before.n === 9 && n.before.s === 30 && n.before.note.mem === 77, 'a life whose last note is in RAM only (the data folder\'s copy is from its start): the next start takes the record in RAM, with that note');
        // the data folder emptied (the platform after an unexpected exit): RAM says the copy was there, and it is gone
        pass(4000);
        fs.readdirSync(data).forEach((f) => fs.unlinkSync(path.join(data, f)));
        n = start(tmp, data);
        ok(n.before.n === 10 && n.before.emptied === true && text(n).some((l) => l === 'The saved data was emptied after #10') && read(path.join(data, DISK_FILE)).lives[1].emptied === true && n.byItself === true,
            'the data folder is emptied between two starts: "The saved data was emptied after #10", and that note is kept with the life (the data folder has its copy again)');
        n = start(tmp, data);
        ok(n.before.n === 11 && !n.before.emptied && n.lives[1].emptied === true && text(n).filter((l) => /emptied/.test(l)).length === 1, 'the start after that does not say it of #11, and still says it of #10');
        // a data folder that was never written to is not "emptied"
        const tmp2 = dir();
        let c = start(tmp2, null);
        pass(5000); c.note(NOTE, true);
        c = start(tmp2, dir());
        ok(c.before.n === 1 && c.before.disk === false && c.before.emptied === false && !text(c).some((l) => /emptied/.test(l)), 'a life that never had a copy in the data folder (none could be written) is not called "emptied" when the next start finds none');
        // the head unit restarted: RAM is empty, its uptime starts again; the copy in the data folder is all there is
        pass(90000); n.note(NOTE, true);
        pass(30000); n.note(Object.assign({}, NOTE, { mem: 99 }), false);
        const empty = dir();
        T.up = 20;
        const r = start(empty, data);
        ok(r.readFrom === 'disk' && r.before.n === 12 && r.restarted === true && r.byItself === false && r.before.atLeast === true && /^#13 now: 0 s \(the head unit was restarted since #12\)/.test(text(r)[0]) && /^#12 .* lived at least 1 min 35 s \(saved note, up to a minute old\), NO WORD .*, Saved note: memory /.test(text(r)[1]),
            'the head unit restarts (RAM empty, uptime 20 s): the record comes from the data folder, a minute behind at most ("#12 ... lived at least 1 min 35 s (saved note, up to a minute old), NO WORD ..., Saved note: ...": it lived 2 min 5 s), the first line says that the head unit was restarted, and the app does NOT say that it stopped by itself');
        T.up = 5000;
    });

    /* ================= what two checks of Proven Drag's record found, tried on this one (1.0.1, second part) ================= */
    await ok.part('faults found in Proven Drag\'s record, tried here: an end keeps the last note\'s rates; a short life after a power loss; asked first; the file\'s rights; a record in a folder that is not the app\'s own', async () => {
        // an end with a word works out no rates: the last note's frames and values a second stand
        let tmp = dir(), data = dir();
        let b = start(tmp, data);
        pass(8000); b.note(NOTE, true);
        pass(5); b.end('error', 'Error: x'); b.end('exit', 1);
        let r = read(ramFile(tmp)).lives[0];
        ok(r.end === 'error' && r.code === 1 && r.note.fps === 58 && r.note.nps === 310 && r.note.mem === 58, 'the app\'s own error 5 ms after a note, then the exit: the record keeps that note\'s 58 frames and 310 values a second (in Proven Drag an end worked them out anew over those 5 ms, and they read 0)');
        // a life that was 45 s old when the power went: the data folder's copy has a real note of it
        tmp = dir(); data = dir();
        b = start(tmp, data);
        for (let i = 1; i <= 22; i++) { pass(2000); b.note(Object.assign({}, NOTE, { mem: 60 + i }), true); }
        pass(1000);
        const saved = read(path.join(data, DISK_FILE)).lives[0];
        T.up = 30;
        const tmp2 = dir();
        let n = start(tmp2, data);
        ok(saved.s === 10 && saved.note && saved.note.mem === 65 && n.restarted === true && n.byItself === false && /^#1 .* lived at least 10 s \(saved note, up to a minute old\), NO WORD \(killed, crashed or power lost\), Saved note: memory 65 MB.*set-up done/.test(text(n)[1]),
            'a life 45 s old, then the power is lost (RAM empty, the head unit\'s uptime starts again): the next start says "' + text(n)[1].slice(0, 118) + ' ...". Not "lived 0 s": the data folder\'s copy was written once more when the life was 10 s old, and the line says how old that note may be');
        // ONE START LATER (found by the last read of 1.0.1): that life is an older one now and must still say what is known of it
        for (let i = 0; i < 15; i++) { pass(2000); n.note(NOTE, true); }
        n.end('asked'); n.end('exit', 0);
        pass(60000);
        const n3 = start(tmp2, data), t3 = text(n3);
        ok(n3.restarted === false && n3.byItself === false && /^#3 now: /.test(t3[0]) && /^#2 .* lived 30 s, asked to stop by the car, Last note: /.test(t3[1]) &&
            /^#1 .* lived at least 10 s \(saved note, up to a minute old\), NO WORD \(killed, crashed or power lost\) \(the head unit restarted after it\), Saved note: memory 65 MB/.test(t3[2]) &&
            !/restarted after it/.test(t3[1]) && !/restarted after it/.test(text(n)[1]),
            'one start later (life 2 lived 30 s and was stopped cleanly): the older life still reads "' + String(t3[2]).slice(0, 150) + ' ...". WAS: "lived 10 s, NO WORD ..., Last note: ...", as if its length and its last note were known and the head unit had run on. The line of the life just before never carries the added words: there the first line says it');
        T.up = 5000;
        // asked to stop, and killed while the saved file was being written: the word is in RAM already
        tmp = dir(); data = dir();
        b = start(tmp, data);
        pass(20000); b.note(NOTE, true);
        b.end('asked', null, true);             // (main.js: this first, then the saved file, then box.flush())
        n = start(tmp, data);
        ok(n.before.end === 'asked' && n.byItself === false && /asked to stop by the car/.test(text(n)[1]) && read(path.join(data, DISK_FILE)).lives[1].end === 'asked',
            'the SDK\'s shutdown event, and the process is killed before the saved file and the data folder\'s copy are written: the next start still says "asked to stop by the car" (the word goes into the record in RAM first)');
        // the rights of the record in RAM under a tighter umask
        const old = process.umask(0o077);
        let modes = null;
        try { tmp = dir(); b = start(tmp, dir()); pass(2000); b.note(NOTE, true); modes = [fs.lstatSync(ramDir(tmp)).mode & 0o777, fs.lstatSync(ramFile(tmp)).mode & 0o777]; } finally { process.umask(old); }
        ok(modes[0] === 0o755 && modes[1] === 0o644, 'under umask 077 the folder in RAM is still 0755 and its file 0644 (' + modes.map((m) => '0' + m.toString(8)).join(', ') + '): another user id can read it after the app was installed again');
        // a record under the app's own name in a folder that is a link: never read, never written
        tmp = dir();
        const elsewhere = dir();
        fs.writeFileSync(path.join(elsewhere, RAM_FILE), JSON.stringify({ v: 1, rev: 9, lives: [life(31, { end: 'error', err: 'PLANTED IN A LINKED FOLDER', code: 1 })] }));
        const planted = fs.readFileSync(path.join(elsewhere, RAM_FILE), 'utf8');
        fs.symlinkSync(elsewhere, ramDir(tmp));
        b = start(tmp, dir());
        pass(2000); b.note(NOTE, true);
        ok(b.me.n === 1 && b.lives.length === 0 && b.byItself === false && b.ram === false && !text(b).some((l) => /PLANTED|#31/.test(l)) && fs.readFileSync(path.join(elsewhere, RAM_FILE), 'utf8') === planted && fs.readdirSync(elsewhere).length === 1,
            'the folder under the app\'s own name is a symbolic link to a folder with a made-up record in it: the record is not read (life 1, nothing before it, no "stopped by itself"), and nothing is written through the link');
        // the same in a real folder that belongs to somebody else (here: this process is taken for another user id)
        tmp = dir();
        const getuid = process.getuid;
        plant(tmp, [life(70, { end: 'error', err: 'planted in a folder of another user', code: 1 })], UID + 1);
        const plantedText = fs.readFileSync(ramFile(tmp, UID + 1), 'utf8');
        let f = null;
        process.getuid = () => UID + 1;
        try { f = start(tmp, dir()); pass(2000); f.note(NOTE, true); } finally { process.getuid = getuid; }
        ok(f.readFrom === 'other' && f.byItself === false && f.ram === false && f.lives[0].other === true && /^#70 .* THE APP'S OWN ERROR \(exit code 1\): planted in a folder of another user \(as another user: installed again since\)/.test(text(f)[1]) && fs.readFileSync(ramFile(tmp, UID + 1), 'utf8') === plantedText,
            'the folder under the app\'s own name belongs to another user: its record is read as another user\'s and said to be one, never as the app\'s own (the Drift tab does not say that the app stopped by itself), and it is not written to');
        // the error's first line with where it came from
        const where = BoxMod.errorText(new Error('something went wrong'));
        ok(/^Error: something went wrong \(test_drift_box\.js:\d+\)$/.test(where) && BoxMod.errorText('just a text') === 'just a text' && BoxMod.errorText(Object.assign(new Error('W'.repeat(400)), { stack: 'Error: ' + 'W'.repeat(400) + '\n    at f (/a/b/session.js:201:7)' })).length === ERR_MAX,
            'an error\'s first line is kept with the file and line its stack names first ("' + where + '"), in 160 characters at most');
    });

    /* ================= what the two checks of 1.0.1 found in this record (the repair) ================= */
    await ok.part('the repair of 1.0.1: a planted record with the highest life number; the record in RAM gone while the head unit ran on; a pipe under the temporary name; a signal the SDK turns into a clean stop', async () => {
        const killed = (b, ms) => { pass(ms); b.note(NOTE, true); };       // (a life that gets no further than a note: killed)
        let n = null;
        ok(BoxMod.MAX_N === MAX_N && clean(JSON.stringify({ v: 1, lives: [{ n: MAX_N }] }), [], []).lives[0].n === MAX_N && clean(JSON.stringify({ v: 1, lives: [{ n: MAX_N + 1 }] }), [], []) === null, 'the highest life number a record may hold is ' + MAX_N + ': one more is not read');
        // ---- 1. the app has a record of its own, and somebody plants one under another user id with the highest number there is ----
        let tmp = dir(), data = dir();
        let b = start(tmp, data);
        killed(b, 30000); pass(5000);
        plant(tmp, [life(MAX_N, { end: 'error', err: 'PLANTED', code: 1 })], UID + 502);
        const plantedText = fs.readFileSync(ramFile(tmp, UID + 502), 'utf8');
        const seen = [];
        for (let i = 0; i < 3; i++) { b = start(tmp, data); seen.push({ n: b.me.n, before: b.before && b.before.n, by: b.byItself, from: b.readFrom, planted: text(b).some((l) => /PLANTED|another user/.test(l)) }); killed(b, 25000); pass(6000); }
        ok(seen.map((x) => x.n).join() === '2,3,4' && seen.map((x) => x.before).join() === '1,2,3' && seen.every((x) => x.by === true && x.from === 'ram' && !x.planted) && fs.readFileSync(ramFile(tmp, UID + 502), 'utf8') === plantedText,
            'the app has a record of its own, and a folder of another user id holds a record with life number ' + MAX_N + ': it is not taken. Three more starts, each life before killed, are #2, #3 and #4, each shows the life before it as NO WORD, and each time the Drift tab is told that the app stopped by itself (as released, every start was #' + (MAX_N + 1) + ', none was ever shown again, and the Drift tab said nothing)');
        // (and after a restart of the head unit, with RAM empty and the planted folder gone: the count goes on from the data folder)
        T.up = 40;
        b = start(dir(), data);
        ok(b.me.n === 5 && b.before.n === 4 && b.restarted === true, '  after a restart of the head unit the count goes on from the data folder\'s copy: #5 follows #4');
        T.up = 5000;
        // ---- 2. no record of its own (installed again, data emptied), and the only one found has the highest number ----
        tmp = dir(); data = dir();
        plant(tmp, [life(MAX_N, { end: 'error', err: 'PLANTED', code: 1 }), life(MAX_N - 1, { end: 'asked' })], UID + 502);
        b = start(tmp, data);
        const first = { n: b.me.n, lives: b.lives.map((l) => l.n + (l.other ? ' other' : '')).join(), by: b.byItself, file: read(ramFile(tmp)).lives.map((l) => l.n).join() };
        killed(b, 20000); pass(4000);
        b = start(tmp, data);
        ok(first.n === 3 && first.lives === '2 other,1 other' && first.by === false && first.file === '3,2,1' && b.me.n === 4 && b.before.n === 3 && !b.before.other && b.byItself === true && /^#3 .* lived 20 s, NO WORD/.test(text(b)[1]),
            'no record of its own, and another user\'s holds life number ' + MAX_N + ': its lives are shown as another user\'s and numbered again from 1 (#2, #1), this life is #3, and the next start reads it back: "' + text(b)[1].slice(0, 60) + ' ..." with the Drift tab told that the app stopped by itself');
        // (the same number in the app's own copy in the data folder)
        data = dir();
        fs.writeFileSync(path.join(data, DISK_FILE), JSON.stringify({ v: 1, rev: 5, lives: [life(MAX_N, { ram: false }), life(7, { end: 'asked', ram: false })] }));
        b = start(dir(), data);
        const n1 = b.me.n;
        killed(b, 20000); pass(4000);
        b = start(path.dirname(ramDir(b.o.tmp)), data);
        ok(n1 === 3 && b.me.n === 4 && b.before.n === 3 && b.lives.map((l) => l.n).join() === '3,2,1' && b.lives.length === 3, '  the highest number in the app\'s own copy: its two lives become #2 and #1, this life #3, and the next start is #4 with all of them still there');
        // (a number just under the top is counted on from, and the step over the top numbers the lives again without losing one)
        tmp = dir(); data = dir();
        plant(tmp, [life(MAX_N - 1)]);
        b = start(tmp, data);
        const top = b.me.n;
        killed(b, 20000); pass(4000);
        b = start(tmp, data);
        ok(top === MAX_N && b.me.n === 3 && b.before.n === 2 && b.byItself === true && b.lives.map((l) => l.n).join() === '2,1', '  a life numbered ' + MAX_N + ' is read back at the next start (as #2, the one before it as #1): no life is lost at the step over the top');

        // ---- 3. the record in RAM is gone and the head unit did NOT restart ----
        const gone = (jump) => {
            const t = dir(), d = dir();
            let x = start(t, d);
            for (let i = 1; i <= 22; i++) { pass(2000); x.note(Object.assign({}, NOTE, { mem: 60 + i }), true); }
            pass(1000);
            rmrf(ramDir(t));                        // the folder in RAM is removed; the head unit runs on
            pass(20000);
            if (jump) T.wall += jump;               // (the wall clock is set in between, as the head unit does from GPS)
            x = start(t, d);
            return x;
        };
        let g = gone(0);
        ok(g.readFrom === 'disk' && g.restarted === false && g.ramGone === true && g.byItself === true && /^#2 now: 0 s \(the record in RAM was gone, no restart since #1\)/.test(text(g)[0]) && /^#1 .* lived at least 10 s \(saved note, up to a minute old\), NO WORD/.test(text(g)[1]) && g.lines()[1].warn === true,
            'a life 45 s old is killed and its folder in RAM removed, while the head unit runs on (its uptime and its wall clock both 65 s further): "' + text(g)[0].slice(0, 62) + '", NOT "the head unit was restarted", and the Drift tab is told that the app stopped by itself (as released: "restarted", and no line on the Drift tab)');
        g = gone(3600000);
        ok(g.restarted === true && g.ramGone === false && g.byItself === false && /the head unit was restarted since #1/.test(text(g)[0]), '  the same with the wall clock an hour further than the uptime (the clock was set, or the unit was off in between): the two clocks do not agree, so it is taken as a restart, as before');
        const upWas = T.up;
        const t3 = dir(), d3 = dir();
        g = start(t3, d3);
        for (let i = 1; i <= 22; i++) { pass(2000); g.note(NOTE, true); }
        rmrf(ramDir(t3));
        // (a real restart, long ago: the unit has been up for longer than it was up before, so the uptime alone does not tell)
        T.wall += 3 * 3600000; T.up = upWas + 44 + 1800;
        g = start(t3, d3);
        ok(g.restarted === true && g.byItself === false, '  a real restart after which the head unit has been up for longer than before (uptime half an hour further, wall clock three hours): a restart, by the two clocks');
        T.up = 5000;
        // ---- 4. the folder in RAM goes away while the app runs: made again within a minute ----
        tmp = dir(); data = dir();
        b = start(tmp, data);
        pass(4000); b.note(NOTE, false);
        rmrf(ramDir(tmp));
        const warnsBefore = logs.filter((l) => /^WARN starts and stops: the record in RAM cannot be written/.test(l)).length;
        let backAfter = null, stillSaid = null;
        for (let i = 1; i <= 40 && backAfter === null; i++) { pass(2000); b.note(Object.assign({}, NOTE, { mem: 70 + i }), false); if (i === 3) stillSaid = /\(no record in RAM: data folder only\)/.test(text(b)[0]); if (fs.existsSync(ramFile(tmp))) backAfter = i * 2; }
        const warned = logs.filter((l) => /^WARN starts and stops: the record in RAM cannot be written/.test(l)).length - warnsBefore;
        ok(backAfter !== null && backAfter <= RAM_RETRY_MS / 1000 + 2 && stillSaid === true && b.ram === true && warned === 1 && logs.some((l) => /the record in RAM is kept again/.test(l)) && (fs.lstatSync(ramDir(tmp)).mode & 0o777) === 0o755 && read(ramFile(tmp)).lives[0].note.mem === 70 + backAfter / 2 && !/no record in RAM/.test(text(b)[0]),
            'the folder in RAM is removed while the app runs: the first line says "no record in RAM: data folder only", one warning is logged, and ' + backAfter + ' s later the folder is made again (0755) and the record is back in it with its newest note (as released it was never made again)');
        pass(3000);
        n = start(tmp, data);
        ok(n.readFrom === 'ram' && n.before.n === 1 && n.before.atLeast !== true && n.byItself === true && n.restarted === false, '  killed after that: the next start reads the record in RAM again, with the last note, and says that the app stopped by itself');

        // ---- 5. a named pipe under the TEMPORARY name of the record in RAM: an ordinary open of it would wait for good ----
        tmp = dir(); data = dir();
        fs.mkdirSync(ramDir(tmp), 0o755);
        let piped = false;
        try { cp.execFileSync('mkfifo', [ramFile(tmp) + '.tmp']); piped = fs.lstatSync(ramFile(tmp) + '.tmp').isFIFO(); } catch (e) { /* no mkfifo on this machine */ }
        // (in a process of its own, with a time limit: if the open waited, this test would wait with it)
        const child = cp.spawnSync(process.execPath, ['-e', 'const { Box } = require(' + JSON.stringify(path.join(JS, 'box')) + '); const t0 = Date.now(); const b = new Box({ id: "pps_drift", ver: "1.0.1", dataDir: ' + JSON.stringify(data) + ', tmp: ' + JSON.stringify(tmp) + ', mono: () => Date.now(), groups: {}, names: [] }); console.log(JSON.stringify({ ram: b.ram, n: b.me.n, ms: Date.now() - t0 }));'], { timeout: 6000, killSignal: 'SIGKILL', encoding: 'utf8' });
        let came = null;
        try { came = JSON.parse(child.stdout); } catch (e) { came = null; }
        ok(piped && came && came.ram === true && came.n === 1 && came.ms < 1000 && fs.lstatSync(ramFile(tmp)).isFile() && fs.readdirSync(ramDir(tmp)).join() === RAM_FILE && read(ramFile(tmp)).lives[0].n === 1,
            'a named pipe under the temporary name the record is written under (box.json.tmp): the start does not wait on it (' + (came ? came.ms + ' ms' : 'the process did not come back in 6 s' + (child.error ? ': ' + child.error.message : '')) + '), the pipe is removed and the record written (as released the app hung at its start for good)' + (piped ? '' : ' (NOT RUN: mkfifo is not available here)'));
        // (and a folder under that name, which cannot be removed that way: "no" is the answer, not a throw or a wait)
        tmp = dir();
        fs.mkdirSync(ramDir(tmp), 0o755); fs.mkdirSync(ramFile(tmp) + '.tmp');
        b = start(tmp, dir());
        ok(b.ram === false && b.disk === true && b.me.n === 1, '  a folder under that name: nothing is written to RAM, the app runs on with the data folder\'s copy');

        // ---- 6. signals: none is listened for unless asked; one that another listener handles is only noted ----
        const counts = () => SIGS.map((sg) => process.listenerCount(sg)).join();
        tmp = dir(); data = dir();
        const c0 = counts();
        b = start(tmp, data);
        const c1 = counts(), l1 = b.listening();
        b.signals(true); b.signals(true);
        const c2 = counts(), l2 = b.listening();
        b.signals(false);
        const c3 = counts(), l3 = b.listening();
        ok(c0 === '0,0,0' && c1 === '0,0,0' && l1 === false && c2 === '1,1,1' && l2 === true && c3 === '0,0,0' && l3 === false,
            'as it starts the record listens for no signal (SIGTERM, SIGHUP, SIGINT: ' + c1 + ' listeners): the process answers a signal exactly as it did in 1.0.0. signals(true) adds one listener each, however often it is called (' + c2 + '); signals(false) takes them off again (' + c3 + ')');
        // the SDK turns a signal into its shutdown event: a clean stop, and the signal is noted beside it
        pass(24000); b.note(NOTE, true);
        b.signal('SIGTERM', false);
        const mid = read(ramFile(tmp)).lives[0];
        b.end('asked'); b.end('exit', 0);
        pass(9000);
        n = start(tmp, data);
        ok(mid.end === null && mid.sig === 'SIGTERM' && n.before.end === 'asked' && n.before.sig === 'SIGTERM' && n.before.code === 0 && n.byItself === false && n.lines()[1].warn === false && /^#1 .* lived 24 s, asked to stop by the car \(the signal SIGTERM came first\), Last note: /.test(text(n)[1]),
            'SIGTERM is heard while another listener on the process handles it, and the SDK then asks the app to stop: the signal is noted at once (not as the end), and the next start says "' + text(n)[1].slice(27, 100) + ' ...". A clean stop: the Drift tab is not told that the app stopped by itself (as released: "ENDED BY THE SIGNAL SIGTERM", and the Drift tab asked for a photo)');
        // heard alone first, and the SDK asks after all: still a clean stop
        tmp = dir(); data = dir();
        b = start(tmp, data);
        pass(24000); b.note(NOTE, true);
        b.signal('SIGTERM', true); b.end('asked'); b.end('exit', 0);
        n = start(tmp, data);
        ok(n.before.end === 'asked' && n.before.sig === 'SIGTERM' && n.byItself === false && /asked to stop by the car \(the signal SIGTERM came first\)/.test(text(n)[1]), '  a signal noted as the end, and the shutdown event after it all the same: "asked" takes its place, the signal stays noted');
        // heard, handled by somebody else, and then no word at all
        tmp = dir(); data = dir();
        b = start(tmp, data);
        pass(24000); b.note(NOTE, true);
        b.signal('SIGHUP', false);
        n = start(tmp, data);
        ok(n.before.end === null && n.byItself === true && /^#1 .* lived 24 s, NO WORD \(killed, crashed or power lost\) \(the signal SIGHUP came first\), Last note: /.test(text(n)[1]), '  a signal that another listener handled, and then no word: "' + text(n)[1].slice(27, 105) + ' ..."');
        // a planted record cannot put odd text into that place
        tmp = dir();
        plant(tmp, [life(3, { end: 'asked', sig: 'SIGKILL <script>' }), life(2, { sig: 'SIGINT' })]);
        n = start(tmp, dir());
        ok(n.lives[0].sig === null && n.lives[1].sig === 'SIGINT' && text(n).every(printable) && !/script/.test(text(n).join('')), '  the signal\'s name is one of the three or nothing, whatever a file says');
        // one frame, one value: no "1 frames/s"
        tmp = dir();
        b = start(tmp, dir());
        pass(2000); b.note(Object.assign({}, NOTE, { fps: 1, nps: 1, path: 'soft' }), true);
        ok(/, 1 frame\/s software, 1 value\/s, /.test(text(b)[0]) && !/1 frames|1 values/.test(text(b)[0]), '  "1 frame/s software, 1 value/s" (it read "1 frames/s")');
    });

    /* ================= files the app did not write ================= */
    await ok.part('a record in RAM that is broken, cut off, huge, deep, or made up', async () => {
        const broken = {
            'an empty file': '', 'not JSON': 'this is not a record', 'cut off in the middle': '{"v":1,"rev":5,"lives":[{"n":7,"wall":17', 'a number': '42', 'null': 'null', 'a list': '[1,2,3]', 'another version': JSON.stringify({ v: 2, lives: [life(7)] }),
            'lives that are no list': JSON.stringify({ v: 1, lives: { n: 7 } }), 'no life that is one': JSON.stringify({ v: 1, lives: [null, 'x', 5, {}, { n: 'seven' }, { n: -1 }, { n: 1e12 }, []] }),
            '30000 levels deep': '['.repeat(30000) + ']'.repeat(30000), 'binary rubbish': Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 37) % 256)).toString('latin1'),
            'a key named __proto__': '{"v":1,"lives":[{"__proto__":{"n":7},"constructor":{"prototype":{"n":7}}}]}',
        };
        const bad = [];
        Object.keys(broken).forEach((name) => {
            const tmp = dir(), data = dir();
            plant(tmp, broken[name]);
            let b = null, t0 = Date.now();
            try { b = start(tmp, data); } catch (e) { bad.push(name + ': threw ' + e.message); return; }
            if (b.me.n !== 1 || b.lives.length !== 0 || !b.ram || Date.now() - t0 > 500) bad.push(name + ': life ' + b.me.n + ', ' + b.lives.length + ' lives before, ram ' + b.ram);
            if (!read(ramFile(tmp)) || read(ramFile(tmp)).lives[0].n !== 1) bad.push(name + ': not written over');
            if (({}).n !== undefined) bad.push(name + ': changed every object');
        });
        ok(bad.length === 0, Object.keys(broken).length + ' broken records (' + Object.keys(broken).join(', ') + '): each is taken as no record. The app starts as on a first start, without a throw, and writes its own over it' + (bad.length ? ': ' + bad.join(' | ') : ''));
        // huge: more than 64 KB is not read at all (the sizes here are written out, not taken from the app: the limit itself is checked)
        const tmp = dir(), data = dir(), KB64 = 64 * 1024;
        const big = JSON.stringify({ v: 1, rev: 5, lives: [life(7)], pad: 'x'.repeat(KB64) });
        plant(tmp, big);
        const b = start(tmp, data);
        ok(MAX_BYTES === KB64 && big.length > KB64 && big.length < KB64 + 400 && readSmall(path.join(dir(), 'nothing')) === null && b.me.n === 1 && b.lives.length === 0, 'a record of ' + Math.round(big.length / 1024) + ' KB with a true life in it: not read (64 KB is the most), so the app starts at life 1');
        const tmp3 = dir();
        const under = JSON.stringify({ v: 1, rev: 5, lives: [life(7)], pad: 'x'.repeat(KB64 - 600) });
        plant(tmp3, under);
        ok(under.length <= KB64 && under.length > KB64 - 600 && start(tmp3, dir()).me.n === 8, '(one just under 64 KB, ' + under.length + ' bytes, is read: life 8 follows its life 7)');
        // made up: every field at its worst
        const tmp4 = dir();
        const evil = 'A\u0000B\u0007\u001b[31mRED\u009b\n\r\tC\u202eD\ud83d\ude00E' + '<script>'.repeat(40);
        plant(tmp4, [
            { n: 9, wall: 'yesterday', up: -5, s: 1e99, end: 'error', code: 9999, err: evil, on: ['gpsOn', 'rm -rf', 7, null, 'wheelsOn'], uid: -1, disk: 'yes', emptied: 1, other: 'x',
                note: { mem: 1e12, memMax: -3, cpu: NaN, cpuMax: 'many', lag: Infinity, lagMax: 5.6, fps: 1e9, path: 'gpu\u0007', nps: -1, asked: 2.4, answered: null, show: 'everything', state: evil, ok: 300, want: 4, failed: 'none', wait: [evil, 'CDS2', { a: 1 }], bad: evil } },
            { n: 9, end: 'asked', note: NOTE }, { n: 8, end: 'killed by a ghost', err: evil, note: 'none', on: 'gpsOn' }, { n: 7.4, s: 12 }, { n: 6 }, { n: 5 }, { n: 4 }, { n: 3 }, { n: 2 },
        ]);
        const e = start(tmp4, dir()), lines = text(e), l9 = e.lives[0];
        ok(e.me.n === 10 && e.lives.length === KEEP - 1 && e.lives.map((l) => l.n).join() === '9,8,7,6', 'a made-up record with nine lives, one number twice: four are kept beside the new one, each number once, newest first');
        ok(l9.wall === null && l9.up === null && l9.s === 0 && l9.code === null && l9.on.join() === 'gpsOn,wheelsOn' && l9.uid === null && l9.disk === false && l9.emptied === false && l9.other === false && l9.err.length <= ERR_MAX && printable(l9.err) &&
            l9.note.mem === null && l9.note.memMax === null && l9.note.cpu === null && l9.note.lag === null && l9.note.lagMax === 6 && l9.note.fps === null && l9.note.path === null && l9.note.nps === null && l9.note.asked === 2 && l9.note.show === null && l9.note.state === null && l9.note.ok === null && l9.note.want === 4 && l9.note.wait.join() === 'CDS2' && l9.note.bad.length === 0,
            'every field is taken through the clean-up: a number that is not finite or not within its bounds is dropped, a word that is not in its list is dropped, "on" keeps the keys the app knows, flags must be true to be true');
        ok(lines.every(printable) && lines.every((l) => l.length < 420) && !lines.join('').match(/\u001b|RED\u009b|[\u0000-\u001f]/) && /THE APP'S OWN ERROR: A B\s+\[31mRED/.test(lines[1]) && e.lives[1].end === null && e.lives[1].err === '',
            'the one free text (an error\'s first line) reaches the screen as printable ASCII, 160 characters at most; control characters, escape sequences and other alphabets become spaces. An end that is none of the three reads as "no word"');
    });

    await ok.part('links, pipes and other people\'s folders in /tmp', async () => {
        // the file is a symbolic link to a record elsewhere: it is not read, and it is not written through
        let tmp = dir(), data = dir();
        const elsewhere = path.join(dir(), 'target.json'), theirs = JSON.stringify({ v: 1, rev: 5, lives: [life(70)] });
        fs.writeFileSync(elsewhere, theirs);
        fs.mkdirSync(ramDir(tmp), 0o755);
        fs.symlinkSync(elsewhere, ramFile(tmp));
        let b = start(tmp, data);
        ok(b.me.n === 1 && b.lives.length === 0 && fs.readFileSync(elsewhere, 'utf8') === theirs && fs.lstatSync(ramFile(tmp)).isFile() && read(ramFile(tmp)).lives[0].n === 1,
            'box.json is a symbolic link to a true record somewhere else: it is not followed. The app starts at life 1, the file it points to is untouched, and the link is replaced by the app\'s own file');
        // the temporary name is a symbolic link: not written through
        tmp = dir(); data = dir();
        const victim = path.join(dir(), 'victim.txt');
        fs.writeFileSync(victim, 'do not touch');
        fs.mkdirSync(ramDir(tmp), 0o755);
        fs.symlinkSync(victim, ramFile(tmp) + '.tmp');
        b = start(tmp, data);
        ok(fs.readFileSync(victim, 'utf8') === 'do not touch' && b.ram === true && read(ramFile(tmp)).lives[0].n === 1 && fs.readdirSync(ramDir(tmp)).join() === RAM_FILE, 'the temporary name it writes under is a symbolic link to another file: that file is not written to; the link is removed and the record written');
        // the folder itself is a symbolic link to somebody else's folder
        tmp = dir(); data = dir();
        const other = dir();
        fs.symlinkSync(other, ramDir(tmp));
        b = start(tmp, data);
        pass(2000); b.note(NOTE, true); b.end('asked');
        ok(b.ram === false && fs.readdirSync(other).length === 0 && b.disk === true && read(path.join(data, DISK_FILE)).lives[0].end === 'asked' && /\(no record in RAM: data folder only\)/.test(text(b)[0]),
            'the folder\'s name is a symbolic link to another folder: nothing is written there. The app runs on with the copy in the data folder alone, and its first line says so');
        // the folder belongs to another user (here: the process is told it is another user than the folder's owner)
        tmp = dir(); data = dir();
        const realUid = process.getuid;
        process.getuid = () => UID + 1;
        try {
            fs.mkdirSync(ramDir(tmp, UID + 1), 0o777);
            fs.writeFileSync(ramFile(tmp, UID + 1), JSON.stringify({ v: 1, rev: 5, lives: [life(55)] }));
            const before = fs.readFileSync(ramFile(tmp, UID + 1), 'utf8');
            b = start(tmp, data);
            pass(2000); b.note(NOTE, true);
            ok(b.ram === false && fs.readFileSync(ramFile(tmp, UID + 1), 'utf8') === before && fs.readdirSync(ramDir(tmp, UID + 1)).length === 1 && b.disk === true,
                'a folder with the app\'s own name that belongs to another user (planted before the app first ran): the app does not write into it');
        } finally { process.getuid = realUid; }
        // the folder's name is a plain file
        tmp = dir(); data = dir();
        fs.writeFileSync(ramDir(tmp), 'a file where the folder should be');
        b = start(tmp, data);
        ok(b.ram === false && b.disk === true && fs.readFileSync(ramDir(tmp), 'utf8') === 'a file where the folder should be', 'a plain file where the folder should be: left alone, data folder only');
        // a pipe where the record should be: opening it for reading would wait for ever
        tmp = dir(); data = dir();
        fs.mkdirSync(ramDir(tmp), 0o755);
        let piped = false;
        try { cp.execFileSync('mkfifo', [ramFile(tmp)]); piped = fs.lstatSync(ramFile(tmp)).isFIFO(); } catch (e) { /* no mkfifo on this machine */ }
        const t0 = Date.now();
        b = start(tmp, data);
        ok(piped && Date.now() - t0 < 1000 && b.me.n === 1 && b.ram === true && fs.lstatSync(ramFile(tmp)).isFile(), 'a named pipe where the record should be: the start does not wait on it (' + (Date.now() - t0) + ' ms), and the app\'s own file takes its place' + (piped ? '' : ' (NOT RUN: mkfifo is not available here)'));
        // no /tmp at all, and no data folder either
        b = start(path.join(dir(), 'no', 'such', 'folder'), null);
        pass(2000); b.note(NOTE, true); b.on(['gpsOn']); b.end('asked'); b.flush();
        ok(b.ram === false && b.disk === false && b.me.n === 1 && b.me.end === 'asked' && /\(the record cannot be kept\)/.test(text(b)[0]), 'neither place can be written: the app runs on with its record in memory, and the first line says "the record cannot be kept"');
        // a data folder that cannot be written
        tmp = dir(); data = dir();
        fs.chmodSync(data, 0o500);
        b = start(tmp, data);
        pass(2000); b.note(NOTE, true);
        fs.chmodSync(data, 0o700);
        ok(b.ram === true && b.disk === false && b.me.disk === false && read(ramFile(tmp)).lives[0].disk === false && fs.readdirSync(data).length === 0, 'a data folder that cannot be written: the record in RAM is kept and says that it has no copy there (so the next start will not call the folder "emptied")');
    });

    await ok.part('the record of another user id (the app was installed again)', async () => {
        const tmp = dir();
        plant(tmp, [life(41, { on: ['gpsOn'] }), life(40, { end: 'asked' })], UID + 7);
        const before = fs.readFileSync(ramFile(tmp, UID + 7), 'utf8');
        let b = start(tmp, dir());
        ok(b.readFrom === 'other' && b.me.n === 42 && b.lives.length === 2 && b.lives.every((l) => l.other) && b.byItself === false && /^#41 .* NO WORD \(killed, crashed or power lost\) \(as another user: installed again since\), Last note: /.test(text(b)[1]) && !text(b).some((l) => /emptied/.test(l)) &&
            fs.readFileSync(ramFile(tmp, UID + 7), 'utf8') === before && fs.readdirSync(ramDir(tmp, UID + 7)).length === 1,
            'no record of its own, one of another user id: its lives are shown as "as another user: installed again since", the count goes on from them (#42), the app does not say that it stopped by itself, and the other user\'s file is not touched');
        // its own record wins once it is the newer one
        pass(5000); b.note(NOTE, true); b.end('asked');
        b = start(tmp, dir());
        ok(b.readFrom === 'ram' && b.me.n === 43 && b.before.n === 42 && !b.before.other && b.lives[1].other === true, 'at the next start its own record is the newer one and is taken; the lives of the other user stay marked in it');
        // names that are not a user id, links, and many of them
        const tmp2 = dir();
        fs.mkdirSync(path.join(tmp2, 'pps-box-pps_drift-abc')); fs.writeFileSync(path.join(tmp2, 'pps-box-pps_drift-abc', RAM_FILE), JSON.stringify({ v: 1, lives: [life(900)] }));
        fs.mkdirSync(path.join(tmp2, 'pps-box-pps_drag-' + (UID + 1))); fs.writeFileSync(path.join(tmp2, 'pps-box-pps_drag-' + (UID + 1), RAM_FILE), JSON.stringify({ v: 1, lives: [life(800)] }));
        const real = dir();
        fs.writeFileSync(path.join(real, RAM_FILE), JSON.stringify({ v: 1, lives: [life(700)] }));
        fs.symlinkSync(real, path.join(tmp2, 'pps-box-pps_drift-' + (UID + 2)));
        ok(start(tmp2, dir()).me.n === 1, 'a folder whose name does not end in a user id, one of another app, and one that is a symbolic link are not read');
    });

    /* ================= the small file helpers, and what the app measures of itself ================= */
    await ok.part('the file helpers; memory, processor share and hold-ups', async () => {
        const d = dir();
        ok(ownDir(path.join(d, 'new')) === true && ownDir(path.join(d, 'new')) === true && ownDir(path.join(d, 'a', 'b')) === false && writeSmall(path.join(d, 'new'), 'f.json', '{"a":1}') === true && readSmall(path.join(d, 'new', 'f.json')) === '{"a":1}' &&
            writeSmall(path.join(d, 'nowhere'), 'f.json', 'x') === false && readSmall(d) === null && clean('{"v":1,"rev":3,"lives":[{"n":2},{"n":3}]}', []).lives[0].n === 3,
            'a folder is made once and found again; a file is written whole and read back; a folder that is not there, or a folder in a file\'s place, gives "no", never a throw');
        // real time from here: a timer every 100 ms that notes how late it fires
        const mono = () => { const h = process.hrtime(); return h[0] * 1000 + h[1] / 1e6; };
        const v = new Vitals({ mono });
        v.start();
        const first = v.read();
        await new Promise((r) => setTimeout(r, 350));
        const t0 = mono();
        while (mono() - t0 < 260) { /* the event loop is held up for a quarter of a second */ }
        await new Promise((r) => setTimeout(r, 250));
        const r = v.read();
        clearInterval(v.timer);
        ok(first.mem > 5 && first.cpu === null && r.mem > 5 && r.memMax >= r.mem && r.cpu >= 20 && r.cpu <= 400 && r.cpuMax >= r.cpu && r.lagMax >= 150 && r.lagMax <= 600 && r.lag === r.lagMax,
            'memory (' + r.mem + ' MB here), the processor share since the last look (' + r.cpu + ' % of one core: the test kept it busy for 0.26 s of 0.86), and the longest hold-up of the event loop (' + r.lagMax + ' ms for a hold-up of 260 ms)');
    });

    ok(logs.filter((l) => /^WARN/.test(l)).every((l) => /^WARN starts and stops: /.test(l)), 'whatever went wrong in all of this, the module only ever said so in the log (' + logs.filter((l) => /^WARN/.test(l)).length + ' warnings), and nothing was thrown into the app');
    ok.done();
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
