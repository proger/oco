const sr = 1600; // rendered blocks per second (for downsampled display)
const rate = 16000; // fallback audio sample rate
let PAGESIZE = rate; // samples per page
const minPageSizeDefault = Math.max(10, Math.round(rate * 0.01)); // 10ms worth of samples
let waveformGain = 1;

var state = {};

function getSampleRate() {
    return window.audioSampleRate || rate;
}

function renderSamplesPerAudioSample() {
    return (2 * sr) / getSampleRate();
}

function totalSamples() {
    return Math.floor(window.samples.length / renderSamplesPerAudioSample());
}

function samplesToRenderIdx(samples) {
    return Math.floor(samples * renderSamplesPerAudioSample());
}

function sampleIntervalToRenderSlice([a, b]) {
    return [samplesToRenderIdx(a), samplesToRenderIdx(b)];
}

function meme(x) {
    const log = document.getElementById('log');
    //state = {...state, ...x};
    state = {...x};
    log.insertAdjacentHTML('afterbegin', `<div>ᴼᶜᴼ ${JSON.stringify(state)}</div>`);
    while (log.childElementCount > 1) {
	log.removeChild(log.lastElementChild);
    }
}
meme({loading: true});

window.addEventListener('resize', function(e) {
    //console.log('resize', e);
});

var offlineAudioCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2,rate*40,rate);

function decodeAudio(arrayBuffer) {
    return new Promise(resolve => {
	offlineAudioCtx.decodeAudioData(arrayBuffer, function(audioBuffer) {
	    return resolve(audioBuffer);
	});
    });
}

// XXX: this is slow
// returns 2*sr samples per second, min comes first
function resample(audioBuffer) {
    const pcm = audioBuffer.getChannelData(0);

    const blocksize = audioBuffer.sampleRate / sr;
    const blocks = Math.ceil(audioBuffer.length / blocksize);
    const out = new Float32Array(2*blocks);

    for (let i = 0; i < blocks; i++) {
	let min = 1, max = -1;
	for (let j = i*blocksize; j < (i+1)*blocksize; j++) {
	    if (pcm[j] < min)
		min = pcm[j];
	    if (pcm[j] > max)
		max = pcm[j];
	}
	out[2*i] = min;
	out[2*i+1] = max;
    }
    return out;
}

function mkPitchTrack(pitchData) {
    if (!pitchData || !pitchData.values || !pitchData.values.length) {
        return null;
    }

    const hop = (pitchData.hop || 0.005) * getSampleRate(); // convert seconds -> samples
    const values = Float32Array.from(pitchData.values, v => parseFloat(v) || 0);
    const periodicity = pitchData.periodicity ? Float32Array.from(pitchData.periodicity, v => parseFloat(v) || 0) : null;
    let max = 0;
    for (const v of values) {
        if (v > max) {
            max = v;
        }
    }

    return {values, hop, max: max || 1, periodicity};
}


function renderall() {
    const npages = Math.ceil(totalSamples() / PAGESIZE);
    const pageroot = document.getElementById('viewer') || document.body;

    meme({guide: "drag to select; ␣ to play/pause; ⇧+␣ to loop play; ⏎ to mark; ⌫ to unmark; w to select words; z to snap to zero; ⇧+z to snap to 2 glottal periods; s to download selection; ⇧+s to download 16x loop; +/- to change page size; ⇧+/- to change waveform gain"});

    for (let p = 0; p < npages; p++) {
	renderpage(p);
    }
    for (let p = npages; p < _pagecache.length; p++) {
	const page = _pagecache[p];
	if (page && page.container && page.container.parentNode === pageroot) {
	    pageroot.removeChild(page.container);
	}
    }
    _pagecache.length = Math.min(_pagecache.length, npages);
}

