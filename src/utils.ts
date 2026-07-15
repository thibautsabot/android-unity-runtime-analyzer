import type { AXmlElement } from "android-axml-parser";

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function attrMap(element: AXmlElement): Map<string, string | undefined> {
  return new Map(element.attributes.map((a) => [a.name, a.value]));
}

export function toNum(v: string | undefined): number | undefined {
  const n = Number(v);
  return v !== undefined && Number.isFinite(n) ? n : undefined;
}

export function toNumOrStr(v: string | undefined): number | string | undefined {
  return toNum(v) ?? v;
}

export function toBool(v: string | undefined): boolean | undefined {
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return undefined;
}

export function normalizeComponentName(
  packageName: string | undefined,
  name: string,
): string {
  if (!name) return "";
  if (name.startsWith(".") && packageName) return `${packageName}${name}`;
  if (!name.includes(".") && packageName) return `${packageName}.${name}`;
  return name;
}

const firstTagAttributesCache = new Map<string, RegExp>();
export function firstTagAttributes(xml: string, tagName: string): string {
  let re = firstTagAttributesCache.get(tagName);
  if (!re) {
    re = new RegExp(`<${tagName}\\b([^>]*)>`, "i");
    firstTagAttributesCache.set(tagName, re);
  }
  return re.exec(xml)?.[1] ?? "";
}

const xmlAttributeCache = new Map<string, RegExp>();
export function readXmlAttribute(
  attributes: string,
  name: string,
): string | undefined {
  let re = xmlAttributeCache.get(name);
  if (!re) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(`(?:android:)?${escaped}\\s*=\\s*["']([^"']*)["']`, "i");
    xmlAttributeCache.set(name, re);
  }
  return re.exec(attributes)?.[1];
}
