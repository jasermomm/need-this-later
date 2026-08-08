"use client";

import {
  Archive,
  ArchiveRestore,
  Bell,
  Bookmark,
  Check,
  ChevronLeft,
  Clock3,
  Copy,
  Download,
  File as FileIcon,
  FileImage,
  Inbox,
  Link as LinkIcon,
  LoaderCircle,
  Moon,
  Paperclip,
  Pin,
  Plus,
  Search,
  Settings,
  Sun,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createEncryptedBackup, createPortableExport, readEncryptedBackup, readPortableExport, restoreBackup } from "../packages/backup/src/backup";
import { createItem, inferDraft, itemLabel, normalizeTags, updateItem, type Item } from "../packages/core/src/model";
import { createVault, unlockVault, type VaultHeader } from "../packages/crypto/src/vault";
import {
  getDeviceId,
  listItems,
  openLocalDatabase,
  readAttachment,
  saveAttachment,
  saveItem,
} from "../packages/database/src/indexeddb";
import { groupByDomain, searchItems, type ItemFilter } from "../packages/search/src/search";
import { SupabaseAuthClient, SupabaseSyncTransport, SyncEngine, type SupabaseSession } from "../packages/sync/src/engine";

type View = "capture" | "inbox";
type Theme = "system" | "light" | "dark";

interface ToastState {
  message: string;
  undo?: () => void;
}

const buildEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const configuredSupabaseUrl = buildEnv?.VITE_SUPABASE_URL ?? "";
const configuredSupabaseKey = buildEnv?.VITE_SUPABASE_ANON_KEY ?? "";

function formatRelativeTimestamp(value: string): string {
  const milliseconds = Date.parse(value) - Date.now();
  const absolute = Math.abs(milliseconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (absolute < 60_000) return formatter.format(Math.round(milliseconds / 1_000), "second");
  if (absolute < 3_600_000) return formatter.format(Math.round(milliseconds / 60_000), "minute");
  if (absolute < 86_400_000) return formatter.format(Math.round(milliseconds / 3_600_000), "hour");
  if (absolute < 2_592_000_000) return formatter.format(Math.round(milliseconds / 86_400_000), "day");
  if (absolute < 31_536_000_000) return formatter.format(Math.round(milliseconds / 2_592_000_000), "month");
  return formatter.format(Math.round(milliseconds / 31_536_000_000), "year");
}

function downloadText(filename: string, contents: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function itemIcon(kind: Item["kind"]) {
  if (kind === "link") return <LinkIcon size={17} aria-hidden="true" />;
  if (kind === "image") return <FileImage size={17} aria-hidden="true" />;
  if (kind === "file") return <FileIcon size={17} aria-hidden="true" />;
  return <Bookmark size={17} aria-hidden="true" />;
}

function ImagePreview({ item, database }: { item: Item; database: IDBDatabase }) {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    const attachment = item.attachments.find((entry) => entry.mimeType.startsWith("image/"));
    if (!attachment) return;
    let active = true;
    let objectUrl = "";
    readAttachment(database, attachment).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setSource(objectUrl);
    }).catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [database, item]);
  // Blob URLs are local encrypted attachments and cannot use a remote image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return source ? <img className="item-image" src={source} alt="" /> : null;
}

interface ItemCardProps {
  item: Item;
  database: IDBDatabase;
  onChange: (item: Item) => Promise<void>;
  onDelete: (item: Item) => Promise<void>;
  onEdit: (item: Item) => void;
}