// disjoint ordered interval sequence
function wordseq(words) {
    // const {interval,...} = word;
    // TODO: check every input word and see if the intervals are valid (mkinterval(i) != null)
    // and there are no overlaps

    function intersect([a,b]) { // intervals must not overlap
	let begin = find(a);
	while (begin > 0 && intersection(words[begin-1].interval, [a,b]) != null) {
	    begin--;
	}

	let end = find(b);
	while (end > 0 && intersection(words[end-1].interval, [a,b]) == null) {
	    end--;
	}
	const ret = words.slice(begin, end);
	//console.log('intersect', begin, end, [a,b], ret.length ? ret[0].interval : 'meh', ret.length ? ret[ret.length-1].interval : 'meh');
	return ret;
    }

    function find(offset) {
	let l = 0;
	let r = words.length-1;
	while (true) {
	    let i = (l+r)/2|0;

	    if ( r < l ) {
		// l is the place to insert
		return l;
	    }

	    if (words[i].interval[0] < offset) {
		l = i+1;
	    } else {
		r = i-1;
	    }
	}
    }

    function create([a,b]) {
	if (intersect([a,b]).length) {
	    console.log('ignored overlapping interval!', [a,b]);
	    return false;
	}
	let index = find(a);
	words.splice(index, 0, {interval: [a,b]});
	return true;
    }

    function killIntersection([u,v]) {
	const ix = intersect([u,v]);
	if (!ix) {
	    return null;
	}

	const out = []; // list of remaining intervals
	for (const x of ix) {
	    const [a,b] = x.interval;
	    const index = find(a);
	    if (u < a) {
		if (v >= b) {
		    // selection covers
		    // : remove the whole thing
		    words.splice(index, 1);
		} else {
		    // selection extends to the left

		    // replace the interval
		    x.interval = [v,b];
		    out.push([v,b]);
		}
	    } else {
		if (v < b) {
		    // selection is inside
		    words.splice(index, 1,
				 a == u ? undefined : Object.assign(Object.assign({}, x), {interval: [a,u]}),
				 v == b ? undefined : Object.assign(Object.assign({}, x), {interval: [v,b]}));
		    if (a != u) {
			out.push([a,u]);
		    }
		    if (v != b) {
			out.push([v,b]);
		    }
		} else {
		    if (a == u) {
			words.splice(index, 1); // do not
		    } else {
			// selection extends to the right
			x.interval = [a,u];
			out.push([a,u]);
		    }
		}
	    }
	}
	return out;
    }

    return {words, find, intersect, create, killIntersection};
}


    const waveformHeight = 150;
    const pitchHeight = 60;
    const margin = 10;
    const minPageSize = minPageSizeDefault;

var waveformSelect = false;

var sel = null;
var selstart = null;
var selnow = null;
var selpages = g2pages(sel);

function applysel(extend) {
    let newpart = null;
    if (selstart !== null && selnow !== null) {
	newpart = [Math.round(selstart), Math.round(selnow)].sort((a,b) => a-b);
    }
    if (!sel || !extend) {
	return newpart;
    }
    if (sel && newpart) {
	const ix = intersection(newpart, sel);
	const u = union(newpart, sel);
	if (isize(u) > isize(sel)) {
	    return u;
	} else {
	    return ix;
	}
    } else {
	return sel;
    }
}

function refreshpages() {
    const newselpages = g2pages(sel);
    const torefresh = mergeuniq(selpages, newselpages);
    selpages = newselpages;

    //console.log('torefresh', torefresh);
    for (const p of torefresh) { // todo: only rerender boundary pages when possible
	renderpage(p);
    }
}

function mouseEvents() {
    function mousedown(e) {
	//console.log('mousedown', e);

	// shift continues previous selection
	if (!e.shiftKey && e.target && e.target.dataset.page != null) {
	    clearSelection();
	    waveformSelect = true;
	    for (const el of document.querySelectorAll('.annotations')) {
		el.classList.add('noselect');
	    }

	    const p = parseInt(e.target.dataset.page);
	    const second = mx2g(p, e);
	    selstart = mx2g(p,e);
	    selnow = selstart;

	    sel = applysel(e.shiftKey);
	    refreshpages();
	}
    }

    function mousemove(e) {
	if (waveformSelect && e.target && e.target.dataset.page != null) {
	    //console.log('mousemove', e);

	    const p = parseInt(e.target.dataset.page);
	    selnow = mx2g(p, e);

	    sel = applysel(false);
	    refreshpages();
	    meme({sel});
	}

    }

    function dblclick(e) {
	if (e.target && e.target.dataset.page != null) {
	    const p = parseInt(e.target.dataset.page);
	    meme(selintersection([mx2g(p, e), mx2g(p, e)], e));
	}
    }

    return {mousedown, mousemove, dblclick};
}

function selintersection([a,b], e) { // XXX: should probably tell selected words apart from random regions in 'sel' via a sum type
    const intervalTrackName = e.target.dataset.intervalTrackName;
    if (intervalTrackName === 'pitch' && window.pitchTrack && e.target.dataset.page != null) {
        const p = parseInt(e.target.dataset.page);
        const s = mx2g(p, e);
        const hop = window.pitchTrack.hop || 0.01;
        const idx = Math.floor(s / hop);
        const interval = [idx * hop, (idx + 1) * hop - 1];
        const pitch = window.pitchTrack.values ? window.pitchTrack.values[idx] : null;
        const periodicity = window.pitchTrack.periodicity ? Math.round(window.pitchTrack.periodicity[idx]*1000)/1000 : null;
        selstart = interval[0];
        selnow = interval[1];
        sel = interval;
        refreshpages();
        return {sel, track: intervalTrackName, pitch, periodicity};
    }

    if (intervalTrackName == 'waveform') {
	sel = applysel(e.shiftKey);
	refreshpages();
	return {sel, track: intervalTrackName};
    }

    const intervals = window.intervalTracks.get(intervalTrackName);
    if (!intervals) {
        sel = applysel(e.shiftKey);
        refreshpages();
        return {sel, track: intervalTrackName};
    }

    const ix = intervals.intersect([a,b]);
    if (ix.length) {
	selstart = ix[0].interval[0];
	selnow = ix[ix.length-1].interval[1];

	sel = imargin(applysel(e.shiftKey));
	refreshpages();
	return {sel, track: intervalTrackName};
    } else {
	sel = imargin(applysel(e.shiftKey));
	refreshpages();
	return {sel, track: intervalTrackName};
    }
}

