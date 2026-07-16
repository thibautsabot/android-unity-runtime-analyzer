import { type AXmlElement, parseAxml } from "android-axml-parser";
import {
  attrMap,
  firstTagAttributes,
  normalizeComponentName,
  readXmlAttribute,
  toBool,
  toNum,
  toNumOrStr,
  uniqueSorted,
} from "../utils.js";
import type { ManifestActivity, ManifestInfo } from "./types.js";

// ── Entry point ───────────────────────────────────────────────────────────────

export function parseAndroidManifest(buffer: Buffer): ManifestInfo {
  // Some APKs (e.g. already processed by apktool) contain a plain-text manifest.
  // Detect this by checking if the first non-whitespace character is "<".
  const firstNonWhitespace = buffer.toString("utf8", 0, Math.min(buffer.length, 64)).trimStart()[0];
  if (firstNonWhitespace === "<") {
    return parsePlainXmlManifest(buffer.toString("utf8"));
  }
  return parseBinaryXmlManifest(buffer);
}

// ── Binary manifest extractor ─────────────────────────────────────────────────

function parseBinaryXmlManifest(buffer: Buffer): ManifestInfo {
  const doc = parseAxml(buffer);
  const result: ManifestInfo = {
    permissions: [],
    activities: [],
    services: [],
    receivers: [],
    providers: [],
    metaData: [],
    rawStrings: doc.strings,
  };

  if (!doc.root) {
    return result;
  }

  extractManifestInfo(doc.root, result);
  result.permissions = uniqueSorted(result.permissions);
  result.activities.sort((left, right) => left.name.localeCompare(right.name));
  return result;
}

function extractComponentName(
  attrs: Map<string, string | undefined>,
  packageName: string | undefined,
): string | null {
  const name = normalizeComponentName(packageName, attrs.get("name") ?? "");
  return name || null;
}

function extractManifestInfo(manifest: AXmlElement, result: ManifestInfo): void {
  const attrs = attrMap(manifest);
  result.packageName = attrs.get("package");
  result.splitName = attrs.get("split");
  result.versionCode = toNum(attrs.get("versionCode"));
  result.versionName = attrs.get("versionName");

  for (const child of manifest.children) {
    switch (child.name) {
      case "uses-sdk": {
        const a = attrMap(child);
        result.minSdk = toNumOrStr(a.get("minSdkVersion"));
        result.targetSdk = toNumOrStr(a.get("targetSdkVersion"));
        break;
      }
      case "uses-permission":
      case "uses-permission-sdk-23": {
        const permission = attrMap(child).get("name");
        if (permission) result.permissions.push(permission);
        break;
      }
      case "application":
        extractApplicationInfo(child, result);
        break;
    }
  }
}

function extractApplicationInfo(application: AXmlElement, result: ManifestInfo): void {
  const attrs = attrMap(application);
  result.debuggable = toBool(attrs.get("debuggable"));
  result.allowBackup = toBool(attrs.get("allowBackup"));
  result.usesCleartextTraffic = toBool(attrs.get("usesCleartextTraffic"));
  result.networkSecurityConfig = attrs.get("networkSecurityConfig");

  for (const child of application.children) {
    const childAttrs = attrMap(child);
    switch (child.name) {
      case "activity":
      case "activity-alias": {
        const activity = extractActivity(child, result.packageName);
        if (activity) result.activities.push(activity);
        break;
      }
      case "service":
      case "receiver": {
        const name = extractComponentName(childAttrs, result.packageName);
        if (!name) break;
        const component = {
          name,
          exported: toBool(childAttrs.get("exported")),
          permission: childAttrs.get("permission"),
        };
        if (child.name === "service") result.services.push(component);
        else result.receivers.push(component);
        break;
      }
      case "provider": {
        const name = extractComponentName(childAttrs, result.packageName);
        if (!name) break;
        result.providers.push({
          name,
          exported: toBool(childAttrs.get("exported")),
          permission: childAttrs.get("permission"),
          authorities: childAttrs.get("authorities"),
          readPermission: childAttrs.get("readPermission"),
          writePermission: childAttrs.get("writePermission"),
        });
        break;
      }
      case "meta-data": {
        const name = childAttrs.get("name");
        if (name) {
          result.metaData.push({ name, value: childAttrs.get("value") });
        }
        break;
      }
    }
  }
}

function extractActivity(
  element: AXmlElement,
  packageName: string | undefined,
): ManifestActivity | null {
  const attrs = attrMap(element);
  const name = normalizeComponentName(packageName, attrs.get("name") ?? "");
  if (!name) return null;

  let hasMainAction = false;
  let hasLauncherCategory = false;

  for (const child of element.children) {
    if (child.name !== "intent-filter") continue;
    for (const filterChild of child.children) {
      const filterAttrs = attrMap(filterChild);
      if (
        filterChild.name === "action" &&
        filterAttrs.get("name") === "android.intent.action.MAIN"
      ) {
        hasMainAction = true;
      }
      if (
        filterChild.name === "category" &&
        filterAttrs.get("name") === "android.intent.category.LAUNCHER"
      ) {
        hasLauncherCategory = true;
      }
    }
  }

  const activity: ManifestActivity = {
    name,
    launcher: hasMainAction && hasLauncherCategory,
  };
  const exported = toBool(attrs.get("exported"));
  if (exported !== undefined) activity.exported = exported;
  const permission = attrs.get("permission");
  if (permission) activity.permission = permission;
  return activity;
}

