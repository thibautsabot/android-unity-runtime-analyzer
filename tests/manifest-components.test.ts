import assert from "node:assert/strict";
import test from "node:test";
import { parseAndroidManifest } from "../src/apk/axml.js";
import { createBinaryManifest } from "./helpers/axml-fixture.js";

test("parses services, receivers, providers and meta-data from a plain-text manifest", () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<manifest package="com.example.app" versionCode="1" versionName="1.0">
  <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="34"/>
  <application android:debuggable="false" android:allowBackup="true">
    <service android:name="com.example.MyService" android:exported="false"/>
    <receiver android:name="com.example.MyReceiver" android:exported="true" android:permission="android.permission.RECEIVE_BOOT_COMPLETED"/>
    <provider android:name="com.example.MyProvider" android:authorities="com.example.provider" android:exported="false"/>
    <meta-data android:name="com.google.android.gms.version" android:value="12345"/>
  </application>
</manifest>`;

  const manifest = parseAndroidManifest(Buffer.from(xml));

  assert.equal(manifest.packageName, "com.example.app");

  assert.equal(manifest.services.length, 1);
  const service = manifest.services[0];
  assert.ok(service);
  assert.equal(service.name, "com.example.MyService");
  assert.equal(service.exported, false);

  assert.equal(manifest.receivers.length, 1);
  const receiver = manifest.receivers[0];
  assert.ok(receiver);
  assert.equal(receiver.name, "com.example.MyReceiver");
  assert.equal(receiver.exported, true);
  assert.equal(receiver.permission, "android.permission.RECEIVE_BOOT_COMPLETED");

  assert.equal(manifest.providers.length, 1);
  const provider = manifest.providers[0];
  assert.ok(provider);
  assert.equal(provider.name, "com.example.MyProvider");
  assert.equal(provider.authorities, "com.example.provider");
  assert.equal(provider.exported, false);

  assert.equal(manifest.metaData.length, 1);
  const meta = manifest.metaData[0];
  assert.ok(meta);
  assert.equal(meta.name, "com.google.android.gms.version");
  assert.equal(meta.value, "12345");
});

test("binary manifest fixture produces arrays for services, receivers, providers and metaData", () => {
  // The default createBinaryManifest fixture has no services/receivers/providers/metaData.
  // This verifies the parser returns valid (empty) arrays for those fields from binary AXML.
  const manifest = parseAndroidManifest(createBinaryManifest());

  assert.ok(Array.isArray(manifest.services));
  assert.ok(Array.isArray(manifest.receivers));
  assert.ok(Array.isArray(manifest.providers));
  assert.ok(Array.isArray(manifest.metaData));
  assert.deepEqual(manifest.services, []);
  assert.deepEqual(manifest.receivers, []);
  assert.deepEqual(manifest.providers, []);
  assert.deepEqual(manifest.metaData, []);
});
