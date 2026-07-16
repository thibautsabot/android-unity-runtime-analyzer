import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { analyzeAndroidPackage } from "../src/analysis/analyzer.js";
import { AndroidPackage } from "../src/apk/android-package.js";
import { createBinaryManifest } from "./helpers/axml-fixture.js";
import { createZip } from "./helpers/zip-fixture.js";

test("detects Cocos2d-x from native library and dex", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aura-cocos2d-"));
  const path = join(directory, "cocos2d.apk");
  await writeFile(
    path,
    createZip([
      {
        name: "AndroidManifest.xml",
        data: createBinaryManifest({ packageName: "com.example.cocos2d" }),
      },
      {
        name: "classes.dex",
        data: Buffer.from("dex\n035 org/cocos2dx/lib/Cocos2dxActivity"),
      },
      { name: "lib/arm64-v8a/libcocos2dcpp.so", data: Buffer.from("cocos2d") },
    ]),
  );

  const pkg = await AndroidPackage.open(path);
  try {
    const report = await analyzeAndroidPackage(pkg);
    assert.ok(
      report.detections.some((d) => d.id === "cocos2d"),
      "should detect Cocos2d-x",
    );
  } finally {
    await pkg.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("detects LibGDX from native library and dex", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aura-libgdx-"));
  const path = join(directory, "libgdx.apk");
  await writeFile(
    path,
    createZip([
      {
        name: "AndroidManifest.xml",
        data: createBinaryManifest({ packageName: "com.example.libgdx" }),
      },
      {
        name: "classes.dex",
        data: Buffer.from("dex\n035 com/badlogic/gdx/Game"),
      },
      { name: "lib/arm64-v8a/libgdx.so", data: Buffer.from("gdx") },
    ]),
  );

  const pkg = await AndroidPackage.open(path);
  try {
    const report = await analyzeAndroidPackage(pkg);
    assert.ok(
      report.detections.some((d) => d.id === "libgdx"),
      "should detect LibGDX",
    );
  } finally {
    await pkg.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("detects Defold from native library and game archive", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aura-defold-"));
  const path = join(directory, "defold.apk");
  await writeFile(
    path,
    createZip([
      {
        name: "AndroidManifest.xml",
        data: createBinaryManifest({ packageName: "com.example.defold" }),
      },
      { name: "classes.dex", data: Buffer.from("dex\n035 ") },
      { name: "lib/arm64-v8a/libdmengine.so", data: Buffer.from("defold") },
      { name: "assets/game.arcd", data: Buffer.from("game-archive") },
    ]),
  );

  const pkg = await AndroidPackage.open(path);
  try {
    const report = await analyzeAndroidPackage(pkg);
    assert.ok(
      report.detections.some((d) => d.id === "defold"),
      "should detect Defold",
    );
  } finally {
    await pkg.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("detects Capacitor from web assets and dex", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aura-capacitor-new-"));
  const path = join(directory, "capacitor.apk");
  await writeFile(
    path,
    createZip([
      {
        name: "AndroidManifest.xml",
        data: createBinaryManifest({ packageName: "com.example.capacitornew" }),
      },
      {
        name: "classes.dex",
        data: Buffer.from("dex\n035 com/getcapacitor/BridgeActivity"),
      },
      { name: "assets/public/index.html", data: Buffer.from("<html>") },
      {
        name: "assets/public/capacitor.js",
        data: Buffer.from("capacitor bridge"),
      },
    ]),
  );

  const pkg = await AndroidPackage.open(path);
  try {
    const report = await analyzeAndroidPackage(pkg);
    assert.ok(
      report.detections.some((d) => d.id === "capacitor"),
      "should detect Capacitor",
    );
  } finally {
    await pkg.close();
    await rm(directory, { recursive: true, force: true });
  }
});
