// scripts/unstruck-media/emoji.js — draws the Weekly's emoji (Twemoji, by
// jdecked, CC-BY 4.0) to small PNGs for the tiles and reduces each to a 6x6
// grid of picture-palette colors (one letter per cell) for the feedback. The
// transparent background becomes "." and plays no part in the feedback.
//
//   node scripts/unstruck-media/emoji.js <@twemoji/svg package dir> public/unstruck-media <out.json>
//
// Needs Playwright. catalog.py then folds <out.json> into weekly.json.
const { chromium } = require('playwright');
const fs = require('fs');
const [PKG, OUT, JSON_OUT] = process.argv.slice(2);

const SETS = {
  animals: [
    ['🦁', 'Lion'], ['🐯', 'Tiger'], ['🐻', 'Bear'], ['🐼', 'Panda'], ['🐨', 'Koala'], ['🐸', 'Frog'], ['🐵', 'Monkey'], ['🐷', 'Pig'],
    ['🐮', 'Cow'], ['🐰', 'Rabbit'], ['🐱', 'Cat'], ['🐶', 'Dog'], ['🦊', 'Fox'], ['🐺', 'Wolf'], ['🐴', 'Horse'], ['🦄', 'Unicorn'],
    ['🦓', 'Zebra'], ['🦒', 'Giraffe'], ['🐘', 'Elephant'], ['🦏', 'Rhino'], ['🦛', 'Hippo'], ['🐪', 'Camel'], ['🦘', 'Kangaroo'],
    ['🦔', 'Hedgehog'], ['🦇', 'Bat'], ['🐧', 'Penguin'], ['🐦', 'Bird'], ['🦜', 'Parrot'], ['🦩', 'Flamingo'], ['🦚', 'Peacock'],
    ['🦉', 'Owl'], ['🦅', 'Eagle'], ['🦆', 'Duck'], ['🦢', 'Swan'], ['🐔', 'Chicken'], ['🐢', 'Turtle'], ['🐍', 'Snake'],
    ['🦎', 'Lizard'], ['🐊', 'Crocodile'], ['🐳', 'Whale'], ['🐬', 'Dolphin'], ['🦈', 'Shark'], ['🐙', 'Octopus'], ['🦑', 'Squid'],
    ['🦀', 'Crab'], ['🦞', 'Lobster'], ['🐠', 'Tropical Fish'], ['🐡', 'Pufferfish'], ['🦋', 'Butterfly'], ['🐝', 'Bee'],
    ['🐞', 'Ladybug'], ['🐌', 'Snail'], ['🦕', 'Sauropod'], ['🦖', 'T-Rex'], ['🐿', 'Squirrel'], ['🦦', 'Otter'], ['🦥', 'Sloth'],
    ['🦨', 'Skunk'], ['🦡', 'Badger'], ['🐹', 'Hamster'], ['🐭', 'Mouse'], ['🦌', 'Deer'], ['🦬', 'Bison'], ['🐗', 'Boar'], ['🐑', 'Sheep']
  ],
  food: [
    ['🍎', 'Red Apple'], ['🍏', 'Green Apple'], ['🍐', 'Pear'], ['🍊', 'Orange'], ['🍋', 'Lemon'], ['🍌', 'Banana'], ['🍉', 'Watermelon'],
    ['🍇', 'Grapes'], ['🍓', 'Strawberry'], ['🫐', 'Blueberries'], ['🍈', 'Melon'], ['🍒', 'Cherries'], ['🍑', 'Peach'], ['🥭', 'Mango'],
    ['🍍', 'Pineapple'], ['🥥', 'Coconut'], ['🥝', 'Kiwi'], ['🍅', 'Tomato'], ['🍆', 'Eggplant'], ['🥑', 'Avocado'], ['🥦', 'Broccoli'],
    ['🥒', 'Cucumber'], ['🌶', 'Hot Pepper'], ['🌽', 'Corn'], ['🥕', 'Carrot'], ['🧄', 'Garlic'], ['🧅', 'Onion'], ['🥔', 'Potato'],
    ['🥐', 'Croissant'], ['🥯', 'Bagel'], ['🍞', 'Bread'], ['🥖', 'Baguette'], ['🧀', 'Cheese'], ['🥚', 'Egg'], ['🍳', 'Fried Egg'],
    ['🥞', 'Pancakes'], ['🧇', 'Waffle'], ['🥓', 'Bacon'], ['🍔', 'Burger'], ['🍟', 'Fries'], ['🍕', 'Pizza'], ['🌭', 'Hot Dog'],
    ['🥪', 'Sandwich'], ['🌮', 'Taco'], ['🌯', 'Burrito'], ['🍿', 'Popcorn'], ['🍩', 'Donut'], ['🍪', 'Cookie'], ['🎂', 'Birthday Cake'],
    ['🍰', 'Cake'], ['🧁', 'Cupcake'], ['🍫', 'Chocolate'], ['🍬', 'Candy'], ['🍭', 'Lollipop'], ['🍦', 'Ice Cream'], ['🍯', 'Honey'],
    ['🥛', 'Milk'], ['☕', 'Coffee'], ['🍵', 'Tea'], ['🍣', 'Sushi'], ['🍤', 'Shrimp'], ['🍙', 'Rice Ball'], ['🍜', 'Noodles'],
    ['🍝', 'Spaghetti'], ['🥗', 'Salad'], ['🍉', 'Watermelon'], ['🥨', 'Pretzel'], ['🍗', 'Drumstick'], ['🧊', 'Ice']
  ]
};
// Same palette as the photos used (catalog letters a-n).
const PAL = [[22,22,24],[238,236,228],[128,128,128],[186,40,36],[222,122,44],[226,196,64],[72,140,64],[36,70,42],
  [40,76,160],[128,172,214],[108,70,40],[200,168,122],[108,60,128],[220,146,160]];
