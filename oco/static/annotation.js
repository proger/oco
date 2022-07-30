/* This file is based on https://github.com/katspaugh/wavesurfer.js/blob/master/example/annotation/app.js */

/**
 * Create a WaveSurfer instance.
 */
 var wavesurfer; // eslint-disable-line no-var


 /**
  * Init & load.
  */
 window.addEventListener('load', function() {
     // Init wavesurfer
     wavesurfer = WaveSurfer.create({
         container: '#waveform',
         height: 250,
         pixelRatio: 2,
         scrollParent: true,
         normalize: true,
         minimap: false,
         backend: 'MediaElement',
         plugins: [
             WaveSurfer.regions.create(),
             WaveSurfer.timeline.create({
                 container: '#wave-timeline'
             }),
             WaveSurfer.spectrogram.create({
                 wavesurfer: wavesurfer,
                 container: "#wave-spectrogram",
                 labels: false,
                 height: 250
             })
         ]
     });

     console.log("loading", document.querySelector('audio').currentSrc)
     wavesurfer.load(document.querySelector('audio').currentSrc);

     /* Regions */
     wavesurfer.on('ready', function() {
         wavesurfer.enableDragSelection({
             color: randomColor(0.1)
         });

        fetch(window.location.pathname.replace('/wavesurfer', '/spans'))
            .then(r => r.json())
            .then(data => {
                loadRegions(data);
            });
     });
     wavesurfer.on('region-click', function(region, e) {
         e.stopPropagation();
         // Play on click, loop on shift click
         e.shiftKey ? region.playLoop() : region.play();
     });
     wavesurfer.on('region-click', editAnnotation);
     wavesurfer.on('region-updated', saveRegions);
     wavesurfer.on('region-removed', saveRegions);
     wavesurfer.on('region-in', showNote);
     wavesurfer.on('region-update-end', function(region, e) {
         e.stopPropagation();
         region.data.note = "Sound Event";
         editAnnotation(region);
     });

     wavesurfer.on('region-play', function(region) {
         region.once('out', function() {
             wavesurfer.play(region.start);
             wavesurfer.pause();
         });
     });

     /* Toggle play/pause buttons. */
     let playButton = document.querySelector('#play');
     let pauseButton = document.querySelector('#pause');
     wavesurfer.on('play', function() {
         playButton.style.display = 'none';
         pauseButton.style.display = '';
     });
     wavesurfer.on('pause', function() {
         playButton.style.display = '';
         pauseButton.style.display = 'none';
     });


     document.querySelector(
         '[data-action="delete-region"]'
     ).addEventListener('click', function() {
         let form = document.forms.edit;
         let regionId = form.dataset.region;
         if (regionId) {
             wavesurfer.regions.list[regionId].remove();
             form.reset();
         }
     });
 });

 function saveRegions() {
     const regions = JSON.stringify(
         Object.keys(wavesurfer.regions.list).map(function(id) {
             let region = wavesurfer.regions.list[id];
             return {
                 start: region.start,
                 end: region.end,
                 attributes: region.attributes,
                 data: region.data
             };
         })
     );
     fetch(window.location, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(regions)
     });
 }

 function loadRegions(regions) {
     regions.forEach(function(region) {
         region.color = randomColor(0.1);
         wavesurfer.addRegion(region);
     });
 }

 /**
  * Extract regions separated by silence.
  */
 function extractRegions(peaks, duration) {
     // Silence params
     const minValue = 0.0015;
     const minSeconds = 0.25;

     let length = peaks.length;
     let coef = duration / length;
     let minLen = minSeconds / coef;

     // Gather silence indeces
     let silences = [];
     Array.prototype.forEach.call(peaks, function(val, index) {
         if (Math.abs(val) <= minValue) {
             silences.push(index);
         }
     });

     // Cluster silence values
     let clusters = [];
     silences.forEach(function(val, index) {
         if (clusters.length && val == silences[index - 1] + 1) {
             clusters[clusters.length - 1].push(val);
         } else {
             clusters.push([val]);
         }
     });

     // Filter silence clusters by minimum length
     let fClusters = clusters.filter(function(cluster) {
         return cluster.length >= minLen;
     });

     // Create regions on the edges of silences
     let regions = fClusters.map(function(cluster, index) {
         let next = fClusters[index + 1];
         return {
             start: cluster[cluster.length - 1],
             end: next ? next[0] : length - 1
         };
     });

     // Add an initial region if the audio doesn't start with silence
     let firstCluster = fClusters[0];
     if (firstCluster && firstCluster[0] != 0) {
         regions.unshift({
             start: 0,
             end: firstCluster[firstCluster.length - 1]
         });
     }

     // Filter regions by minimum length
     let fRegions = regions.filter(function(reg) {
         return reg.end - reg.start >= minLen;
     });

     // Return time-based regions
     return fRegions.map(function(reg) {
         return {
             start: Math.round(reg.start * coef * 10) / 10,
             end: Math.round(reg.end * coef * 10) / 10
         };
     });
 }

 /**
  * Random RGBA color.
  */
 function randomColor(alpha) {
     return (
         'rgba(' +
         [
             ~~(Math.random() * 255),
             ~~(Math.random() * 255),
             ~~(Math.random() * 255),
             alpha || 1
         ] +
         ')'
     );
 }

 /**
  * Edit annotation for a region.
  */
 function editAnnotation(region) {
     let form = document.forms.edit;
     form.style.opacity = 1;
     (form.elements.start.value = Math.round(region.start * 10) / 10),
     (form.elements.end.value = Math.round(region.end * 10) / 10);
     form.elements.note.value = region.data.note || '';
     form.onsubmit = function(e) {
         e.preventDefault();
         region.update({
             start: form.elements.start.value,
             end: form.elements.end.value,
             data: {
                 note: form.elements.note.value
             }
         });
         form.style.opacity = 0;
     };
     form.onreset = function() {
         form.style.opacity = 0;
         form.dataset.region = null;
     };
     form.dataset.region = region.id;
 }

 /**
  * Display annotation.
  */
 function showNote(region) {
     if (!showNote.el) {
         showNote.el = document.querySelector('#subtitle');
     }
     showNote.el.textContent = region.data.note || '–';
 }

 let ws = window.wavesurfer;

var GLOBAL_ACTIONS = { // eslint-disable-line
    play: function() {
        window.wavesurfer.playPause();
    },

    back: function() {
        window.wavesurfer.skipBackward();
    },

    forth: function() {
        window.wavesurfer.skipForward();
    },

    'toggle-mute': function() {
        window.wavesurfer.toggleMute();
    }
};

// Bind actions to buttons and keypresses
document.addEventListener('DOMContentLoaded', function() {
    document.addEventListener('keydown', function(e) {
        let map = {
            32: 'play', // space
            37: 'back', // left
            39: 'forth' // right
        };
        let action = map[e.keyCode];
        if (action in GLOBAL_ACTIONS) {
            if (document == e.target || document.body == e.target || e.target.attributes["data-action"]) {
                e.preventDefault();
            }
            GLOBAL_ACTIONS[action](e);
        }
    });

    [].forEach.call(document.querySelectorAll('[data-action]'), function(el) {
        el.addEventListener('click', function(e) {
            let action = e.currentTarget.dataset.action;
            if (action in GLOBAL_ACTIONS) {
                e.preventDefault();
                GLOBAL_ACTIONS[action](e);
            }
        });
    });
});