window._mouseEvents = mouseEvents();
var _mouseEvents = window._mouseEvents;

// global mouseup in case user moves outside canvas
window.addEventListener('mouseup', function(e) {
    //console.log('mouseup', e);
    if (waveformSelect) {
	waveformSelect = false;
	for (const el of document.querySelectorAll('.annotations')) {
	    el.classList.remove('noselect');
	}
    }

    if (e.target && e.target.dataset.page != null) {
	const p = parseInt(e.target.dataset.page);
	const s = mx2g(p, e);
	selnow = s;

	sel = applysel(e.shiftKey);
	refreshpages();
	meme(selintersection(sel, e));

    }
});

function mkcanvas(parent, height) {
    const ca = document.createElement('canvas');

    ca.style.height = `${height}px`;

    parent.appendChild(ca);

    fitcanvas(ca);

    ca.addEventListener('mousedown', _mouseEvents.mousedown);
    ca.addEventListener('mousemove', _mouseEvents.mousemove);
    ca.addEventListener('dblclick', _mouseEvents.dblclick);

    return ca;
}

function fitcanvas(ca) {
    ca.style.width = `${window.innerWidth - 2*margin}px`;

    var rect = ca.getBoundingClientRect();
    ca.width = rect.width * window.devicePixelRatio;
    ca.height = rect.height * window.devicePixelRatio;
}

window._pagecache = []; // [Map<key, track>];
var _pagecache = window._pagecache;
function getpage(n) {
    if (n > 0) {
	getpage(n-1);
    }

    if (_pagecache[n] === undefined) {
	const container = document.createElement('div');

	const pageroot = document.getElementById('viewer') || document.body;
	pageroot.appendChild(container);
	container.style.position = 'relative';

	const ca = mkcanvas(container, waveformHeight);
	ca.classList.add('waveform');

	const pitchCanvas = window.pitchTrack ? mkcanvas(container, pitchHeight) : null;
	if (pitchCanvas) {
	    pitchCanvas.classList.add('pitch');
	}

	const tracks = new Map();

	for (const [trackName, seq] of window.intervalTracks) {
	    const canvas = mkcanvas(container, 20);
	    canvas.classList.add('track');
	    tracks.set(trackName, {canvas});

	    if (seq.words.length && seq.words[0].name) {
		const wordsdiv = document.createElement('div');
		wordsdiv.classList.add('tracks');
		container.appendChild(wordsdiv);
		tracks.set(trackName, {canvas, wordsdiv});
	    }
	}

	const cursor = document.createElement('div');
	cursor.style.border = '1px solid #f00';
	cursor.style['box-sizing'] = 'border-box';
	cursor.style.background = '#f00';
	cursor.style.position = 'absolute';
	cursor.style.top = 0;
	cursor.style.left = 10;
	cursor.style.width = '3px';
	const cursorHeight = waveformHeight + (window.pitchTrack ? pitchHeight : 0);
	cursor.style.height = `${cursorHeight}px`;
	cursor.style.display = 'none';
	cursor.classList.add('cursor');
	container.appendChild(cursor);

	_pagecache[n] = {ca,cursor,tracks,container,pitchCanvas};
    }

    return _pagecache[n];
}

function mkinterval(a, b) {
    return a <= b ? [Math.round(a),Math.round(b)] : null;
}

function mkpoint(a) {
    return [a,a];
}

function intersection([a,b], [c,d]) {
    return mkinterval(Math.max(a,c), Math.min(b,d));
}

function union([a,b], [c,d]) {
    return mkinterval(Math.min(a,c), Math.max(b,d));
}

function inull(i) {
    if (!i) return true;
    return isize(i) < Number.EPSILON;
}

function alleq(xs, ys) {
    if (xs.length != ys.length) {
	return false;
    }
    for (let i = 0; i < xs.length; i++) {
	if (xs[i] != ys[i]) {
	    return false;
	}
    }
    return true;
}

function ieq([a,b], [c,d]) {
    return a == c && b == d;
}

function isize([a,b]) {
    return b-a;
}

function pageinterval(p) {
    return mkinterval(p*PAGESIZE, (p+1)*PAGESIZE);
}

function scale([a,b], s) {
    return [s*a, s*b];
}

// global interval to page indices
function g2pages(i) {
    const out = [];
    if (!i) {
	return out;
    }

    const [a,b] = i;
    const startpage = a/PAGESIZE|0;
    const endpage = b/PAGESIZE|0;

    for (let p = startpage; p <= endpage; p++) {
	out.push(p);
    }
    return out;
}

// global interval in seconds to page canvas interval in pixels
function g2pagepixels(global, p, width) {
    const i = intersection(pageinterval(p), global);
    if (!i) {
	return null;
    }
    const [start,b] = i;
    const duration = b-start;

    const x = (start%PAGESIZE)*(width/PAGESIZE)|0;
    const w = duration*(width/PAGESIZE)|0;
    return [x,x+w];
}

