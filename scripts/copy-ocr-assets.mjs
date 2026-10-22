// Copies the tesseract.js worker, WASM core and English model into
// public/tesseract so AWP import OCR runs with no CDN calls (lab networks
// may block them). Runs before dev/build; output is git-ignored.
import { cpSync, mkdirSync } from 'node:fs';

const out = 'public/tesseract';
mkdirSync(`${out}/core`, { recursive: true });
cpSync('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`);
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  cpSync(`node_modules/tesseract.js-core/${f}`, `${out}/core/${f}`);
}
cpSync('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', `${out}/eng.traineddata.gz`);
