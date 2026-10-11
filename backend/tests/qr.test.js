const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PNG } = require('pngjs');
const jsQR = require('jsqr');
const { newQrToken, qrPng } = require('../qr');

test('Generated QR decodes to exactly the opaque token with a white quiet zone', async () => {
  const token = newQrToken();
  assert.match(token, /^BQ1:[A-F0-9]{64}$/);
  const png = PNG.sync.read(await qrPng(token));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.equal(decoded.data, token);
  assert.equal(png.width, png.height);
  for (let x = 0; x < png.width; x++) assert.deepEqual([...png.data.subarray(x * 4, x * 4 + 4)], [255,255,255,255]);
  assert.notEqual(newQrToken(), token);
});
test('QR rejects unversioned legacy payloads rather than encoding unknown personal data', async () => {
  await assert.rejects(qrPng('student:66309010001'), { status: 409 });
  await assert.rejects(qrPng('https://example.org'), { status: 409 });
});