// mouse to global samples
function mx2g(p, e) {
    const offsetX = e.offsetX;
    //const offsetX = e.screenX - margin; // fucking chrome, just make sure the window is at the top left for now
    const width = e.target.width;
    const samples = PAGESIZE * (p + (offsetX / width) * window.devicePixelRatio);
    return samples;
}


// merge as in mergesort that removes duplicates. inputs must be sorted arrays for comparable things.
function mergeuniq(xs, ys) {
    const out = [];
    let last = undefined;
    for (let x = 0, y = 0;;) {
	if (x < xs.length && (y >= ys.length || xs[x] < ys[y])) {
	    if (last != xs[x]) {
		last = xs[x];
		out.push(last);
	    }
	    x++;
	} else if (y < ys.length) {
	    if (last != ys[y]) {
		last = ys[y];
		out.push(last);
	    }
	    y++;
	} else {
	    break;
	}
    }
    return out;
}

var cursorpos = null;

function renderpagecursor(p) {
    const {ca, cursor} = getpage(p);

    const cursorLoc = cursorpos ? g2pagepixels(mkpoint(cursorpos), p, ca.width) : null;
    if (cursorLoc) {
	cursor.style.display = 'block';
	cursor.style.left = `${cursorLoc[0]/window.devicePixelRatio}px`;
    } else {
	cursor.style.display = 'none';
    }
}

var globalAudioCtx = null;
var cursource = null;
var playerTimer = null;
var cursorStartTime = null;

function playmegabuffer(payload, loopOverride=null) {
    const {interval, buffer, files} = payload;
    const loop = loopOverride !== null ? loopOverride : payload.loop;
    const [a,b] = interval;
    const srLocal = buffer.sampleRate || getSampleRate();

    cursorpos = a;
    cursorStartTime = globalAudioCtx.currentTime;

    cursource = globalAudioCtx.createBufferSource();
    cursource.buffer = buffer;
    cursource.loop = !!loop;
    if (loop) {
	const loopStart = Math.max(0, (a - files[0].globalOffset) / srLocal);
	const loopEnd = Math.max(loopStart, (b - files[0].globalOffset) / srLocal);
	cursource.loopStart = loopStart;
	cursource.loopEnd = loopEnd;
    }

    cursource.connect(globalAudioCtx.destination);
    cursource.onended = () => dostop();
    if (loop) {
	cursource.start(0, Math.max(0, (a - files[0].globalOffset) / srLocal));
    } else {
	cursource.start(0, (a-files[0].globalOffset)/srLocal, (b-a)/srLocal);
    }

    meme({playing: [a, b], files});
    const loopDuration = loop ? Math.max(1, b - a) : null;
    playerTimer = setInterval(function() {
	const elapsed = globalAudioCtx ? globalAudioCtx.currentTime - cursorStartTime : 0;
	if (loopDuration) {
	    cursorpos = a + (elapsed * srLocal) % loopDuration;
	} else {
	    cursorpos = Math.min(b, a + elapsed * srLocal);
	}
	for (const p of g2pages(interval)) {
	    renderpagecursor(p);
	}
    }, 5);
}

var lastplayed = null;

function dostop() {
    if (cursource) {
	if (globalAudioCtx && cursorStartTime != null && lastplayed) {
	    const [a, b] = lastplayed.interval;
	    const elapsed = globalAudioCtx.currentTime - cursorStartTime;
	    const srLocal = lastplayed.buffer ? lastplayed.buffer.sampleRate || getSampleRate() : getSampleRate();
	    if (lastplayed.loop) {
		const dur = Math.max(1, b - a);
		cursorpos = a + (elapsed * srLocal) % dur;
	    } else {
		cursorpos = Math.min(b, a + elapsed * srLocal);
	    }
	}
	clearInterval(playerTimer);
	playerTimer = null;
	meme({stopped: Math.round(cursorpos), interval: lastplayed.interval});
	cursource.stop(0);
	cursource = null;
	cursorStartTime = null;

	cursorpos = null;
	for (const p of g2pages(lastplayed.interval)) {
	    renderpagecursor(p);
	}
    }
}

