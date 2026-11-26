'use strict';
/**
 * test_drag_life.js <built app: dist/pps_drag> - Proven Drag's starts and stops on the kit's REAL runtime: the built
 * app's own kit/mgu.js (with its handler for uncaught errors, its shutdown path and its frame loop), display.js and
 * signals.js, in a process of its own, in real time. Only BMW's software is stood in for: the SDK and the native
 * SOME/IP binding (test_drag_life_host.js). This test plays MainApp: it starts the process, sends the SDK's shutdown
 * event, makes the app throw, kills it (SIGKILL), empties its data folder (what the kit's README 4.3 says the platform
 * does after an unexpected exit), and reads the app's screens between.
 *
 * WHY (1.0.2): on the first car the app closed by itself and nothing was left to say how. The app now keeps a record of
 * every start and stop (apps/pps_drag/box.js) and shows it on the Signals tab. The other two test files run the app on
 * a stand-in for the kit's runtime, where no process ever really ends; this one ends real processes the four ways a
 * process can end, and looks at what the next start says about each.
 * SIGNALS (the last two parts). As shipped the app puts no listener on its process for a signal, exactly as the
 * published 1.0.1, Proven Gauges and Proven Warm-Up: SIGTERM, SIGHUP and SIGINT end the process at once, also in the
 * middle of a hold-up of the app, and the record says NO WORD. With the Workshop setting "Note stop signals" switched
 * on the record listens for the three and names the one that ended the app; the price (a held-up app is not ended
 * by the signal until its code comes round again) is measured here too. Both states are run on real processes.
 *
 * The app is "installed" as on the car in a folder of this test's own (source/, data/, rhmiData/, someipInterfaces/),
 * under the system's temporary folder, removed at the end. ONE change is made to that copy of the kit: mgu.js keeps
 * its drawn frames in /tmp, and here that is the same stand-in folder the app's record uses for the head unit's RAM
 * disk (PPS_BOX_TMP), so that this test writes nothing to this computer's /tmp. Nothing else of the kit or the app is
 * changed.
 *
 * It runs in real time: about three minutes. What it cannot show: MainApp, the real SDK, the real binding, a car, Node 8
 * (this is the PC's Node). Memory and processor figures in the lines it prints are this computer's.
 *
 * PPS_TEST_ALL=1 in the environment: a failed check does not stop the run; they are listed at the end.
 */
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const { checker } = require('./fakecar');