function ItemCard({ item, database, onChange, onDelete, onEdit }: ItemCardProps) {
  const copyItem = async () => navigator.clipboard.writeText(item.url || item.content || itemLabel(item));
  const download = async (attachment: Item["attachments"][number]) => {
    const url = URL.createObjectURL(await readAttachment(database, attachment));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = attachment.name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  return (
    <article className={`item-card ${item.pinned ? "is-pinned" : ""}`}>
      {item.kind === "image" && <ImagePreview item={item} database={database} />}
      <div className="item-card-body">
        <div className="item-meta-row">
          <span className={`type-chip type-${item.kind}`}>{itemIcon(item.kind)} {item.kind}</span>
          {item.pinned && <span className="pinned-label"><Pin size={13} fill="currentColor" /> Pinned</span>}
          <time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString()}>{formatRelativeTimestamp(item.createdAt)}</time>
        </div>
        <button className="item-content-button" onClick={() => onEdit(item)} aria-label={`Edit ${itemLabel(item)}`}>
          <strong>{itemLabel(item)}</strong>
          {item.kind !== "link" && item.content && <span>{item.content}</span>}
          {item.kind === "link" && <span>{item.url}</span>}
          {item.note && <em>{item.note}</em>}
        </button>
        {item.tags.length > 0 && <div className="tag-row">{item.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
        {item.attachments.length > 0 && (
          <div className="attachment-row">
            {item.attachments.map((attachment) => (
              <button key={attachment.id} onClick={() => download(attachment)} title={`Download ${attachment.name}`}>
                <Paperclip size={14} /> {attachment.name} <Download size={13} />
              </button>
            ))}
          </div>
        )}
        {item.reminderAt && <div className="reminder-label"><Bell size={14} /> {new Date(item.reminderAt).toLocaleString()}</div>}
        <div className="item-actions">
          {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-action">Open link</a>}
          <button onClick={copyItem} className="icon-action" aria-label="Copy item" title="Copy"><Copy size={17} /></button>
          {!item.deletedAt && <button onClick={() => onChange(updateItem(item, { pinned: !item.pinned }, item.deviceId))} className="icon-action" aria-label={item.pinned ? "Unpin item" : "Pin item"} title={item.pinned ? "Unpin" : "Pin"}><Pin size={17} fill={item.pinned ? "currentColor" : "none"} /></button>}
          {!item.deletedAt && <button onClick={() => onChange(updateItem(item, { archived: !item.archived }, item.deviceId))} className="icon-action" aria-label={item.archived ? "Restore from archive" : "Archive item"} title={item.archived ? "Restore" : "Archive"}>{item.archived ? <ArchiveRestore size={17} /> : <Archive size={17} />}</button>}
          {item.deletedAt ? (
            <button onClick={() => onChange(updateItem(item, { deletedAt: null }, item.deviceId))} className="text-action">Restore</button>
          ) : (
            <button onClick={() => onDelete(item)} className="icon-action danger" aria-label="Move item to trash" title="Move to trash"><Trash2 size={17} /></button>
          )}
        </div>
      </div>
    </article>
  );
}

function EditDialog({ item, onClose, onSave }: { item: Item; onClose: () => void; onSave: (patch: Partial<Item>) => Promise<void> }) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(item.title);
  const [content, setContent] = useState(item.content);
  const [note, setNote] = useState(item.note);
  const [tags, setTags] = useState(item.tags.join(", "));
  const [reminderAt, setReminderAt] = useState(item.reminderAt?.slice(0, 16) ?? "");
  useEffect(() => { titleRef.current?.focus(); }, []);
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="edit-title">
        <div className="dialog-header"><div><span className="eyebrow">Saved item</span><h2 id="edit-title">Edit details</h2></div><button className="icon-action" onClick={onClose} aria-label="Close"><X /></button></div>
        <label>Title <input ref={titleRef} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optional title" /></label>
        <label>Content <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={6} /></label>
        <label>Note <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Add a little context" /></label>
        <label>Tags <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="research, apartment" /></label>
        <label>Remind me <input type="datetime-local" value={reminderAt} onChange={(event) => setReminderAt(event.target.value)} /></label>
        <div className="dialog-actions"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" onClick={async () => {
          if (reminderAt && "Notification" in window && Notification.permission === "default") await Notification.requestPermission();
          await onSave({ title, content, note, tags: normalizeTags(tags.split(",")), reminderAt: reminderAt ? new Date(reminderAt).toISOString() : null });
        }}>Save changes</button></div>
      </section>
    </div>
  );
}

