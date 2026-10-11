import assert from "node:assert/strict";
import test from "node:test";
import { averageColor, gateGain, mixForTheme, mixSettings, noiseLevel, shapedMix } from "./house-mix.ts";

test("night mix holds peaks harder than premiere", () => {
  const night = mixSettings("night");
  const premiere = mixSettings("premiere");
  assert.ok(night.ratio > premiere.ratio);
  assert.ok(night.threshold < premiere.threshold);
  assert.equal(mixSettings("flat").presence, 0);
  assert.ok(mixSettings("dialogue").presence > premiere.presence);
});

test("comfort themes use the night mix", () => {
  assert.equal(mixForTheme("ember"), "night");
  assert.equal(mixForTheme("gilt"), "premiere");
  assert.equal(mixForTheme("ink"), "dialogue");
});

test("denoise opens the gate and the equalizer still takes a nudge", () => {
  const open = shapedMix("premiere", { low: 0, mid: 0, high: 0 }, false);
  const cut = shapedMix("premiere", { low: -2, mid: 1, high: 0 }, true);
  assert.equal(open.gate, 0);
  assert.equal(open.hpf, 20);
  assert.equal(cut.gate > 0, true);
  assert.equal(cut.low, mixSettings("premiere").low - 2);
  assert.ok(mixSettings("night").lpf < mixSettings("premiere").lpf);
});

test("the gate stays open on speech and closes on hiss", () => {
  assert.equal(gateGain(0.05, 0.02), 1);
  assert.equal(gateGain(0.001, 0.02), 0.08);
  assert.equal(gateGain(0.2, 0), 1);
  const quiet = new Float32Array([0, 0, 0, 0]);
  const tone = new Float32Array([0.5, -0.5, 0.5, -0.5]);
  assert.equal(noiseLevel(quiet), 0);
  assert.ok(noiseLevel(tone) > 0.4);
});
test("letterbox black does not set the room light", () => {
  const data = new Uint8ClampedArray(64);
  data[16] = 200;
  data[17] = 40;
  data[18] = 20;
  data[19] = 255;
  assert.deepEqual(averageColor(data), [200, 40, 20]);
});