function playpause(sel, loop=false) {
    const interval = sel || [0, totalSamples()];
    const [a,b] = interval;

    const files = window.allfiles.intersect(interval);
    if (!files.length) {
	meme({error: "nothing to play"});
	return;
    }

    if (cursource) {
	if (cursource == 'wait') {
	    cursource = 'nevermind';
	    return;
	}
	dostop();
	return;
    }

    cursource = 'wait';

    if (lastplayed && ieq(lastplayed.interval, interval)) {
	lastplayed.loop = loop;
	playmegabuffer(lastplayed, loop);
	return;
    }

    function playbuffers(buffers, loopFlag) {
	if (cursource == 'nevermind') {
	    cursource = null;
	    return;
	}

	if (!globalAudioCtx) {
	    globalAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
	}

	var curbuffer = globalAudioCtx.createBuffer(1, buffers.reduce((a,x) => a+x.length, 0), buffers[0].sampleRate);
	for (let i = 0, offset = 0; i < buffers.length; i++) {
	    curbuffer.copyToChannel(buffers[i].getChannelData(0), 0, offset);
	    offset += buffers[i].length;
	}

	lastplayed = {interval, files, buffers, buffer: curbuffer, loop: loopFlag};
	playmegabuffer(lastplayed, loopFlag);
    }

    if (lastplayed && alleq(files.map(x => x.filename), lastplayed.files.map(x => x.filename))) {
	playbuffers(lastplayed.buffers, loop);
	return;
    }

    meme({loading: files});

    Promise.all(files.map(({filename}) => {
	return fetch(filename, {cache: "force-cache"}).then(function(response) {
	    return response.arrayBuffer();
	}).then(decodeAudio);
    })).then(buffers => playbuffers(buffers, loop));
}

function getBuffersForFiles(files) {
    const cached = window.audioBuffers;
    const allfileEntries = window.allfiles && window.allfiles.words;

    if (cached && allfileEntries && cached.length === allfileEntries.length) {
	const maybeBuffers = files.map(f => cached[allfileEntries.indexOf(f)]);
	if (maybeBuffers.every(Boolean)) {
	    return Promise.resolve(maybeBuffers);
	}
    }

    return Promise.all(files.map(({filename}) => {
	return fetch(filename, {cache: "force-cache"}).then(function(response) {
	    return response.arrayBuffer();
	}).then(decodeAudio);
    }));
}

function chooseFileIndexForTime(time, files) {
    if (!files || !files.length) {
	return null;
    }
    const idx = files.findIndex(f => time >= f.interval[0] && time <= f.interval[1]);
    if (idx !== -1) {
	return idx;
    }
    // Fallback: pick closest boundary.
    let bestIdx = 0;
    let bestDist = Math.abs(time - files[0].interval[0]);
    for (let i = 0; i < files.length; i++) {
	const f = files[i];
	const dist = time < f.interval[0] ? f.interval[0] - time : time - f.interval[1];
	if (dist < bestDist) {
	    bestDist = dist;
	    bestIdx = i;
	}
    }
    return bestIdx;
}

function findNearestZeroTime(time, files, buffers) {
    const fi = chooseFileIndexForTime(time, files);
    if (fi == null || fi < 0 || fi >= buffers.length) {
	return time;
    }
    const file = files[fi];
    const buffer = buffers[fi];
    if (!buffer || !buffer.getChannelData) {
	return time;
    }
    const data = buffer.getChannelData(0);
    if (!data || !data.length) {
	return time;
    }
    const srLocal = buffer.sampleRate || getSampleRate();
    let idx = Math.round(time - file.globalOffset);
    idx = Math.max(0, Math.min(data.length - 1, idx));
    const maxSearch = Math.min(data.length - 2, Math.max(1000, Math.floor(srLocal * 0.5))); // search up to ~0.5s
    const start = Math.max(0, idx - maxSearch);
    const end = Math.min(data.length - 2, idx + maxSearch);

    let bestPos = idx;
    let bestDist = Infinity;

    for (let i = start; i <= end; i++) {
	const a = data[i];
	const b = data[i + 1];
	const hasCross = (a === 0) || (b === 0) || (a > 0 && b < 0) || (a < 0 && b > 0);
	if (hasCross) {
	    const frac = (a === b) ? 0 : (a / (a - b));
	    const clampedFrac = Math.min(1, Math.max(0, frac));
	    const pos = i + clampedFrac;
	    const dist = Math.abs(pos - idx);
	    if (dist < bestDist) {
		bestDist = dist;
		bestPos = pos;
		if (bestDist === 0) break;
	    }
	}
    }

    if (!isFinite(bestDist) || bestDist === Infinity) {
	// fallback: nearest small-magnitude sample
	for (let step = 0; step <= maxSearch; step++) {
	    const candidates = [];
	    if (idx - step >= 0) candidates.push(idx - step);
	    if (idx + step < data.length) candidates.push(idx + step);
	    for (const ci of candidates) {
		const dist = Math.abs(ci - idx);
		if (dist >= bestDist) continue;
		bestDist = dist;
		bestPos = ci;
		if (Math.abs(data[ci]) < 1e-6) {
		    step = maxSearch + 1;
		    break;
		}
	    }
	}
    }

    return file.globalOffset + bestPos;
}

function snapSelectionToZeroCrossing(interval) {
    if (!interval || inull(interval)) {
	meme({error: "no selection to snap"});
	return;
    }
    const files = window.allfiles.intersect(interval);
    if (!files.length) {
	meme({error: "selection not covered by audio"});
	return;
    }
    getBuffersForFiles(files).then(buffers => {
	const a = findNearestZeroTime(interval[0], files, buffers);
	const b = findNearestZeroTime(interval[1], files, buffers);
	const snapped = mkinterval(Math.min(a, b), Math.max(a, b));
	if (snapped) {
	    sel = snapped;
	    selstart = snapped[0];
	    selnow = snapped[1];
	    refreshpages();
	    meme({snapped});
	}
    }).catch(err => {
	meme({error: "snap failed", details: err.message});
    });
}