const fileOf = ch => [...ch].map(c => c.codePointAt(0).toString(16)).filter(h => h !== 'fe0f').join('-') + '.svg';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const out = {};
  for (const [kind, list] of Object.entries(SETS)) {
    fs.mkdirSync(`${OUT}/${kind}`, { recursive: true });
    const seen = new Set();
    out[kind] = [];
    for (const [ch, name] of list) {
      const id = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seen.has(id)) continue;
      seen.add(id);
      const svg = fs.readFileSync(`${PKG}/${fileOf(ch)}`, 'utf8');
      const r = await p.evaluate(async ([src, PAL]) => {
        const img = new Image(); img.src = src; await img.decode();
        const W = 240, N = 6, C = 'abcdefghijklmn';
        const cv = document.createElement('canvas'); cv.width = cv.height = W;
        const g = cv.getContext('2d'); g.drawImage(img, 0, 0, W, W);
        const px = g.getImageData(0, 0, W, W).data;
        const near = (r, gg, bb) => { let best = 0, bd = 1e9; PAL.forEach((q, i) => { const d = 2*(r-q[0])**2 + 4*(gg-q[1])**2 + 3*(bb-q[2])**2; if (d < bd) { bd = d; best = i; } }); return best; };
        let cells = '';
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const cnt = new Array(PAL.length + 1).fill(0); // last slot: background
          for (let yy = y * W / N; yy < (y + 1) * W / N; yy += 2) for (let xx = x * W / N; xx < (x + 1) * W / N; xx += 2) {
            const k = (yy * W + xx) * 4;
            cnt[px[k + 3] < 128 ? PAL.length : near(px[k], px[k + 1], px[k + 2])]++;
          }
          const best = cnt.indexOf(Math.max(...cnt));
          cells += best === PAL.length ? '.' : C[best];
        }
        const small = document.createElement('canvas'); small.width = small.height = 144;
        small.getContext('2d').drawImage(img, 0, 0, 144, 144);
        return { cells, png: small.toDataURL('image/png') };
      }, ['data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'), PAL]);
      fs.writeFileSync(`${OUT}/${kind}/${id}.png`, Buffer.from(r.png.split(',')[1], 'base64'));
      out[kind].push({ id, name, img: `${kind}/${id}.png`, cells: r.cells });
    }
    console.log(kind, out[kind].length, '| distinct grids:', new Set(out[kind].map(x => x.cells)).size);
  }
  fs.writeFileSync(JSON_OUT, JSON.stringify(out));
  await b.close();
})();
