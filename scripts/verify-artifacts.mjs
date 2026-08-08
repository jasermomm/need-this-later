import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const expectedVersion = "1.0.0";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

async function exists(path) {
  try {
    await access(resolve(root, path));
    return true;
  } catch {
    return false;
  }
}

async function listFiles(directory, prefix = "") {
  const entries = await readdir(resolve(root, directory, prefix), { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? listFiles(directory, relative) : [relative];
  }));
  return files.flat();
}

const packageJson = await readJson("package.json");
const desktopPackage = await readJson("apps/desktop/package.json");
const mobilePackage = await readJson("apps/mobile/package.json");
const extensionPackage = await readJson("apps/extension/package.json");
const extensionManifest = await readJson("dist-extension/manifest.json");
const tauriConfig = await readJson("apps/desktop/src-tauri/tauri.conf.json");

for (const [name, version] of Object.entries({
  root: packageJson.version,
  desktop: desktopPackage.version,
  mobile: mobilePackage.version,
  extensionPackage: extensionPackage.version,
  extensionManifest: extensionManifest.version,
  tauri: tauriConfig.version,
})) {
  assert(version === expectedVersion, `${name} version is ${version}, expected ${expectedVersion}`);
}

const androidGradle = await readFile(resolve(root, "apps/mobile/android/app/build.gradle"), "utf8");
assert(androidGradle.includes(`versionName "${expectedVersion}"`), "Android versionName is inconsistent");
const iosProject = await readFile(resolve(root, "apps/mobile/ios/App/App.xcodeproj/project.pbxproj"), "utf8");
assert((iosProject.match(/MARKETING_VERSION = 1\.0\.0;/g) ?? []).length === 2, "iOS marketing version is inconsistent");

const extensionReferences = [
  extensionManifest.background.service_worker,
  extensionManifest.action.default_popup,
  ...Object.values(extensionManifest.icons),
  ...Object.values(extensionManifest.action.default_icon),
];
for (const reference of new Set(extensionReferences)) {
  assert(await exists(`dist-extension/${reference}`), `Extension manifest reference is missing: ${reference}`);
}

const serviceWorker = await readFile(resolve(root, "dist-pages/sw.js"), "utf8");
const shellMatch = serviceWorker.match(/const APP_SHELL = (\[[^;]+\]);/);
assert(shellMatch, "Generated service-worker precache list is missing");
const applicationShell = new Set(JSON.parse(shellMatch[1]));
const pwaFiles = await listFiles("dist-pages");
for (const file of pwaFiles) {
  if (file === "index.html" || file === "sw.js" || file.endsWith(".map")) continue;
  assert(applicationShell.has(`./${file}`), `PWA resource is not precached: ${file}`);
}
assert(applicationShell.has("./"), "PWA navigation shell is not precached");
assert(serviceWorker.includes("ignoreVary: true"), "Service-worker cache matching is not safe for Vary responses");

console.log(`Verified v${expectedVersion} PWA, extension, desktop, Android, and iOS artifact metadata.`);
