import { captureCount, captureId, saveCapture, type ExtensionCapture } from "./storage";
import { extensionSyncStatus, syncCaptureIfUnlocked, unlockExtensionSync } from "./sync";
import "./popup.css";

const api: typeof chrome = (globalThis as typeof globalThis & { browser?: typeof chrome }).browser ?? chrome;
const root = document.querySelector<HTMLElement>("#app")!;

root.innerHTML = `
  <header><span class="mark">◆</span><div><strong>I Need This Later</strong><small id="scope">Extension-local inbox</small></div></header>
  <section class="context"><span>Current page</span><strong id="page-title">Loading…</strong><small id="page-url"></small></section>
  <label for="note">Add a note</label><textarea id="note" autofocus placeholder="What should you remember?"></textarea>
  <label for="tags">Tags <em>optional</em></label><input id="tags" placeholder="research, reading" />
  <div class="actions"><button id="selection" class="secondary">Save selection</button><button id="page" class="primary">Save page</button></div>
  <details class="sync"><summary><span id="sync-dot">○</span> Encrypted sync</summary><input id="sync-url" placeholder="Supabase URL" /><input id="sync-key" type="password" placeholder="Public anonymous key" /><input id="sync-email" type="email" placeholder="Email" /><input id="sync-account-password" type="password" placeholder="Account password" /><input id="sync-vault-password" type="password" placeholder="Vault password" /><button id="unlock-sync" class="secondary">Unlock for this browser session</button><small id="sync-status">Create the vault in the web app first. Keys are kept in session memory.</small></details>
  <footer><span><b id="count">0</b> saved here</span><button id="open">Open web inbox →</button></footer>
  <div id="toast" role="status" hidden>Saved</div>`;

const [tab] = await api.tabs.query({ active: true, currentWindow: true });
const title = tab?.title ?? "Untitled page";
const url = tab?.url?.startsWith("http") ? tab.url : "";
document.querySelector("#page-title")!.textContent = title;
document.querySelector("#page-url")!.textContent = url ? new URL(url).hostname : "This page cannot be captured";

async function updateCount() { document.querySelector("#count")!.textContent = String(await captureCount()); }
await updateCount();
const savedSync = await api.storage.local.get(["syncBaseUrl", "syncAnonymousKey"]);
document.querySelector<HTMLInputElement>("#sync-url")!.value = String(savedSync.syncBaseUrl || "");
document.querySelector<HTMLInputElement>("#sync-key")!.value = String(savedSync.syncAnonymousKey || "");
if (await extensionSyncStatus()) { document.querySelector("#sync-dot")!.textContent = "●"; document.querySelector("#sync-status")!.textContent = "Unlocked. New captures sync as ciphertext."; }

async function selection(): Promise<string> {
  if (!tab?.id) return "";
  const result = await api.scripting.executeScript({ target: { tabId: tab.id }, func: () => getSelection()?.toString() ?? "" });
  return result[0]?.result ?? "";
}

async function capture(kind: ExtensionCapture["kind"]) {
  const note = (document.querySelector<HTMLTextAreaElement>("#note")!.value).trim();
  const selected = kind === "selection" ? await selection() : "";
  if (kind === "selection" && !selected) { showToast("Select some text first"); return; }
  const saved: ExtensionCapture = { id: captureId(), kind, title, content: [selected || url, note].filter(Boolean).join("\n\n"), url, tags: document.querySelector<HTMLInputElement>("#tags")!.value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean), createdAt: new Date().toISOString() };
  await saveCapture(saved);
  const synced = await syncCaptureIfUnlocked(saved).catch(() => false);
  document.querySelector<HTMLTextAreaElement>("#note")!.value = "";
  await updateCount();
  showToast(`${kind === "selection" ? "Selection" : "Page"} saved${synced ? " & synced" : ""}`);
}

function showToast(message: string) {
  const toast = document.querySelector<HTMLElement>("#toast")!;
  toast.textContent = message; toast.hidden = false;
  setTimeout(() => { toast.hidden = true; }, 1_700);
}

document.querySelector("#page")!.addEventListener("click", () => capture("page"));
document.querySelector("#selection")!.addEventListener("click", () => capture("selection"));
document.querySelector("#open")!.addEventListener("click", () => api.tabs.create({ url: "https://jasermomm.github.io/need-this-later/" }));
document.querySelector("#unlock-sync")!.addEventListener("click", async () => {
  const status = document.querySelector("#sync-status")!;
  status.textContent = "Unlocking…";
  try {
    await unlockExtensionSync(
      document.querySelector<HTMLInputElement>("#sync-url")!.value,
      document.querySelector<HTMLInputElement>("#sync-key")!.value,
      document.querySelector<HTMLInputElement>("#sync-email")!.value,
      document.querySelector<HTMLInputElement>("#sync-account-password")!.value,
      document.querySelector<HTMLInputElement>("#sync-vault-password")!.value,
    );
    document.querySelector("#sync-dot")!.textContent = "●";
    status.textContent = "Unlocked. New captures sync as ciphertext.";
    document.querySelector<HTMLInputElement>("#sync-account-password")!.value = "";
    document.querySelector<HTMLInputElement>("#sync-vault-password")!.value = "";
  } catch (error) { status.textContent = error instanceof Error ? error.message : "Could not unlock sync"; }
});
document.querySelector("#note")!.addEventListener("keydown", (event) => { const keyEvent = event as KeyboardEvent; if (keyEvent.key === "Enter" && !keyEvent.shiftKey) { keyEvent.preventDefault(); capture("page"); } });
