fetch(window.location.pathname + "/params.json")
    .then(input => input.json())
    .then(input_json => {
	console.log("input_json", input_json);
		let {filelist, tracksAndWords, pitch} = input_json;

		const pitchPromise = pitch && pitch.url ? fetch(pitch.url).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null);

		Promise.all([
		    // these samples have to be continuous, no gaps
		    // TODO: load pages progressively?
		    Promise.all(filelist.map(filename => {
		return fetch(filename, {cache: "force-cache"}).then(function(response) {
		    return response.arrayBuffer();
		}).then(decodeAudio);
	    })),

		    Promise.all(tracksAndWords.map(trackAndWords => {
			return Promise.all([
			    fetch(trackAndWords["words"]).then(r => r.json()),
			]).then(([segjson]) => [trackAndWords["speaker"], segjson]);
		    })),

		    pitchPromise,
		]).then(function([sampleArrays, sampleTracks, pitchData]) {
		    const sampleRate = (sampleArrays[0] && sampleArrays[0].sampleRate) || 16000;
		    window.audioSampleRate = sampleRate;
		    window.samples = [].concat(...sampleArrays.map(x => Array.from(resample(x))));
		    window.audioBuffers = sampleArrays;

		    window.intervalTracks = new Map();
		    window.intervalTracks.set('conversations', wordseq([]));
		    for (const [speaker, words] of sampleTracks || []) {
			const ws = (words || []).map(w => Object.assign({}, w, {interval: w.interval ? [Math.round(w.interval[0] * sampleRate), Math.round(w.interval[1] * sampleRate)-1] : w.interval}));
			window.intervalTracks.set(`words_${speaker}`, wordseq(ws));
		    }

		    window.pitchTrack = mkPitchTrack(pitchData);

		    const sampleLengths = sampleArrays.map(buf => buf.length);
		    const cumdurations = [0];
		    sampleLengths.reduce((sum, len) => {
			const next = sum + len;
			cumdurations.push(next);
			return next;
		    }, 0);

		    window.allfiles = wordseq(filelist.map(
			(filename, i) => ({filename,
				   globalOffset: cumdurations[i],
				   interval: mkinterval(cumdurations[i], cumdurations[i]+sampleLengths[i]-1)})));

	    renderall();
	});
    });