function estimateGlottalPeriod(time) {
    if (!window.pitchTrack || !window.pitchTrack.values || !window.pitchTrack.values.length) {
	return getSampleRate() / 120; // samples for ~120 Hz
    }
    const {values, hop} = window.pitchTrack;
    const radius = 50; // search nearby frames for voiced pitch
    const center = Math.round(time / hop);
    for (let r = 0; r <= radius; r++) {
	for (const idx of [center - r, center + r]) {
	    if (idx < 0 || idx >= values.length) continue;
	    const f0 = values[idx];
	    if (f0 && f0 > 0) {
		return getSampleRate() / f0;
	    }
	}
    }
    return getSampleRate() / 120;
}

function snapSelectionToGlottalPeriods(interval) {
    if (!interval || inull(interval)) {
	meme({error: "no selection to snap"});
	return;
    }
    const files = window.allfiles.intersect(interval);
    if (!files.length) {
	meme({error: "selection not covered by audio"});
	return;
    }
    const center = (interval[0] + interval[1]) / 2;
    const period = estimateGlottalPeriod(center);
    const targetDur = 32 * period;
    const targetStart = center - targetDur / 2;
    const targetEnd = center + targetDur / 2;

    getBuffersForFiles(files).then(buffers => {
	const a = findNearestZeroTime(targetStart, files, buffers);
	const b = findNearestZeroTime(targetEnd, files, buffers);
	const snapped = mkinterval(Math.min(a, b), Math.max(a, b));
	if (snapped) {
	    sel = snapped;
	    selstart = snapped[0];
	    selnow = snapped[1];
	    refreshpages();
	    meme({snapped, period});
	}
    }).catch(err => {
	meme({error: "glottal snap failed", details: err.message});
    });
}

function extractSamplesFromBuffers(interval, files, buffers) {
    if (!buffers || !buffers.length) {
	return null;
    }
    const sampleRate = buffers[0].sampleRate;
    const chunks = [];
    let totalLength = 0;

    for (let i = 0; i < files.length; i++) {
	const fileInterval = files[i].interval;
	const overlap = intersection(fileInterval, interval);
	if (!overlap || inull(overlap)) {
	    continue;
	}
	const buffer = buffers[i];
	if (buffer.sampleRate !== sampleRate) {
	    throw new Error("sample rate mismatch across files");
	}
	const start = Math.max(0, Math.floor(overlap[0] - files[i].globalOffset));
	const end = Math.min(buffer.length, Math.ceil(overlap[1] - files[i].globalOffset));
	if (end <= start) {
	    continue;
	}
	const chunk = buffer.getChannelData(0).slice(start, end);
	chunks.push(chunk);
	totalLength += chunk.length;
    }

    const out = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
	out.set(chunk, offset);
	offset += chunk.length;
    }

    return {samples: out, sampleRate};
}

function encodeMonoWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    function writeString(offset, str) {
	for (let i = 0; i < str.length; i++) {
	    view.setUint8(offset + i, str.charCodeAt(i));
	}
    }

    let offset = 0;
    writeString(offset, 'RIFF'); offset += 4;
    view.setUint32(offset, 36 + samples.length * 2, true); offset += 4;
    writeString(offset, 'WAVE'); offset += 4;
    writeString(offset, 'fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4; // PCM chunk size
    view.setUint16(offset, 1, true); offset += 2; // PCM
    view.setUint16(offset, 1, true); offset += 2; // mono
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * 2, true); offset += 4; // byte rate
    view.setUint16(offset, 2, true); offset += 2; // block align
    view.setUint16(offset, 16, true); offset += 2; // bits per sample
    writeString(offset, 'data'); offset += 4;
    view.setUint32(offset, samples.length * 2, true); offset += 4;

    for (let i = 0; i < samples.length; i++, offset += 2) {
	const s = Math.max(-1, Math.min(1, samples[i]));
	view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return buffer;
}

function downloadSelectionAsWav(interval, loopCount=1) {
    if (!interval || inull(interval)) {
	meme({error: "select an interval to download"});
	return;
    }
    const files = window.allfiles.intersect(interval);
    if (!files.length) {
	meme({error: "nothing to download for selection"});
	return;
    }

    getBuffersForFiles(files).then(buffers => {
	const extracted = extractSamplesFromBuffers(interval, files, buffers);
	if (!extracted || !extracted.samples || !extracted.samples.length) {
	    meme({error: "no samples extracted for selection"});
	    return;
	}
	const {samples, sampleRate} = extracted;
	let toWrite = samples;
	if (loopCount > 1) {
	    const out = new Float32Array(samples.length * loopCount);
	    for (let i = 0; i < loopCount; i++) {
		out.set(samples, i * samples.length);
	    }
	    toWrite = out;
	}
	const wavBuffer = encodeMonoWav(toWrite, sampleRate);
	const blob = new Blob([wavBuffer], {type: 'audio/wav'});
	const url = URL.createObjectURL(blob);
	const [a,b] = interval;
	const loopTag = loopCount > 1 ? `x${loopCount}` : null;
	const fname = `selection_${a}-${b}${loopTag ? '_' + loopTag : ''}.wav`;
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = fname;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
	meme({download: fname, interval});
    }).catch(err => {
	meme({error: "download failed", details: err.message});
    });
}

