// scripts/unstruck-media/flags.js — renders each country flag (flag-icons,
// MIT license) to a small PNG for the Weekly's tiles and reduces it to a 6x4
// grid of flag-palette colors (one digit per cell) for the feedback.
//
//   node scripts/unstruck-media/flags.js <flag-icons package dir> public/unstruck-media/flags <out.json>
//
// Needs Playwright (to draw the SVGs). catalog.py then folds <out.json> into
// public/unstruck-media/weekly.json.
const { chromium } = require('playwright');
const fs = require('fs');
const PKG = process.argv[2], OUT = process.argv[3];
const countries = JSON.parse(fs.readFileSync(PKG + '/country.json', 'utf8')).filter(c => c.iso);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const result = [];
  for (const c of countries) {
    const svg = fs.readFileSync(`${PKG}/flags/4x3/${c.code}.svg`, 'utf8');
    const data = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
    const r = await p.evaluate(async src => {
      const img = new Image(); img.src = src; await img.decode();
      const PAL = [[255,255,255],[0,0,0],[206,17,38],[128,0,32],[255,130,0],[252,209,22],[0,140,69],[0,56,168],[108,172,228]];
      const W = 240, H = 180, C = 6, R = 4;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d'); g.drawImage(img, 0, 0, W, H);
      const px = g.getImageData(0, 0, W, H).data;
      const near = (r, gg, bb) => { let best = 0, bd = 1e9; PAL.forEach((q, i) => { const d = 2*(r-q[0])**2 + 4*(gg-q[1])**2 + 3*(bb-q[2])**2; if (d < bd) { bd = d; best = i; } }); return best; };
      const cells = [];
      for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
        const cnt = new Array(PAL.length).fill(0);
        for (let yy = Math.floor(y*H/R); yy < Math.floor((y+1)*H/R); yy += 2) for (let xx = Math.floor(x*W/C); xx < Math.floor((x+1)*W/C); xx += 2) {
          const k = (yy*W + xx)*4; cnt[near(px[k], px[k+1], px[k+2])]++;
        }
        cells.push(cnt.indexOf(Math.max(...cnt)));
      }
      const small = document.createElement('canvas'); small.width = 160; small.height = 120;
      small.getContext('2d').drawImage(img, 0, 0, 160, 120);
      return { cells, png: small.toDataURL('image/png') };
    }, data);
    fs.writeFileSync(`${OUT}/${c.code}.png`, Buffer.from(r.png.split(',')[1], 'base64'));
    result.push({ id: c.code, name: c.name, cells: r.cells.join('') });
  }
  fs.writeFileSync(process.argv[4], JSON.stringify(result));
  console.log('flags:', result.length, '| distinct grids:', new Set(result.map(x => x.cells)).size);
  await b.close();
})();
