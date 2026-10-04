/**
 * story.cutonce.mjs — the step script for Cut Once's how-to slideshow.
 *
 * Each step either just looks at the app as it stands, or runs an action first:
 *   api.tap(selector)        click a real button in the app
 *   api.tapAt(x, y)          tap the pad at viewport coordinates
 *   api.drag(from, to)       drag on the pad (pencil / line / arrow / eraser)
 *   api.say(phrase)          feed a phrase through the app's speech pipeline
 *   api.setTool(name)        click the draw button until it reaches that tool
 *
 * target = what to spotlight and point the arrow at: a CSS selector, an explicit
 * { x, y, w, h } in viewport pixels, or null for a plain caption slide.
 * arrow  = 'up' | 'down' | 'left' | 'right' — the direction the arrow points.
 *
 * Viewport is 412x915; the pad is clear between the toolbars (y 130..800).
 */
const SPOT_ONE = [150, 320];
const SPOT_TWO = [270, 300];
const SPOT_THREE = [200, 430];
const around = ([x, y], r = 22) => ({ x: x - r, y: y - r, w: r * 2, h: r * 2 });

export default {
  title: 'Cut Once — how to use it',
  summary: 'A photo and a voice, turned into a cut list.',
  viewport: { width: 412, height: 915 },

  steps: [
    {
      id: 'welcome',
      title: 'This is Cut Once',
      caption: 'Take a picture or add one, or just draw on a blank page. Mark the spots you need to measure, call out your numbers, and they land right on those spots.'
    },
    {
      id: 'enter',
      run: (api) => api.tapAt(206, 700, 700),
      title: 'Tap anywhere to begin',
      caption: 'You land on one blank pad with two toolbars: photo tools up top, drawing tools down below.',
      target: '.toolbar.primary',
      arrow: 'down'
    },
    {
      id: 'photo',
      run: async (api) => {
        await api.page.setInputFiles('#photoInputGallery', api.appFile('howto-photo.jpg'));
        await api.sleep(700);
        await api.setTool('line');
        await api.drag([80, 640], [330, 500]);
        await api.expect(() => {
          const layer = document.getElementById('photoLayer');
          return !!layer.getAttribute('src') && layer.style.display !== 'none';
        }, 'the gallery photo never made it onto the pad');
      },
      title: 'Measure right on a photo',
      caption: 'Snap one with the camera or pull one from the gallery. The ink switches to a bright colour so it reads on any picture.',
      target: '#toolGallery',
      arrow: 'down'
    },
    {
      id: 'draw-tool',
      run: (api) => api.setTool('line'),
      title: 'The draw tool cycles',
      caption: 'Tap it to step through pencil, straight line, arrow, eraser. It is showing the straight line now.',
      target: '#toolDraw',
      arrow: 'down'
    },
    {
      id: 'draw-line',
      run: (api) => api.drag([90, 700], [320, 560]),
      title: 'Drag to draw',
      caption: 'Pencil, line and arrow all work the same way — drag, and let go. That is a straight line.'
    },
    {
      id: 'arrow-tool',
      run: async (api) => { await api.setTool('arrow'); await api.drag([350, 780], [245, 665]); },
      title: 'Arrow, for pointing',
      caption: 'One more tap of the tool gets you the arrow. Good for marking which end of a board you mean.'
    },
    {
      id: 'mic-on',
      run: async (api) => {
        await api.tap('#toolMic', 500);
        await api.tapAt(...SPOT_ONE);
        await api.tapAt(...SPOT_TWO);
        await api.tapAt(...SPOT_THREE);
        await api.expect(() => document.querySelectorAll('#voiceMarks .cursor-indicator').length === 3,
          'expected three rings on the pad after three taps');
      },
      title: 'Tap the mic, then mark your spots',
      caption: 'Every tap drops a circle on the spot you want to measure. Leave the mic on — it keeps listening.',
      target: '#toolMic',
      arrow: 'down'
    },
    {
      id: 'first-number',
      run: async (api) => {
        await api.say('24 and a half');
        api.note('Last heard: ' + await api.read(() =>
          (document.getElementById('rawLog').textContent.trim().split('\n').filter(Boolean).pop() || '')));
        // the labelled spot's ring is spent, so two of the three remain
        await api.expect(() => document.querySelectorAll('#voiceMarks .cursor-indicator').length === 2,
          'the spoken number did not land on the first spot');
      },
      title: 'Say the number',
      caption: 'Plain words. "Twenty four and a half" lands 24½ right on the spot — no keyboard, no typing.',
      target: around(SPOT_ONE),
      arrow: 'down'
    },
    {
      id: 'next-spot',
      run: async (api) => {
        await api.say('next');
        await api.say('17 and three quarters');
        await api.expect(() => document.querySelectorAll('#voiceMarks .cursor-indicator').length === 1,
          '"next" did not advance the mic to the second spot');
      },
      title: 'Say "next" for the next spot',
      caption: 'The mic moves to the next circle — the one it is on pulses so you always know where you are.',
      target: around(SPOT_TWO),
      arrow: 'down'
    },
    {
      id: 'back',
      run: async (api) => {
        await api.say('back');
        // the second spot's ring comes back: the number was lifted off it
        await api.expect(() => document.querySelectorAll('#voiceMarks .cursor-indicator').length === 2,
          '"back" did not put the second spot back in play');
      },
      title: 'Got it wrong? Say "back"',
      caption: 'It lifts the last number off and puts the mic back on that spot, so you can just say it again.',
      target: around(SPOT_TWO),
      arrow: 'down'
    },
    {
      id: 'undo',
      run: async (api) => {
        await api.tap('#toolUndo');
        // undoing the first spot's number revives that ring too: 3 back in play
        await api.expect(() => document.querySelectorAll('#voiceMarks .cursor-indicator').length === 3,
          'undo did not revive the marker for the number it removed');
      },
      title: 'The undo arrow',
      caption: 'Takes off your last mark. If that mark was a spoken number, the mic jumps back to that spot too.',
      target: '#toolUndo',
      arrow: 'down'
    },
    {
      id: 'save-slot',
      run: async (api) => {
        await api.tap('#toolSave', 500);
        await api.expect(() => !!localStorage.getItem('cutonce_slot_meta_1'),
          'the pad was not written to slot storage');
      },
      title: 'Save the pad',
      caption: 'One tap saves it. Your last six pads are kept, newest first — nothing to name, nothing to file.',
      target: '#toolSave',
      arrow: 'down'
    },
    {
      id: 'load-slot',
      run: async (api) => {
        await api.tap('#toolLoad', 600);
        await api.expect(() => {
          const tiles = document.querySelectorAll('#slotGrid .slotTile');
          return tiles.length === 6 && !!document.querySelector('#slotGrid .slotTile img');
        }, 'the slot grid did not show six tiles with a saved thumbnail');
      },
      title: 'Bring a pad back',
      caption: 'Load shows your last six as thumbnails. Tap one and it is back, ink and all.',
      target: '#slotGrid',
      arrow: 'left'
    },
    {
      id: 'send',
      run: (api) => api.tap('#slotClose', 500),
      title: 'Send it, or save it',
      caption: 'Send shares the pad as an image — text it to the guy in the garage. The arrow button saves it straight to your phone.',
      target: '#toolSend',
      arrow: 'down'
    },
    {
      id: 'settings',
      run: (api) => api.tap('#infoBtn', 400),
      title: 'Settings live behind the gear',
      caption: '"Last heard" shows what the mic thought it heard next to what it made of it — the quickest way to catch a number that landed wrong.',
      target: '#rawLog',
      arrow: 'right'
    },
    {
      id: 'walkthrough',
      title: 'Lost? Take the tour',
      caption: '"Show me how this works" puts a coach mark on every button, one at a time.',
      target: '#setWalk',
      arrow: 'down'
    },
    {
      id: 'done',
      run: (api) => api.tap('#infoCloseBottom', 400),
      title: "That's the tour",
      caption: 'Tap the mic, mark your spots, say the numbers, send the pad. Go cut something.'
    }
  ]
};