// ── Plain-text XML fallback ───────────────────────────────────────────────────
// Some APKs (e.g. rebuilt by apktool) contain a human-readable manifest.
// We handle these with simple regex matching — no full XML parser needed
// since we only care about a handful of well-known elements and attributes.

function parsePlainXmlManifest(xml: string): ManifestInfo {
  const result: ManifestInfo = {
    permissions: [],
    activities: [],
    services: [],
    receivers: [],
    providers: [],
    metaData: [],
    // Extract every identifier-like token for the detectors' string search.
    rawStrings: [...xml.matchAll(/[A-Za-z_][\w.$:/-]+/g)].map((match) => match[0]),
  };

  const manifestAttributes = firstTagAttributes(xml, "manifest");
  result.packageName = readXmlAttribute(manifestAttributes, "package");
  result.splitName = readXmlAttribute(manifestAttributes, "split");
  result.versionCode = toNum(readXmlAttribute(manifestAttributes, "versionCode"));
  result.versionName = readXmlAttribute(manifestAttributes, "versionName");

  const sdkAttributes = firstTagAttributes(xml, "uses-sdk");
  result.minSdk = toNumOrStr(readXmlAttribute(sdkAttributes, "minSdkVersion"));
  result.targetSdk = toNumOrStr(readXmlAttribute(sdkAttributes, "targetSdkVersion"));

  const appAttributes = firstTagAttributes(xml, "application");
  result.debuggable = toBool(readXmlAttribute(appAttributes, "debuggable"));
  result.allowBackup = toBool(readXmlAttribute(appAttributes, "allowBackup"));
  result.usesCleartextTraffic = toBool(readXmlAttribute(appAttributes, "usesCleartextTraffic"));
  result.networkSecurityConfig = readXmlAttribute(appAttributes, "networkSecurityConfig");

  for (const match of xml.matchAll(/<uses-permission(?:-sdk-23)?\b([^>]*)\/?\s*>/g)) {
    const permission = readXmlAttribute(match[1] ?? "", "name");
    if (permission) result.permissions.push(permission);
  }

  for (const match of xml.matchAll(
    /<activity(?:-alias)?\b([^>]*)>([\s\S]*?)<\/activity(?:-alias)?\s*>|<activity(?:-alias)?\b([^>]*)\/>/g,
  )) {
    const attrs = match[1] ?? match[3] ?? "";
    const body = match[2] ?? "";
    const name = normalizeComponentName(result.packageName, readXmlAttribute(attrs, "name") ?? "");
    if (!name) continue;
    const launcher =
      body.includes("android.intent.action.MAIN") &&
      body.includes("android.intent.category.LAUNCHER");
    const activity: ManifestActivity = { name, launcher };
    const exported = toBool(readXmlAttribute(attrs, "exported"));
    if (exported !== undefined) activity.exported = exported;
    result.activities.push(activity);
  }

  for (const match of xml.matchAll(
    /<service\b([^>]*)\/?>|<service\b([^>]*)>[\s\S]*?<\/service\s*>/g,
  )) {
    const attrs = match[1] ?? match[2] ?? "";
    const name = normalizeComponentName(result.packageName, readXmlAttribute(attrs, "name") ?? "");
    if (!name) continue;
    result.services.push({
      name,
      exported: toBool(readXmlAttribute(attrs, "exported")),
      permission: readXmlAttribute(attrs, "permission"),
    });
  }

  for (const match of xml.matchAll(
    /<receiver\b([^>]*)\/?>|<receiver\b([^>]*)>[\s\S]*?<\/receiver\s*>/g,
  )) {
    const attrs = match[1] ?? match[2] ?? "";
    const name = normalizeComponentName(result.packageName, readXmlAttribute(attrs, "name") ?? "");
    if (!name) continue;
    result.receivers.push({
      name,
      exported: toBool(readXmlAttribute(attrs, "exported")),
      permission: readXmlAttribute(attrs, "permission"),
    });
  }

  for (const match of xml.matchAll(
    /<provider\b([^>]*)\/?>|<provider\b([^>]*)>[\s\S]*?<\/provider\s*>/g,
  )) {
    const attrs = match[1] ?? match[2] ?? "";
    const name = normalizeComponentName(result.packageName, readXmlAttribute(attrs, "name") ?? "");
    if (!name) continue;
    result.providers.push({
      name,
      exported: toBool(readXmlAttribute(attrs, "exported")),
      permission: readXmlAttribute(attrs, "permission"),
      authorities: readXmlAttribute(attrs, "authorities"),
      readPermission: readXmlAttribute(attrs, "readPermission"),
      writePermission: readXmlAttribute(attrs, "writePermission"),
    });
  }

  for (const match of xml.matchAll(/<meta-data\b([^>]*)\/>/g)) {
    const attrs = match[1] ?? "";
    const name = readXmlAttribute(attrs, "name");
    if (name) {
      result.metaData.push({ name, value: readXmlAttribute(attrs, "value") });
    }
  }

  result.permissions = uniqueSorted(result.permissions);
  result.activities.sort((left, right) => left.name.localeCompare(right.name));
  return result;
}
