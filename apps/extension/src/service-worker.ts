import { captureId, saveCapture, type ExtensionCapture } from "./storage";
import { syncCaptureIfUnlocked } from "./sync";

const api: typeof chrome = (globalThis as typeof globalThis & { browser?: typeof chrome }).browser ?? chrome;

api.runtime.onInstalled.addListener(() => {
  api.contextMenus.removeAll(() => {
    api.contextMenus.create({ id: "save-page", title: "Save page to I Need This Later", contexts: ["page"] });
    api.contextMenus.create({ id: "save-selection", title: "Save selected text", contexts: ["selection"] });
    api.contextMenus.create({ id: "save-link", title: "Save this link", contexts: ["link"] });
    api.contextMenus.create({ id: "save-image", title: "Save this image", contexts: ["image"] });
  });
});

api.contextMenus.onClicked.addListener(async (info, tab) => {
  const kind = ({ "save-page": "page", "save-selection": "selection", "save-link": "link", "save-image": "image" } as const)[String(info.menuItemId)];
  if (!kind) return;
  const content = kind === "selection" ? info.selectionText ?? "" : kind === "link" ? info.linkUrl ?? "" : kind === "image" ? info.srcUrl ?? "" : tab?.url ?? "";
  const capture: ExtensionCapture = { id: captureId(), kind, title: tab?.title ?? "", content, url: kind === "selection" ? tab?.url : content, tags: [], createdAt: new Date().toISOString() };
  await saveCapture(capture);
  await syncCaptureIfUnlocked(capture).catch(() => undefined);
  await api.action.setBadgeText({ text: "✓", tabId: tab?.id });
  await api.action.setBadgeBackgroundColor({ color: "#245b55", tabId: tab?.id });
  setTimeout(() => api.action.setBadgeText({ text: "", tabId: tab?.id }), 1_500);
});

api.commands.onCommand.addListener(async (command) => {
  if (command === "quick-capture") await api.action.openPopup();
});