function SyncSettings({ database, deviceId, onSynced, notify }: { database: IDBDatabase; deviceId: string; onSynced: () => Promise<void>; notify: (message: string) => void }) {
  const [baseUrl, setBaseUrl] = useState(configuredSupabaseUrl);
  const [anonymousKey, setAnonymousKey] = useState(configuredSupabaseKey);
  const [email, setEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [vaultPassword, setVaultPassword] = useState("");
  const [accountMode, setAccountMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [masterKey, setMasterKey] = useState<Uint8Array | null>(null);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [recoveryStored, setRecoveryStored] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState("Not connected");

  const requestHeaders = (activeSession: SupabaseSession) => ({
    apikey: anonymousKey,
    Authorization: `Bearer ${activeSession.accessToken}`,
    "Content-Type": "application/json",
  });

  const validateEndpoint = () => {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      throw new Error("Sync endpoints must use HTTPS except during local development");
    }
    if (!anonymousKey.trim()) throw new Error("A Supabase anonymous key is required");
  };

  const uploadHeader = async (activeSession: SupabaseSession, header: VaultHeader) => {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/rest/v1/vault_headers?on_conflict=user_id`, {
      method: "POST",
      headers: { ...requestHeaders(activeSession), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: activeSession.userId, header }),
    });
    if (!response.ok) throw new Error(`Could not store the encrypted vault header (${response.status})`);
  };

  const loadHeader = async (activeSession: SupabaseSession): Promise<VaultHeader | null> => {
    const query = new URLSearchParams({ select: "header", user_id: `eq.${activeSession.userId}`, limit: "1" });
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/rest/v1/vault_headers?${query}`, { headers: requestHeaders(activeSession) });
    if (!response.ok) throw new Error(`Could not read the encrypted vault header (${response.status})`);
    const rows = await response.json() as Array<{ header: VaultHeader }>;
    return rows[0]?.header ?? null;
  };

  const runSync = async (activeSession = session, key = masterKey) => {
    if (!activeSession || !key) return;
    setBusy(true);
    setStatus("Synchronizing encrypted changes…");
    try {
      const engine = new SyncEngine(database, new SupabaseSyncTransport(baseUrl, anonymousKey, activeSession.accessToken), key, activeSession.userId, deviceId);
      const result = await engine.synchronize(cursor);
      setCursor(result.cursor);
      await onSynced();
      setStatus(`Up to date · ${result.pushed} sent · ${result.pulled} received${result.conflicts ? ` · ${result.conflicts} conflict copy` : ""}`);
      notify("Encrypted sync complete");
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    setBusy(true);
    try {
      validateEndpoint();
      if (vaultPassword.length < 10) throw new Error("Use at least 10 characters for the separate vault password");
      const auth = new SupabaseAuthClient(baseUrl, anonymousKey);
      const activeSession = accountMode === "signup" ? await auth.signUp(email, accountPassword) : await auth.signIn(email, accountPassword);
      const existingHeader = await loadHeader(activeSession);
      if (existingHeader) {
        const key = await unlockVault(vaultPassword, existingHeader);
        setSession(activeSession);
        setMasterKey(key);
        setStatus("Vault unlocked");
        await runSync(activeSession, key);
      } else {
        const created = await createVault(vaultPassword);
        await uploadHeader(activeSession, created.header);
        setSession(activeSession);
        setMasterKey(created.masterKey);
        setRecoveryKey(created.recoveryKey);
        setStatus("Save and verify your recovery key before the first sync");
      }
      setAccountPassword("");
      setVaultPassword("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not enable sync");
    } finally {
      setBusy(false);
    }
  };

  const copyRecovery = async () => { await navigator.clipboard.writeText(recoveryKey); notify("Recovery key copied"); };
  const downloadRecovery = () => downloadText("need-this-later-recovery-key.txt", `I Need This Later recovery key\n\n${recoveryKey}\n\nStore this offline. Anyone with this key and access to the encrypted vault can decrypt it.`, "text/plain");
  const disconnect = () => { masterKey?.fill(0); setMasterKey(null); setSession(null); setRecoveryKey(""); setRecoveryStored(false); setStatus("Disconnected. Local items remain on this device."); };

  if (session && masterKey) {
    return <div className="sync-panel">
      {recoveryKey ? <>
        <div className="recovery-warning"><strong>Save this recovery key now</strong><p>It is not uploaded in readable form and cannot be regenerated for you.</p><code>{recoveryKey}</code><div className="settings-actions"><button className="button secondary" onClick={copyRecovery}><Copy size={16} /> Copy</button><button className="button secondary" onClick={downloadRecovery}><Download size={16} /> Download</button></div><label className="check-label"><input type="checkbox" checked={recoveryStored} onChange={(event) => setRecoveryStored(event.target.checked)} /> I stored this key somewhere safe</label><button className="button primary" disabled={!recoveryStored || busy} onClick={async () => { setRecoveryKey(""); await runSync(); }}>Finish & sync</button></div>
      </> : <div className="sync-connected"><div><span className="status-dot local" /><strong>Encrypted sync is unlocked</strong><p>{status}</p></div><div className="settings-actions"><button className="button secondary" onClick={() => runSync()} disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />} Sync now</button><button className="button ghost-danger" onClick={disconnect}>Lock & disconnect</button></div></div>}
    </div>;
  }

  return <div className="sync-panel">
    <div className="segmented"><button className={accountMode === "signin" ? "active" : ""} onClick={() => setAccountMode("signin")}>Sign in</button><button className={accountMode === "signup" ? "active" : ""} onClick={() => setAccountMode("signup")}>Create account</button></div>
    <details className="advanced-sync" open={!configuredSupabaseUrl || !configuredSupabaseKey}><summary>Sync server</summary><label>Supabase URL <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://project.supabase.co" /></label><label>Public anonymous key <input value={anonymousKey} onChange={(event) => setAnonymousKey(event.target.value)} type="password" autoComplete="off" /></label></details>
    <div className="sync-fields"><label>Email <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" /></label><label>Account password <input value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} type="password" autoComplete={accountMode === "signup" ? "new-password" : "current-password"} /></label><label>Vault password <input value={vaultPassword} onChange={(event) => setVaultPassword(event.target.value)} type="password" autoComplete="off" /><small>Separate from authentication. It encrypts and unlocks your content on this device.</small></label></div>
    <button className="button primary" onClick={connect} disabled={busy || !email || !accountPassword || !vaultPassword}>{busy ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />} {accountMode === "signup" ? "Create encrypted vault" : "Unlock encrypted vault"}</button>
    <p className="sync-status" role="status">{status}</p>
  </div>;
}