function renderwaveform(p, ca, allsamples, localSelection) {
    ca.dataset.page = p;
    ca.dataset.intervalTrackName = 'waveform';

    const samples = allsamples.slice(...sampleIntervalToRenderSlice(pageinterval(p)));

    const expectedRenderSamplesPerPage = Math.max(1, Math.floor(PAGESIZE * renderSamplesPerAudioSample()));
    const w = ca.width / (expectedRenderSamplesPerPage / 2 || 1); // keep width tied to full page duration so short pages align

    const ctx = ca.getContext('2d');

    ctx.resetTransform();

    ctx.clearRect(0, 0, ca.width, ca.height);

    const loHeight = ca.height / 2 | 0;
    ctx.translate( 0, loHeight );

    let x = 0;
    let lo = true;

    for (const sample of samples) {
	const amp = Math.min(1, Math.abs(sample) * waveformGain);
	ctx.fillStyle = 'gray';

	if (lo) {
	    ctx.fillRect( x * w, 0, w, -amp * loHeight );
	} else {
	    ctx.fillRect( x * w, 0, w, amp * (ca.height - loHeight) );

	    x++;
	}
	lo = !lo;
    }

    ctx.resetTransform();

    if (localSelection) {
	ctx.fillStyle = '#98444755';
	const [a,b] = localSelection;
	ctx.fillRect( a, 0, b-a, ca.height );
    }
}

function renderpitch(p, ca, pitchTrack, localSelection) {
    if (!pitchTrack) {
        return;
    }

    ca.dataset.page = p;
    ca.dataset.intervalTrackName = 'pitch';

    const {values, hop, max, periodicity} = pitchTrack;
    const ctx = ca.getContext('2d');
    ctx.resetTransform();
    ctx.clearRect(0, 0, ca.width, ca.height);

    const pageStart = p * PAGESIZE;
    const pageEnd = (p + 1) * PAGESIZE;
    const startIndex = Math.max(0, Math.floor(pageStart / hop));
    const endIndex = Math.min(values.length, Math.ceil(pageEnd / hop));

    ctx.fillStyle = '#4a90e2';
    for (let i = startIndex; i < endIndex; i++) {
        const v = values[i];
        if (v <= 0) {
            continue;
        }
        const interval = [i * hop, (i + 1) * hop];
        const ix = g2pagepixels(interval, p, ca.width);
        if (!ix) {
            continue;
        }
        const [x0, x1] = ix;
        const w = x1 - x0 || 1;
        const h = Math.min(ca.height, (v / max) * ca.height);
        if (periodicity && periodicity[i] !== undefined) {
            const op = Math.min(1, Math.max(0, periodicity[i] + 0.1));
            ctx.fillStyle = `rgba(74,144,226,${op})`;
        } else {
            ctx.fillStyle = '#4a90e2';
        }
        ctx.fillRect(x0, ca.height - h, w, h);
    }

    if (localSelection) {
        ctx.fillStyle = '#98444755';
        const [a,b] = localSelection;
        ctx.fillRect( a, 0, b-a, ca.height );
    }
}

function renderintervals(p, intervalTrackName, {canvas}, intervalTrack, localSelection) {
    canvas.dataset.page = p;
    canvas.dataset.intervalTrackName = intervalTrackName;

    const ctx = canvas.getContext('2d');
    ctx.resetTransform();

    ctx.clearRect( 0, 0, canvas.width, canvas.height );
    ctx.translate( 0, 0 );

    ctx.fillStyle = 'gray';

    const pad = 2;

    for (const {interval} of intervalTrack.intersect(pageinterval(p))) {
	const [x,y] = g2pagepixels(interval, p, canvas.width);
	ctx.fillRect( x + pad, 0, y-x - pad, canvas.height );
    }

    if (localSelection) {
	ctx.fillStyle = '#98444755';
	const [a,b] = localSelection;
	ctx.fillRect( a + pad, 0, b-a - pad, canvas.height );
    }
}

function renderwords(p, intervalTrackName, t, seq, localSelection) {
    const words = seq.intersect(pageinterval(p));

    //t.wordsdiv.dataset.page = p; // xxx: .page is also abused to mean the event target is canvas
    t.wordsdiv.dataset.intervalTrackName = intervalTrackName;

    t.wordsdiv.innerHTML = `${words.map(z => `<span class="${localSelection && intersection(z.interval, sel) != null ? "highlighted" : ""}" data-offset=${z.interval[0]} data-end=${z.interval[1]}>${z.name}</span>`).join(' ')}`;
}

