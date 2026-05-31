"use strict";

const tf    = require("@tensorflow/tfjs");
require("@tensorflow/tfjs-backend-cpu");
const nsfw  = require("nsfwjs");
const { Jimp } = require("jimp");
const https = require("https");
const http  = require("http");
const fs    = require("fs");
const path  = require("path");

const TOP_RESULTS    = 5;
const NSFW_THRESHOLD = 0.5;

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https://") ? https : http;
    client
      .get(url, (res) => {
        if (res.statusCode !== 200)
          return reject(new Error(`HTTP ${res.statusCode} untuk ${url}`));
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end",  ()  => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

async function loadImageBuffer(source) {
  if (source.startsWith("http://") || source.startsWith("https://"))
    return fetchBuffer(source);
  const resolved = path.resolve(source);
  if (!fs.existsSync(resolved))
    throw new Error(`File tidak ditemukan: ${resolved}`);
  return fs.readFileSync(resolved);
}

async function bufferToTensor(buffer) {
  // Jimp v1 API: fromBuffer() bukan read()
  const image  = await Jimp.fromBuffer(buffer);
  const width  = image.bitmap.width;
  const height = image.bitmap.height;
  const data   = image.bitmap.data; // RGBA flat array
  const pixels = new Int32Array(width * height * 3);
  let idx = 0;
  for (let i = 0; i < data.length; i += 4) {
    pixels[idx++] = data[i];     // R
    pixels[idx++] = data[i + 1]; // G
    pixels[idx++] = data[i + 2]; // B
    // skip data[i+3] (Alpha)
  }
  return tf.tensor3d(pixels, [height, width, 3], "int32");
}

function printResults(source, predictions) {
  const label   = path.basename(source);
  const divider = "─".repeat(52);
  const cats    = ["Porn", "Hentai", "Sexy"];
  const isNSFW  = predictions.some(
    (p) => cats.includes(p.className) && p.probability >= NSFW_THRESHOLD
  );

  console.log(`\n${divider}`);
  console.log(`  ${isNSFW ? "🔞  NSFW" : "✅  SAFE"}  —  ${label}`);
  console.log(divider);

  const sorted = [...predictions].sort((a, b) => b.probability - a.probability);
  for (const { className, probability } of sorted) {
    const pct    = (probability * 100).toFixed(2).padStart(6);
    const barLen = Math.round(probability * 30);
    const bar    = "█".repeat(barLen) + "░".repeat(30 - barLen);
    const warn   = cats.includes(className) && probability >= NSFW_THRESHOLD ? " ⚠️" : "";
    console.log(`  ${className.padEnd(10)}  ${bar}  ${pct}%${warn}`);
  }
  console.log(divider);
}

async function main() {
  const sources = process.argv.slice(2);
  if (sources.length === 0) {
    console.log("Usage: node main.js <image-path-or-url> [image2] ...");
    console.log("Contoh: node main.js ./foto.jpg");
    process.exit(1);
  }

  console.log("⏳  Loading model...");
  await tf.setBackend("cpu");
  await tf.ready();
  const model = await nsfw.load();
  console.log("✅  Model loaded.\n");

  let passed = 0, failed = 0;

  for (const source of sources) {
    try {
      process.stdout.write(`🔍  Checking: ${source} ... `);
      const buffer      = await loadImageBuffer(source);
      const tensor      = await bufferToTensor(buffer);
      const predictions = await model.classify(tensor, TOP_RESULTS);
      tensor.dispose();
      process.stdout.write("done\n");
      printResults(source, predictions);
      passed++;
    } catch (err) {
      process.stdout.write("error\n");
      console.error(`  ❌  ${err.message}`);
      failed++;
    }
  }

  model.dispose();
  console.log(`\nDone. ${passed} checked, ${failed} failed.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});