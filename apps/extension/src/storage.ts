export interface ExtensionCapture {
  id: string;
  kind: "page" | "selection" | "link" | "image" | "note";
  title: string;
  content: string;
  url?: string;
  tags: string[];
  createdAt: string;
}

interface StoredCapture { id: string; iv: string; ciphertext: string; createdAt: string }

const api: typeof chrome = (globalThis as typeof globalThis & { browser?: typeof chrome }).browser ?? chrome;
const encoder = new TextEncoder();

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function storageGet<T>(key: string): Promise<T | undefined> {
  return (await api.storage.local.get(key))[key] as T | undefined;
}

async function deviceKey(): Promise<CryptoKey> {
  let encoded = await storageGet<string>("deviceKey");
  if (!encoded) {
    encoded = encode(crypto.getRandomValues(new Uint8Array(32)));
    await api.storage.local.set({ deviceKey: encoded });
  }
  return crypto.subtle.importKey("raw", Uint8Array.from(decode(encoded)), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function saveCapture(capture: ExtensionCapture): Promise<void> {
  const key = await deviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: Uint8Array.from(encoder.encode(`extension-capture:${capture.id}`)) }, key, Uint8Array.from(encoder.encode(JSON.stringify(capture))));
  const captures = await storageGet<StoredCapture[]>("captures") ?? [];
  captures.unshift({ id: capture.id, iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)), createdAt: capture.createdAt });
  await api.storage.local.set({ captures: captures.slice(0, 2_000) });
}

export async function captureCount(): Promise<number> {
  return (await storageGet<StoredCapture[]>("captures") ?? []).length;
}

export function captureId(): string {
  return crypto.randomUUID();
}