if (!process.argv[2]) { console.error('usage: node proven/tools/test_drag_life.js dist/pps_drag'); process.exit(2); }
const BUILT = path.resolve(process.argv[2]), HOST = path.join(__dirname, 'test_drag_life_host.js');
const ok = checker();
const TOP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pps-drag-life-')));
process.on('exit', () => { try { fs.rmSync(TOP, { recursive: true, force: true }); } catch (e) { /* gone */ } });
const ROOT = path.join(TOP, 'oap_fake'), DATA = path.join(ROOT, 'data'), RAM = path.join(TOP, 'ram');
const uid = process.getuid ? process.getuid() : 0, BOX_DIR = path.join(RAM, 'pps-box-pps_drag-' + uid);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- the app, installed as on the car ---------- */
function install() {
    fs.mkdirSync(DATA, { recursive: true }); fs.mkdirSync(path.join(ROOT, 'rhmiData', 'resources'), { recursive: true }); fs.mkdirSync(RAM, { recursive: true });
    fs.cpSync(path.join(BUILT, 'source'), path.join(ROOT, 'source'), { recursive: true });
    [['oap-sdk', 'sdk'], ['someip', 'someip']].forEach((m) => {
        fs.mkdirSync(path.join(ROOT, 'source', 'node_modules', m[0]), { recursive: true });
        fs.writeFileSync(path.join(ROOT, 'source', 'node_modules', m[0], 'index.js'), 'module.exports = require(' + JSON.stringify(HOST) + ').' + m[1] + ';\n');
    });
    const mgu = path.join(ROOT, 'source', 'javascript', 'kit', 'mgu.js'), src = fs.readFileSync(mgu, 'utf8'), was = "path.join('/tmp', 'mgu-frames-'";
    if (src.indexOf(was) < 0) throw new Error('kit/mgu.js: the line with its frame folder was not found');
    fs.writeFileSync(mgu, src.replace(was, "path.join(process.env.PPS_BOX_TMP, 'mgu-frames-'"));
    fs.writeFileSync(path.join(ROOT, 'rhmiData', 'application.json'), JSON.stringify({ application: { entryPoints: [{ uuid: 'fake-entry-uuid' }] } }));
    // the interface files the installer would make from the manifest (the kit reads fields[f].getter of them)
    const proxies = JSON.parse(fs.readFileSync(path.join(BUILT, 'source', 'manifest.json'), 'utf8')).proxies;
    fs.mkdirSync(path.join(ROOT, 'someipInterfaces'), { recursive: true });
    Object.keys(proxies).forEach((iface) => {
        const e = proxies[iface], fields = {};
        if (!e || typeof e !== 'object') return;
        Object.keys(e.attributes || {}).forEach((f) => { fields[f] = e.attributes[f].indexOf('r') >= 0 ? { getter: { id: 1 } } : {}; });
        fs.writeFileSync(path.join(ROOT, 'someipInterfaces', iface.replace(/\./g, '_') + '.json'), JSON.stringify({ interface: iface, fields }));
    });
}

/* ---------- one start of the app: a process of its own ---------- */
let seq = 0;
function start() {
    const ch = cp.fork(HOST, [ROOT], { cwd: DATA, silent: true, env: Object.assign({}, process.env, { PPS_BOX_TMP: RAM }) });
    ch.err = ''; ch.stderr.on('data', (d) => { ch.err += d; }); ch.stdout.on('data', () => {});
    ch.done = new Promise((res) => ch.on('exit', (code, signal) => res({ code, signal })));
    ch.waiting = {}; ch.on('error', () => {});
    ch.loaded = new Promise((res) => ch.on('message', (m) => { if (m.t === 'loaded') res(); else if (m.t === 'texts' && ch.waiting[m.id]) { ch.waiting[m.id](m); delete ch.waiting[m.id]; } }));
    ch.say = (m) => { if (ch.connected) ch.send(m); };
    ch.ask = () => new Promise((res) => { const id = ++seq; ch.waiting[id] = res; ch.say({ t: 'texts', id }); setTimeout(() => { if (ch.waiting[id]) { delete ch.waiting[id]; res({ texts: [], pushed: 0, drawn: 0, sigs: [] }); } }, 4000); });
    /** The texts of the Signals tab's first page: two presses of "Previous page" from the Run tab (Run, Signals 2, Signals), and back. */
    ch.signals = async () => {
        ch.say({ t: 'click', id: 'BTN_PREV' }); await sleep(250); ch.say({ t: 'click', id: 'BTN_PREV' }); await sleep(500);
        const m = await ch.ask();
        ch.say({ t: 'click', id: 'BTN_PAGE' }); await sleep(150); ch.say({ t: 'click', id: 'BTN_PAGE' }); await sleep(350);
        return m.texts;
    };
    return ch;
}
/** Start the app and wait until its start-up logo has made room for the Run tab. */
async function open() { const ch = start(); await ch.loaded; await sleep(2600); return ch; }
const logText = () => { try { return fs.readFileSync(path.join(DATA, 'pps_drag.log'), 'utf8'); } catch (e) { return ''; } };
const readBox = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const has = (texts, s) => texts.indexOf(s) >= 0;
const find = (texts, re) => texts.filter((t) => re.test(t));
const STOPPED = 'The app stopped by itself last time. Please photograph the Signals tab.';
const RAMFILE = path.join(BOX_DIR, 'box.json'), DISKFILE = path.join(DATA, 'box.json');