function SettingsDialog({
  database,
  deviceId,
  items,
  theme,
  setTheme,
  onClose,
  onRestored,
  notify,
}: {
  database: IDBDatabase;
  deviceId: string;
  items: Item[];
  theme: Theme;
  setTheme: (theme: Theme) => void;
  onClose: () => void;
  onRestored: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const importInput = useRef<HTMLInputElement>(null);
  const exportPlaintext = async () => {
    if (!window.confirm("This export will contain readable copies of every item and attachment. Store it somewhere private. Continue?")) return;
    downloadText(`need-this-later-${new Date().toISOString().slice(0, 10)}-plaintext.json`, await createPortableExport(database, items));
    notify("Plaintext export downloaded");
  };
  const exportEncrypted = async () => {
    const password = window.prompt("Choose a backup password (at least 10 characters). It cannot be recovered for you.");
    if (!password) return;
    downloadText(`need-this-later-${new Date().toISOString().slice(0, 10)}.ntl-backup`, await createEncryptedBackup(database, items, password));
    notify("Encrypted backup downloaded");
  };
  const importBackup = async (file: File) => {
    const serialized = await file.text();
    const encrypted = serialized.includes('"need-this-later-encrypted-backup"');
    const payload = encrypted
      ? await readEncryptedBackup(serialized, window.prompt("Enter the backup password") ?? "")
      : readPortableExport(serialized);
    if (!window.confirm(`Restore ${payload.items.length} items? This replaces the inbox currently stored on this device.`)) return;
    await restoreBackup(database, payload);
    await onRestored();
    notify("Backup restored");
    onClose();
  };
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="dialog-header"><div><span className="eyebrow">Device preferences</span><h2 id="settings-title">Settings & privacy</h2></div><button className="icon-action" onClick={onClose} aria-label="Close"><X /></button></div>
        <div className="settings-section">
          <h3>Appearance</h3>
          <div className="segmented theme-picker" aria-label="Theme">
            <button className={theme === "system" ? "active" : ""} onClick={() => setTheme("system")}><Clock3 size={15} /> System</button>
            <button className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}><Sun size={15} /> Light</button>
            <button className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}><Moon size={15} /> Dark</button>
          </div>
        </div>
        <div className="settings-section">
          <h3>Local Mode</h3>
          <p>Your items and attachments are encrypted and stored in this browser. Nothing is uploaded in Local Mode.</p>
          <div className="privacy-fact"><span className="status-dot local" /> No account · No analytics · Works offline</div>
        </div>
        <div className="settings-section">
          <div className="section-heading"><div><h3>Encrypted sync</h3><span className="coming-label">Optional</span></div></div>
          <p>Connect your own Supabase deployment using the documented environment settings. Items are encrypted on this device before synchronization; Supabase receives ciphertext and limited routing metadata.</p>
          <SyncSettings database={database} deviceId={deviceId} onSynced={onRestored} notify={notify} />
        </div>
        <div className="settings-section">
          <h3>Backups</h3>
          <div className="settings-actions">
            <button className="button secondary" onClick={exportEncrypted}><Download size={16} /> Encrypted backup</button>
            <button className="button ghost-danger" onClick={exportPlaintext}><Download size={16} /> Plaintext export</button>
            <button className="button secondary" onClick={() => importInput.current?.click()}><Upload size={16} /> Restore</button>
            <input ref={importInput} type="file" accept=".json,.ntl-backup,application/json" hidden onChange={(event) => event.target.files?.[0] && importBackup(event.target.files[0]).catch((error: unknown) => notify(error instanceof Error ? error.message : "Restore failed"))} />
          </div>
        </div>
        <p className="fine-print">Losing an encrypted backup password or a future sync-vault recovery key can make that encrypted data impossible to recover. A compromised operating system or malicious browser extension is outside this app’s protection boundary.</p>
      </section>
    </div>
  );
}

