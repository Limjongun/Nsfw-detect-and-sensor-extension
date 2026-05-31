// build-entry.js – entry point untuk bundle nsfwjs + model weights
// Semua model weights di-import secara eksplisit agar esbuild men-bundle semuanya inline
// Tanpa ini, nsfwjs akan coba dynamic require('../../models/...') yang gagal di browser/extension

'use strict';

const nsfwjs = require('nsfwjs');

// ── Import semua model weights secara eksplisit ──────────────────────────────
// Gunakan path relatif langsung ke node_modules karena nsfwjs punya "exports" map
// yang memblokir akses deep import via nama package (nsfwjs/dist/...)

// MobileNetV2 (default, paling ringan)
const mobilenetV2Model     = require('./node_modules/nsfwjs/dist/models/mobilenet_v2/model.min.js');
const mobilenetV2Shard1    = require('./node_modules/nsfwjs/dist/models/mobilenet_v2/group1-shard1of1.min.js');

// MobileNetV2 Mid
const mobilenetV2MidModel  = require('./node_modules/nsfwjs/dist/models/mobilenet_v2_mid/model.min.js');
const mobilenetV2MidShard1 = require('./node_modules/nsfwjs/dist/models/mobilenet_v2_mid/group1-shard1of2.min.js');
const mobilenetV2MidShard2 = require('./node_modules/nsfwjs/dist/models/mobilenet_v2_mid/group1-shard2of2.min.js');

// InceptionV3
const inceptionV3Model     = require('./node_modules/nsfwjs/dist/models/inception_v3/model.min.js');
const inceptionV3Shard1    = require('./node_modules/nsfwjs/dist/models/inception_v3/group1-shard1of6.min.js');
const inceptionV3Shard2    = require('./node_modules/nsfwjs/dist/models/inception_v3/group1-shard2of6.min.js');
const inceptionV3Shard3    = require('./node_modules/nsfwjs/dist/models/inception_v3/group1-shard3of6.min.js');
const inceptionV3Shard4    = require('./node_modules/nsfwjs/dist/models/inception_v3/group1-shard4of6.min.js');
const inceptionV3Shard5    = require('./node_modules/nsfwjs/dist/models/inception_v3/group1-shard5of6.min.js');
const inceptionV3Shard6    = require('./node_modules/nsfwjs/dist/models/inception_v3/group1-shard6of6.min.js');

// ── Daftarkan semua weights ke globalThis agar nsfwjs bisa resolve tanpa network ──
// nsfwjs di browser mode cek: globalThis["group1-shard1of1"] dst. (lihat fungsi PB() di bundle)
const g = (typeof globalThis !== 'undefined') ? globalThis
        : (typeof window    !== 'undefined') ? window
        : (typeof self      !== 'undefined') ? self : {};

// MobileNetV2 weights
g['group1_shard1of1']    = mobilenetV2Shard1.default || mobilenetV2Shard1;
g['model']               = mobilenetV2Model.default  || mobilenetV2Model;

// MobileNetV2 Mid weights
g['group1_shard1of2']    = mobilenetV2MidShard1.default || mobilenetV2MidShard1;
g['group1_shard2of2']    = mobilenetV2MidShard2.default || mobilenetV2MidShard2;

// InceptionV3 weights
g['group1_shard1of6']    = inceptionV3Shard1.default || inceptionV3Shard1;
g['group1_shard2of6']    = inceptionV3Shard2.default || inceptionV3Shard2;
g['group1_shard3of6']    = inceptionV3Shard3.default || inceptionV3Shard3;
g['group1_shard4of6']    = inceptionV3Shard4.default || inceptionV3Shard4;
g['group1_shard5of6']    = inceptionV3Shard5.default || inceptionV3Shard5;
g['group1_shard6of6']    = inceptionV3Shard6.default || inceptionV3Shard6;

// ── Expose nsfwjs ke window agar offscreen.js bisa pakai window.nsfwjs ──────
if (typeof window !== 'undefined') {
  window.nsfwjs = nsfwjs;
}

module.exports = nsfwjs;


