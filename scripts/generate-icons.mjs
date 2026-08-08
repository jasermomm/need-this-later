import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fullIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="240" fill="#245b55"/><path d="M326 220h372c31 0 56 25 56 56v526L512 656 270 802V276c0-31 25-56 56-56Z" fill="#fffefa"/><circle cx="512" cy="420" r="64" fill="#245b55"/></svg>`;
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><path d="M348 246h328c26 0 48 22 48 48v464L512 630 300 758V294c0-26 22-48 48-48Z" fill="#fffefa"/><circle cx="512" cy="424" r="56" fill="#245b55"/></svg>`;

async function write(path, size, source = fullIcon) {
  await mkdir(dirname(path), { recursive: true });
  await sharp(Buffer.from(source)).resize(size, size).png().toFile(path);
}

await write(join(root, "public", "icon-192.png"), 192);
await write(join(root, "public", "icon-512.png"), 512);
for (const size of [16, 32, 48, 128]) await write(join(root, "apps", "extension", "public", `icon-${size}.png`), size);

const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [density, size] of Object.entries(densities)) {
  const directory = join(root, "apps", "mobile", "android", "app", "src", "main", "res", `mipmap-${density}`);
  await write(join(directory, "ic_launcher.png"), size);
  await write(join(directory, "ic_launcher_round.png"), size);
  await write(join(directory, "ic_launcher_foreground.png"), Math.round(size * 2.25), foreground);
}

await write(join(root, "apps", "mobile", "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset", "AppIcon-512@2x.png"), 1024);
await write(join(root, "apps", "desktop", "src-tauri", "icons", "32x32.png"), 32);
await write(join(root, "apps", "desktop", "src-tauri", "icons", "128x128.png"), 128);
await write(join(root, "apps", "desktop", "src-tauri", "icons", "128x128@2x.png"), 256);
await write(join(root, "apps", "desktop", "src-tauri", "icons", "icon.png"), 512);