export default function IneedthislaterApp() {
  const [database, setDatabase] = useState<IDBDatabase | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [view, setView] = useState<View>("capture");
  const [composer, setComposer] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [showTags, setShowTags] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ItemFilter>("all");
  const [editing, setEditing] = useState<Item | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    const saved = localStorage.getItem("ntl-theme") as Theme | null;
    return saved && ["system", "light", "dark"].includes(saved) ? saved : "system";
  });
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async (target = database) => {
    if (target) setItems(await listItems(target));
  }, [database]);

  useEffect(() => {
    let active = true;
    openLocalDatabase().then(async (opened) => {
      if (!active) return opened.close();
      setDatabase(opened);
      setDeviceId(await getDeviceId(opened));
      setItems(await listItems(opened));
    }).catch((error: unknown) => setToast({ message: error instanceof Error ? error.message : "Could not open your local inbox" }));
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch((error: unknown) => {
        console.error("Service worker registration failed", error);
      });
    }
    return () => { active = false; window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline); };
  }, []);

  useEffect(() => {
    type NativeShare = { title?: string; text?: string; uris?: string[] };
    type SharePlugin = { getPending: () => Promise<NativeShare>; addListener: (name: string, callback: (share: NativeShare) => void) => Promise<{ remove: () => Promise<void> }> };
    const plugin = (globalThis as typeof globalThis & { Capacitor?: { Plugins?: { ShareIntent?: SharePlugin } } }).Capacitor?.Plugins?.ShareIntent;
    if (!plugin) return;
    let listener: { remove: () => Promise<void> } | undefined;
    const receive = (share: NativeShare) => {
      const content = [share.title, share.text, ...(share.uris ?? [])].filter(Boolean).join("\n");
      if (!content) return;
      setComposer(content);
      setView("capture");
      requestAnimationFrame(() => composerRef.current?.focus());
    };
    plugin.getPending().then(receive).catch(() => undefined);
    plugin.addListener("shareReceived", receive).then((registered) => { listener = registered; }).catch(() => undefined);
    return () => { listener?.remove().catch(() => undefined); };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("ntl-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (view === "capture") requestAnimationFrame(() => composerRef.current?.focus());
  }, [view]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setEditing(null); setSettingsOpen(false); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") { event.preventDefault(); setView("inbox"); requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#inbox-search")?.focus()); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.undo ? 7_000 : 3_000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!("Notification" in window)) return;
    let delivered: Set<string>;
    try {
      delivered = new Set<string>(JSON.parse(localStorage.getItem("ntl-delivered-reminders") ?? "[]"));
    } catch {
      delivered = new Set<string>();
    }
    const timers: number[] = [];
    let cancelled = false;
    const showReminder = async (item: Item, key: string) => {
      if (cancelled || Notification.permission !== "granted" || delivered.has(key)) return;
      const options: NotificationOptions = { body: itemLabel(item), tag: key, data: { itemId: item.id }, icon: "./icons/icon-192.png" };
      try {
        if ("serviceWorker" in navigator) {
          const registration = await navigator.serviceWorker.ready;
          await registration.showNotification("I Need This Later", options);
        } else {
          new Notification("I Need This Later", options);
        }
        delivered.add(key);
        localStorage.setItem("ntl-delivered-reminders", JSON.stringify([...delivered]));
      } catch {
        // Notification delivery is best-effort; the reminder remains visible on the item.
      }
    };
    const schedule = (item: Item, key: string) => {
      const remaining = Date.parse(item.reminderAt ?? "") - Date.now();
      if (remaining <= 0) {
        void showReminder(item, key);
        return;
      }
      const timer = window.setTimeout(() => schedule(item, key), Math.min(remaining, 2_147_000_000));
      timers.push(timer);
    };
    for (const item of items) {
      if (!item.reminderAt || item.deletedAt || delivered.has(`${item.id}:${item.reminderAt}`)) continue;
      schedule(item, `${item.id}:${item.reminderAt}`);
    }
    return () => { cancelled = true; timers.forEach((timer) => clearTimeout(timer)); };
  }, [items]);

  const notify = (message: string) => setToast({ message });

  const persist = async (item: Item) => {
    if (!database) return;
    await saveItem(database, item);
    setItems((current) => current.map((entry) => entry.id === item.id ? item : entry));
  };

  const saveCapture = async () => {
    if (!database || !deviceId || saving || (!composer.trim() && !pendingFiles.length)) return;
    setSaving(true);
    try {
      const attachments = await Promise.all(pendingFiles.map((file) => saveAttachment(database, file)));
      const inferred = inferDraft(composer || pendingFiles[0]?.name || "Attachment");
      const kind = attachments.length ? (attachments.every((attachment) => attachment.mimeType.startsWith("image/")) ? "image" : "file") : inferred.kind;
      const item = createItem({ ...inferred, kind, tags: normalizeTags(tagInput.split(",")), attachments }, deviceId);
      await saveItem(database, item);
      setItems((current) => [item, ...current]);
      setComposer("");
      setTagInput("");
      setShowTags(false);
      setPendingFiles([]);
      setToast({ message: "Saved to your inbox" });
      requestAnimationFrame(() => composerRef.current?.focus());
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not save this item");
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (item: Item) => {
    if (!database) return;
    const deleted = updateItem(item, { deletedAt: new Date().toISOString() }, deviceId);
    await persist(deleted);
    setToast({ message: "Moved to trash", undo: () => persist(updateItem(deleted, { deletedAt: null }, deviceId)) });
  };

  const addFiles = (files: FileList | File[]) => {
    setPendingFiles((current) => [...current, ...Array.from(files)].slice(0, 20));
  };

  const filteredItems = useMemo(() => searchItems(items, search, filter), [items, search, filter]);
  const domainGroups = useMemo(() => groupByDomain(items), [items]);
  const activeCount = items.filter((item) => !item.deletedAt && !item.archived).length;
  const detectedLink = composer.trim() ? inferDraft(composer).kind === "link" : false;

  return (
    <main className={`app-shell view-${view}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => event.currentTarget === event.target && setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}>
      <header className="topbar">
        <button className="brand" onClick={() => setView("capture")} aria-label="Go to quick capture"><span className="brand-mark"><Bookmark size={20} fill="currentColor" /></span><span>I Need This Later</span></button>
        <div className="topbar-actions">
          <span className="mode-pill"><span className={`status-dot ${online ? "local" : "offline"}`} /> {online ? "Local Mode" : "Offline"}</span>
          <button className="icon-action" onClick={() => setSettingsOpen(true)} aria-label="Open settings"><Settings size={19} /></button>
        </div>
      </header>

      {view === "capture" ? (
        <section className="capture-view" aria-labelledby="capture-heading">
          <div className="capture-copy"><span className="eyebrow">Your private drop zone</span><h1 id="capture-heading">What do you need later?</h1><p>Type it, paste it, or drop it here. No filing required.</p></div>
          <div className={`composer-card ${dragging ? "is-dragging" : ""}`}>
            {dragging && <div className="drop-overlay"><Upload size={28} /><strong>Drop to attach</strong></div>}
            <textarea
              ref={composerRef}
              value={composer}
              onChange={(event) => setComposer(event.target.value)}
              onPaste={(event) => { const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); addFiles(files); } }}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); saveCapture(); } }}
              placeholder="Type, paste, or drop something…"
              aria-label="What do you need later?"
              rows={5}
            />
            {detectedLink && <div className="detected"><LinkIcon size={14} /> Link detected</div>}
            {pendingFiles.length > 0 && <div className="pending-files">{pendingFiles.map((file, index) => <span key={`${file.name}-${index}`}><Paperclip size={13} /> {file.name}<button onClick={() => setPendingFiles((files) => files.filter((_, fileIndex) => fileIndex !== index))} aria-label={`Remove ${file.name}`}><X size={13} /></button></span>)}</div>}
            {showTags && <div className="tag-composer"><label htmlFor="capture-tags">Optional tags</label><input id="capture-tags" value={tagInput} onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveCapture(); } }} placeholder="research, apartment" /></div>}
            <div className="composer-footer">
              <div className="capture-tools">
                <button onClick={() => fileInput.current?.click()}><Paperclip size={17} /> File</button>
                <button onClick={() => imageInput.current?.click()}><FileImage size={17} /> Image</button>
                <button onClick={() => setShowTags((visible) => !visible)} className={showTags ? "active" : ""}><Plus size={17} /> Tags</button>
                <input ref={fileInput} hidden type="file" multiple onChange={(event) => event.target.files && addFiles(event.target.files)} />
                <input ref={imageInput} hidden type="file" accept="image/*" multiple onChange={(event) => event.target.files && addFiles(event.target.files)} />
              </div>
              <button className="save-button" onClick={saveCapture} disabled={!database || saving || (!composer.trim() && !pendingFiles.length)}>{saving ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />} Save <kbd>Enter</kbd></button>
            </div>
          </div>
          <button className="inbox-launch" onClick={() => setView("inbox")}><span><Inbox size={20} /><strong>Open inbox</strong><small>{activeCount === 0 ? "Nothing saved yet" : `${activeCount} ${activeCount === 1 ? "item" : "items"}, newest first`}</small></span><span aria-hidden="true">→</span></button>
          <p className="local-note"><span className="status-dot local" /> Stored on this device. <button onClick={() => setSettingsOpen(true)}>Privacy details</button></p>
        </section>
      ) : (
        <section className="inbox-view" aria-labelledby="inbox-heading">
          <div className="inbox-heading-row"><div><button className="back-button" onClick={() => setView("capture")}><ChevronLeft size={18} /> Quick capture</button><h1 id="inbox-heading">Inbox</h1><p>{activeCount} saved {activeCount === 1 ? "item" : "items"}</p></div><button className="button primary compact" onClick={() => setView("capture")}><Plus size={17} /> Capture</button></div>
          <div className="search-box"><Search size={19} /><input id="inbox-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search everything…" aria-label="Search your inbox" /><kbd>Ctrl K</kbd>{search && <button onClick={() => setSearch("")} aria-label="Clear search"><X size={16} /></button>}</div>
          <nav className="filter-row" aria-label="Inbox filters">
            {(["all", "note", "link", "image", "file", "pinned", "archived", "trash"] as ItemFilter[]).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "All" : value[0].toUpperCase() + value.slice(1)}</button>)}
          </nav>
          {!search && filter === "all" && domainGroups[0] && <button className="resurface-card" onClick={() => setSearch(domainGroups[0].domain)}><Clock3 size={18} /><span><strong>{domainGroups[0].count} things from {domainGroups[0].domain}</strong><small>Bring a recent trail back into view</small></span><span>View →</span></button>}
          <div className="item-list">
            {filteredItems.map((item) => <ItemCard key={`${item.id}:${item.revision}`} item={item} database={database!} onChange={persist} onDelete={deleteItem} onEdit={setEditing} />)}
            {database && filteredItems.length === 0 && <div className="empty-state"><span className="empty-icon">{search ? <Search /> : <Inbox />}</span><h2>{search ? "Nothing matches that search" : filter === "all" ? "Your inbox is ready" : `No ${filter} items`}</h2><p>{search ? "Try fewer words or a different filter." : "Capture something now. You can organize it later—if you ever need to."}</p>{!search && <button className="button primary" onClick={() => setView("capture")}><Plus size={17} /> Capture something</button>}</div>}
          </div>
        </section>
      )}

      {editing && <EditDialog item={editing} onClose={() => setEditing(null)} onSave={async (patch) => { await persist(updateItem(editing, patch, deviceId)); setEditing(null); notify("Changes saved"); }} />}
      {settingsOpen && database && <SettingsDialog database={database} deviceId={deviceId} items={items} theme={theme} setTheme={setThemeState} onClose={() => setSettingsOpen(false)} onRestored={() => refresh(database)} notify={notify} />}
      {toast && <div className="toast" role="status"><Check size={17} /><span>{toast.message}</span>{toast.undo && <button onClick={() => { toast.undo?.(); setToast(null); }}><Undo2 size={15} /> Undo</button>}</div>}
    </main>
  );
}