function renderpage(p) {
    const {ca,cursor,tracks,pitchCanvas} = getpage(p);

    const localSelection = sel ? g2pagepixels(sel, p, ca.width) : null;

    renderpagecursor(p);

    renderwaveform(p, ca, window.samples, localSelection);
    if (pitchCanvas && window.pitchTrack) {
	renderpitch(p, pitchCanvas, window.pitchTrack, localSelection);
    }

    for (const [intervalTrackName, t] of tracks) {
	const seq = window.intervalTracks.get(intervalTrackName);
	if (t.canvas) {
	    renderintervals(p, intervalTrackName, t, seq, localSelection);
	}
	if (t.wordsdiv) {
	    renderwords(p, intervalTrackName, t, seq, localSelection);
	}
    }
}

function spaninterval(node) {
    return mkinterval(parseFloat(node.dataset.offset), parseFloat(node.dataset.end));
}

function imargin([a,b]) {
    return [a, b];
}

function selectwords() {
    const {anchorNode, focusNode} = document.getSelection();
    console.log({anchorNode, focusNode});

    if (anchorNode &&
	anchorNode.parentNode &&
	anchorNode.parentNode.dataset.offset &&
	focusNode &&
	focusNode.parentNode &&
	focusNode.parentNode.dataset.offset) {

	const trackDiv = focusNode.parentNode.parentNode;
	let interval = union(spaninterval(anchorNode.parentNode), spaninterval(focusNode.parentNode));
	interval = imargin(interval);

	sel = interval;
	selstart = interval[0];
	selnow = interval[1];

	const intervals = window.intervalTracks.get(trackDiv.dataset.intervalTrackName);
	const ix = intervals.intersect(interval);

	const selinfo = {sel, track: trackDiv.dataset.intervalTrackName, items: ix}
	meme(selinfo);
	refreshpages();
	return selinfo;
    }

    return null;
}

function clearSelection() {
    const s = window.getSelection();
    s.removeAllRanges();

    sel = null;
    selstart = null;
    selnow = null;

    meme({sel});
}

function isPlusKey(e) {
    return e.key === '+' || e.key === '=' || e.code === 'Equal' || e.code === 'NumpadAdd';
}

function isMinusKey(e) {
    return e.key === '-' || e.key === '_' || e.code === 'Minus' || e.code === 'NumpadSubtract';
}

function changePageSize(delta) {
    PAGESIZE = Math.max(minPageSizeDefault, PAGESIZE + delta);
    selpages = g2pages(sel);
    meme({PAGESIZE});
    renderall();
}

function changeWaveformGain(delta) {
    waveformGain = Math.max(0.1, waveformGain + delta);
    meme({waveformGain});
    renderall();
}

document.body.addEventListener('keydown', function(e) {
    if (e.code == 'Space' || e.code == 'Enter' || e.code == 'Escape' || e.code == 'Backspace' || e.code == 'KeyK' || e.code == 'KeyW' || e.code == 'KeyS' || e.code == 'KeyR' || e.code == 'KeyZ') {
	e.preventDefault();
    }
});

document.body.addEventListener('keyup', function(e) {
    if (e.code == 'Space') {
	e.preventDefault();

	playpause(sel, e.shiftKey);
    } else if (e.code == 'Enter') {
	e.preventDefault();

	if (window.intervalTracks.get('conversations').create(sel)) {
	    meme({enter: sel, track: 'conversations'});
	    for (const p of g2pages(sel)) {
		renderpage(p);
	    }
	} else {
	    meme({enter: sel, error: 'could not create because overlaps existing interval'});
	}
    } else if (e.code == 'Escape') {
	e.preventDefault();
	clearSelection();
    } else if (e.code == 'Backspace') {
	e.preventDefault();
	const remaining = window.intervalTracks.get('conversations').killIntersection(sel);
	meme({remaining});
	for (const p of g2pages(sel)) {
	    renderpage(p);
	}
    } else if (e.code == 'KeyK') {

    } else if (e.code == 'KeyW') {
	selectwords();
    } else if (e.code == 'KeyR') {
	// TODO: rename word
    } else if (e.code == 'KeyZ') {
	e.preventDefault();
	if (e.shiftKey) {
	    snapSelectionToGlottalPeriods(sel);
	} else {
	    snapSelectionToZeroCrossing(sel);
	}
    } else if (e.code == 'KeyS') {
	e.preventDefault();
	if (e.shiftKey) {
	    downloadSelectionAsWav(sel, 16);
	} else {
	    downloadSelectionAsWav(sel);
	}
    } else if (isPlusKey(e)) {
	e.preventDefault();
	if (e.shiftKey) {
	    changeWaveformGain(10);
	} else {
	    changePageSize(-0.1 * getSampleRate());
	}
    } else if (isMinusKey(e)) {
	e.preventDefault();
	if (e.shiftKey) {
	    changeWaveformGain(-10);
	} else {
	    changePageSize(0.1 * getSampleRate());
	}
    }
});