(async () => {
    install();

    await ok.part('the first start: the record is there before anything else, a standing car is one picture, and a clean stop saves', async () => {
        const ch = await open();
        let m = await ch.ask();
        ok(has(m.texts, 'READY') && has(m.texts, 'SPEED WHEN IT CHANGES') && has(m.texts, 'GPS SCALE IS OFF IN SETTINGS') && !has(m.texts, STOPPED) && m.built.join() === 'Vehicle2,CDS2' && m.reads === 2 && m.subs === 2,
            'on the kit\'s real runtime, as shipped, a standing car: READY 2.6 s after the start; the binding saw 2 proxies, 2 subscriptions and the kit\'s own 2 first reads (' + m.built.join(', ') + ')');
        const a = readBox(RAMFILE), b = readBox(DISKFILE);
        ok(a && b && a.lives.length === 1 && a.lives[0].n === 1 && a.lives[0].end === '' && a.lives[0].ram === 1 && a.lives[0].disk === 1 && (fs.statSync(BOX_DIR).mode & 0o777) === 0o755 && (fs.statSync(RAMFILE).mode & 0o777) === 0o644,
            'the record of this start is in the stand-in for the RAM disk (folder 0755, file 0644) and in the data folder: life 1, no end noted');
        // nothing changes on the screen of a standing car: how many frames does the kit hand to the HMI?
        const p0 = m.pushed, d0 = m.drawn;
        await sleep(6000);
        m = await ch.ask();
        ok(m.drawn - d0 >= 30 && m.pushed - p0 <= 2, 'READY for 6 s, nothing changing: the app drew ' + (m.drawn - d0) + ' frames (the kit\'s loop, 10 a second in software) and the kit handed ' + (m.pushed - p0) +
            ' of them to the HMI as a PNG, because a frame that is the same as the last one is not sent (1.0.1, whose READY banner pulsed with the clock: about 10 a second, see the notes)');
        const note = readBox(RAMFILE).lives[0];
        ok(note.s >= 6 && note.note.state === 'armed' && note.note.setup === 'done' && note.note.path === 'software' && note.note.fps >= 5 && note.note.fps <= 12 && note.note.rss > 10 && note.note.tab === 'Run' && note.note.asked === 0,
            'the note in RAM, refreshed every 2 s: ' + note.s + ' s alive, memory ' + note.note.rss + ' MB, processor ' + note.note.cpu + ' %, longest hold-up ' + note.note.lag + ' ms, ' + note.note.fps + ' frames a second drawn in software, ' + note.note.nps +
            ' values a second, armed, Run tab, set-up done, 0 getter reads of its own');
        // the car asks the app to stop
        const before = fs.existsSync(path.join(DATA, 'pps_drag.json'));
        const t0 = Date.now();
        ch.say({ t: 'shutdown' });
        const end = await ch.done;
        const log = logText(), iAsk = log.indexOf('shutdown requested by MainApp'), iStop = log.indexOf('stopping: asked to stop by the car, the saved file is written'), iExit = log.indexOf('exit code 0');
        ok(end.code === 0 && Date.now() - t0 < 1500 && iAsk > 0 && iStop > iAsk && iExit > iStop, 'the SDK\'s shutdown event: the process ends with exit code 0 after ' + (Date.now() - t0) + ' ms, and the log has, in this order, the kit\'s "shutdown requested by MainApp", the app\'s "stopping: asked to stop by the car, the saved file is written", "exit code 0"');
        ok(!before && fs.existsSync(path.join(DATA, 'pps_drag.json')) && JSON.parse(fs.readFileSync(path.join(DATA, 'pps_drag.json'), 'utf8')).v === 1, 'the saved file was written in those 200 ms (it was not there before: nothing had been timed)');
        ok(readBox(RAMFILE).lives[0].end === 'asked' && readBox(RAMFILE).lives[0].code === 0 && readBox(DISKFILE).lives[0].end === 'asked', 'and both copies of the record say how this start ended: asked, exit code 0');
    });

    await ok.part('the next start says how the one before it ended: asked to stop, the app\'s own error, no word, no word and the data emptied', async () => {
        // after the clean stop
        let ch = await open();
        let run = (await ch.ask()).texts, sig = await ch.signals();
        ok(find(sig, /^#2 now, started /).length === 1 && find(sig, /^#1 at \d\d\.\d\d\. \d\d:\d\d lived \d+ s, asked to stop by the car\.$/).length === 1 && find(sig, /^ +Last note of #1: memory \d+ MB \(most \d+\), .*armed, extras off, set-up done, Run tab, /).length === 1 && !has(run, STOPPED),
            'after the clean stop: "' + (find(sig, /^#1 at /)[0] || '(not found)') + '", its last note under it, and nothing on the Run tab');
        ok(/starts and stops: #1 at .* asked to stop by the car\./.test(logText()), 'the same line is in the log of this start');
        // the app's own error
        ch.say({ t: 'throw' });
        let end = await ch.done;
        ok(end.code === 1 && /FATAL uncaught: Error: injected by the test: an uncaught error in a timer/.test(logText()) && /FATAL exit code 1/.test(logText()),
            'an uncaught error in a timer: the kit\'s own handler still runs (it logs "FATAL uncaught: ..." and exits with code 1: the app\'s listener swallowed nothing)');
        ok(readBox(RAMFILE).lives[0].end === 'error' && readBox(RAMFILE).lives[0].code === 1 && readBox(RAMFILE).lives[0].err === 'Error: injected by the test: an uncaught error in a timer', 'and the record had the error\'s first line and the exit code before the process was gone');
        const last2 = readBox(RAMFILE).lives[0].note;
        ok(last2.fps >= 5 && last2.fps <= 14 && last2.nps >= 5 && last2.nps <= 14, 'REPAIR. Its last note, taken twice within a millisecond at that end (the error, then the exit code), still says what the app was doing: ' + last2.fps + ' frames/s, ' + last2.nps +
            ' values/s (the car hands over 10 values a second, 10 frames a second are drawn). WAS: "0 frames/s, 0 values/s", as if the car\'s values had stopped before the error');
        ch = await open();
        run = (await ch.ask()).texts; sig = await ch.signals();
        ok(find(sig, /^#2 at .* lived \d+ s, THE APP'S OWN ERROR at tools\/test_drag_life_host\.js:\d+ \(exit code 1\): Error: injected by the test: an uncaught error in a timer\.$/).length === 1 && has(run, STOPPED),
            'the next start: "' + (find(sig, /^#2 at /)[0] || '(not found)') + '", and the Run tab says "' + STOPPED + '" (CHANGED ON PURPOSE in the repair: the file and line the error came from and the exit code stand before its text)');
        // killed: no word
        await sleep(2500);
        ch.kill('SIGKILL');
        end = await ch.done;
        ok(end.signal === 'SIGKILL' && readBox(RAMFILE).lives[0].n === 3 && readBox(RAMFILE).lives[0].end === '', 'the process killed (SIGKILL): nothing could be written at its end, the record of life 3 has no end');
        ch = await open();
        run = (await ch.ask()).texts; sig = await ch.signals();
        const note3 = find(sig, /^ +Last note of #3: memory \d+ MB \(most \d+\), processor \d+ % \(most \d+\), hold-up \d+ ms \(most \d+\), armed, extras off, set-up done, [A-Za-z0-9 ]+ tab, \d+ frames\/s software, \d+ values\/s$/);
        ok(find(sig, /^#3 at .* lived \d+ s, NO WORD \(killed or crashed\)\.$/).length === 1 && note3.length === 1 && has(run, STOPPED),
            'the next start: "' + (find(sig, /^#3 at /)[0] || '(not found)') + '" with "' + (note3[0] || '(not found)').trim() + '", and the Run tab has its line');
        // killed, and the data folder emptied
        await sleep(2500);
        ch.kill('SIGKILL');
        await ch.done;
        fs.readdirSync(DATA).forEach((f) => fs.rmSync(path.join(DATA, f), { recursive: true, force: true }));
        ch = await open();
        run = (await ch.ask()).texts; sig = await ch.signals();
        ok(find(sig, /^#5 now, started /).length === 1 && find(sig, /^The saved data was emptied after #4 \(the data folder's copy of this record was gone at this start\)\.$/).length === 1 && find(sig, /^#4 at .* NO WORD \(killed or crashed\)\.$/).length === 1 &&
            find(sig, /^#1 at .* asked to stop by the car\./).length === 1 && has(run, STOPPED) && has(run, 'READY'),
            'killed and its data folder emptied: the next start says "The saved data was emptied after #4 ...", "#4 ... NO WORD (killed or crashed)", still lists #3, #2 and #1 (the copy in RAM outlived the wipe), and the app runs: READY');
        ok(find(sig, /^Kept in RAM \(written \d+ s ago\) and in the data folder \(written \d+ s ago\)\.$/).length === 1 && readBox(DISKFILE) && readBox(DISKFILE).lives.length === 5, 'and the data folder has its copy again, with all five lives');
        ch.say({ t: 'shutdown' });
        end = await ch.done;
        ok(end.code === 0, 'a clean stop to end with');
    });

    await ok.part('a RAM folder that is not the app\'s own: nothing is written through it and the app runs', async () => {
        // somebody has put a symbolic link where the app's folder in RAM was
        const elsewhere = path.join(TOP, 'elsewhere');
        fs.mkdirSync(elsewhere);
        fs.rmSync(BOX_DIR, { recursive: true, force: true });
        fs.symlinkSync(elsewhere, BOX_DIR);
        const ch = await open();
        const run = (await ch.ask()).texts, sig = await ch.signals();
        ok(has(run, 'READY') && fs.readdirSync(elsewhere).length === 0 && find(sig, /^Kept in RAM \(NOT WRITTEN: .*pps-box-pps_drag-\d+ is not a real folder\) and in the data folder \(written \d+ s ago\)\.$/).length === 1 && find(sig, /^#6 now, started /).length === 1 &&
            find(sig, /^#5 at .* asked to stop by the car\.$/).length === 1,
            'a symbolic link in place of the app\'s folder in RAM: the app starts and says READY, writes nothing through the link, says so on the Signals tab ("Kept in RAM (NOT WRITTEN: ... is not a real folder) ..."), and goes on with the copy in the data folder (#6 now, #5 asked to stop by the car)');
        ch.say({ t: 'shutdown' });
        const end = await ch.done;
        ok(end.code === 0 && readBox(DISKFILE).lives[0].end === 'asked' && fs.readdirSync(elsewhere).length === 0, 'and it stops cleanly, the stop noted in the data folder\'s copy alone');
    });

    await ok.part('1.0.2: AS SHIPPED the app listens for no signal: SIGTERM, SIGHUP and SIGINT end the process at once, also in the middle of a hold-up, and the record says NO WORD', async () => {
        // (the folder in RAM is the app's own again: the link of the part before is taken away)
        fs.rmSync(BOX_DIR, { recursive: true, force: true });
        let ch = null, end = null;
        const ns = [];
        for (const name of ['SIGTERM', 'SIGHUP', 'SIGINT']) {
            ch = await open();
            const m = await ch.ask();
            await sleep(2200);
            const t0 = Date.now();
            ch.kill(name);
            end = await ch.done;
            const took = Date.now() - t0, r = readBox(RAMFILE).lives[0], d = readBox(DISKFILE).lives[0];
            ok(m.sigs.join() === '0,0,0' && end.signal === name && end.code === null && took < 1000 && r.end === '' && r.sig === '' && d.end === '' && r.note.on.sig === 0 && r.s >= 3,
                'CHANGED ON PURPOSE (was: the app listened and the record said "signal"). AS SHIPPED the process has ' + m.sigs.join(', ') + ' listeners for SIGTERM, SIGHUP, SIGINT. ' + name + ' sent to it: it ended by that signal ' + took +
                ' ms later (exit code none, signal ' + end.signal + '), and neither copy of the record has a word for that end (life ' + r.n + ', last note after ' + r.s + ' s)');
            ns.push(r.n);
        }
        ch = await open();
        let run = (await ch.ask()).texts, sig = await ch.signals();
        const line = find(sig, new RegExp('^#' + ns[2] + ' at .* lived \\d+ s, NO WORD \\(killed or crashed\\)\\.$'));
        ok(line.length === 1 && find(sig, new RegExp('^ +Last note of #' + ns[2] + ': memory .* extras off, ')).length === 1 && find(sig, new RegExp('^#' + ns[1] + ' at .* NO WORD ')).length === 1 && find(sig, new RegExp('^#' + ns[0] + ' at .* NO WORD ')).length === 1 && has(run, STOPPED),
            'the next start: "' + (line[0] || '(not found)') + '" with its last note, the two before it the same, and the Run tab has its line: as shipped an end by a signal reads like a kill');
        // in the middle of a hold-up: the app's code does not come round for 5 s, SIGTERM is sent 1 s into it
        await sleep(1500);
        ch.say({ t: 'hog', ms: 5000 });
        await sleep(1000);
        const t1 = Date.now();
        ch.kill('SIGTERM');
        end = await ch.done;
        const tookHeld = Date.now() - t1;
        ok(end.signal === 'SIGTERM' && end.code === null && tookHeld < 1000 && readBox(RAMFILE).lives[0].end === '',
            'AS SHIPPED, the app held up for 5 s and SIGTERM sent 1 s into the hold-up: the process ended by SIGTERM ' + tookHeld + ' ms after the signal, with 4 s of the hold-up still to go. That is how the published 1.0.1 and the working apps end (no listener): a signal ends an app that hangs');
    });

    await ok.part('1.0.2: with the Workshop setting "Note stop signals" ON the record names the signal and the process still ends by it; the price, measured; asked to stop with a signal beside it is a clean stop', async () => {
        let ch = await open(), end = null;
        // the setting is switched on while the app runs: Workshop settings first (it shows the row), then the row itself
        const before = await ch.ask();
        ch.say({ t: 'click', id: 'SET_WORKSHOP' }); await sleep(300);
        ch.say({ t: 'click', id: 'SET_XSIGNALS' }); await sleep(400);
        const after = await ch.ask(), note = readBox(RAMFILE).lives[0].note, set = JSON.parse(fs.readFileSync(path.join(DATA, 'settings.json'), 'utf8'));
        let sig = await ch.signals();
        ok(before.sigs.join() === '0,0,0' && after.sigs.join() === '1,1,1' && note.on.sig === 15 && set.xSignals === true && find(sig, /^#\d+ now, started .*, armed, notes stop signals, set-up done, /).length === 1,
            'NEW. "Note stop signals" switched on in the settings while the app runs: the process had ' + before.sigs.join(', ') + ' listeners for the three signals and has ' + after.sigs.join(', ') + ' at once, the copy in RAM says so, and the line of this life says "notes stop signals"');
        const told = [];
        for (const name of ['SIGTERM', 'SIGHUP', 'SIGINT']) {
            if (!ch) ch = await open();
            const m = await ch.ask();
            await sleep(2200);
            ch.kill(name);
            end = await ch.done;
            const r = readBox(RAMFILE).lives[0], d = readBox(DISKFILE).lives[0];
            ok(m.sigs.join() === '1,1,1' && end.signal === name && end.code === null && r.end === 'signal' && r.sig === name && d.end === 'signal' && d.sig === name && r.note.fps >= 5 && r.note.nps >= 5 && r.s >= 3 && r.note.on.sig === 15,
                'WITH THE SETTING ON (it is in the settings file, so each start has the listeners from the start: ' + m.sigs.join(', ') + '). ' + name + ' sent to the process: it ended by that signal (exit code none, signal ' + end.signal +
                ': the same end as without the app listening), and both copies of the record say "signal ' + r.sig + '" after ' + r.s + ' s, last note ' + r.note.fps + ' frames/s, ' + r.note.nps + ' values/s');
            told.push(r.n);
            ch = null;
        }
        ch = await open();
        let run = (await ch.ask()).texts;
        sig = await ch.signals();
        const line = find(sig, new RegExp('^#' + told[2] + ' at .* lived \\d+ s, ENDED BY THE SIGNAL SIGINT \\(sent to the app from outside\\)\\.$'));
        ok(line.length === 1 && find(sig, new RegExp('^ +Last note of #' + told[2] + ': memory .* notes stop signals, ')).length === 1 && find(sig, new RegExp('^#' + told[1] + ' at .* ENDED BY THE SIGNAL SIGHUP ')).length === 1 && find(sig, new RegExp('^#' + told[0] + ' at .* ENDED BY THE SIGNAL SIGTERM ')).length === 1 && has(run, STOPPED),
            'the next start: "' + (line[0] || '(not found)') + '" with its last note, the two before it listed as ended by SIGHUP and by SIGTERM, and the Run tab has its line (a signal alone, with no word from the car)');
        // THE PRICE: the app held up for 4 s, SIGTERM sent 1 s into it. The listener is only called when the app's code comes round again
        await sleep(1000);
        ch.say({ t: 'hog', ms: 4000 });
        await sleep(1000);
        const t1 = Date.now();
        ch.kill('SIGTERM');
        end = await ch.done;
        const tookHeld = Date.now() - t1, held = readBox(RAMFILE).lives[0];
        ok(end.signal === 'SIGTERM' && tookHeld >= 2500 && tookHeld < 6000 && held.end === 'signal' && held.sig === 'SIGTERM',
            'THE PRICE OF THE SETTING, measured: the app held up for 4 s and SIGTERM sent 1 s into the hold-up: the process ended by SIGTERM only ' + tookHeld + ' ms after the signal, when the hold-up was over (as shipped: at once, see the part before). An app that hangs for good is not ended by such a signal at all while this is on; SIGKILL ends it. The record says "signal SIGTERM"');
        // asked to stop by the car, and a signal in the same moment: a clean stop, no line on the Run tab
        ch = await open();
        await sleep(1500);
        let n = readBox(RAMFILE).lives[0].n;
        ch.say({ t: 'shutdown-signal', sig: 'SIGTERM' });
        end = await ch.done;
        const both = readBox(RAMFILE).lives[0];
        ch = await open();
        run = (await ch.ask()).texts; sig = await ch.signals();
        let asked = find(sig, new RegExp('^#' + n + ' at .* lived \\d+ s, asked to stop by the car \\(the signal SIGTERM came too\\)\\.$'));
        ok(both.n === n && both.end === 'asked' && both.sig === 'SIGTERM' && (end.signal === 'SIGTERM' || end.code === 0) && asked.length === 1 && !has(run, STOPPED) && has(run, 'READY'),
            'NEW. The shutdown event and SIGTERM in the same moment (the process ended with ' + JSON.stringify(end) + '): the next start says "' + (asked[0] || '(not found)') + '" and the Run tab does NOT say "' + STOPPED + '"');
        // somebody else on the process listens for SIGTERM too and answers it with the shutdown event: the signal comes first, the car's word after it
        await sleep(1500);
        n = readBox(RAMFILE).lives[0].n;
        ch.say({ t: 'sdk-listens', sig: 'SIGTERM' });
        await sleep(300);
        ch.kill('SIGTERM');
        end = await ch.done;
        const turned = readBox(RAMFILE).lives[0];
        ch = await open();
        run = (await ch.ask()).texts; sig = await ch.signals();
        asked = find(sig, new RegExp('^#' + n + ' at .* lived \\d+ s, asked to stop by the car \\(the signal SIGTERM came too\\)\\.$'));
        ok(turned.n === n && turned.end === 'asked' && turned.sig === 'SIGTERM' && end.code === 0 && end.signal === null && asked.length === 1 && !has(run, STOPPED),
            'NEW. Somebody else on the process listens for SIGTERM as well and turns it into the shutdown event (a stand-in: not known of BMW\'s SDK). SIGTERM comes first, the car\'s word after it: the app sends nothing itself, the process ends with exit code 0, the next start says "' +
            (asked[0] || '(not found)') + '", and the Run tab has no line. WAS: "ENDED BY THE SIGNAL SIGTERM" and the line "The app stopped by itself last time"');
        // switched off again: the listeners are gone at once, and a signal leaves no word again
        const on2 = await ch.ask();
        ch.say({ t: 'click', id: 'SET_XSIGNALS' }); await sleep(400);
        const off2 = await ch.ask(), offNote = readBox(RAMFILE).lives[0].note;
        sig = await ch.signals();
        n = readBox(RAMFILE).lives[0].n;
        await sleep(500);
        ch.kill('SIGTERM');
        end = await ch.done;
        const quiet = readBox(RAMFILE).lives[0];
        ok(on2.sigs.join() === '1,1,1' && off2.sigs.join() === '0,0,0' && offNote.on.sig === 0 && JSON.parse(fs.readFileSync(path.join(DATA, 'settings.json'), 'utf8')).xSignals === false && find(sig, /^#\d+ now, started .*, armed, extras off, set-up done, /).length === 1 &&
            end.signal === 'SIGTERM' && quiet.n === n && quiet.end === '' && quiet.sig === '',
            'NEW. The setting switched off again while the app runs: ' + on2.sigs.join(', ') + ' listeners before, ' + off2.sigs.join(', ') + ' at once after, the line of this life says "extras off" again, and SIGTERM then ends the process without a word, as shipped');
        // the car asks the app to stop, and the process is killed while it writes its saved file
        ch = await open();
        run = (await ch.ask()).texts;
        ok(has(run, STOPPED), '(the start after that: the Run tab has its line again, as after any end without a word)');
        const saved = path.join(DATA, 'pps_drag.json'), beforeFile = fs.readFileSync(saved, 'utf8');
        n = readBox(RAMFILE).lives[0].n;
        await sleep(1500);
        ch.say({ t: 'shutdown-killed' });
        end = await ch.done;
        ok(end.signal === 'SIGKILL' && readBox(RAMFILE).lives[0].n === n && readBox(RAMFILE).lives[0].end === 'asked' && readBox(DISKFILE).lives[0].end === '' && fs.readFileSync(saved, 'utf8') === beforeFile,
            'REPAIR. The shutdown event, and the process killed (SIGKILL) at the moment it begins to write its saved file: the copy of the record in RAM already says "asked" (the data folder\'s does not yet), and the saved file is the old one, whole');
        ch = await open();
        run = (await ch.ask()).texts; sig = await ch.signals();
        asked = find(sig, new RegExp('^#' + n + ' at .* lived \\d+ s, asked to stop by the car\\.$'));
        ok(asked.length === 1 && !has(run, STOPPED) && has(run, 'READY'), 'the next start: "' + (asked[0] || '(not found)') + '", and nothing on the Run tab. WAS: "NO WORD (killed or crashed)" and the line on the Run tab, for an app the car had asked to stop');
        ch.say({ t: 'shutdown' });
        end = await ch.done;
        ok(end.code === 0, 'a clean stop to end with');
    });

    ok.done();
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
