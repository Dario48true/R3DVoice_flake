import { writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * electron-builder stores the icon inside the AppImage at
 * `usr/share/icons/hicolor/<size>/apps/<sanitized-package-name>.png`.
 * For scoped names like @redvoice/client it becomes `@redvoiceclient.png`.
 * Find whatever's there without hardcoding the sanitized name.
 */
function findAppIcon(appDir: string): string | null {
  const iconRoot = join(appDir, "usr/share/icons/hicolor");
  if (!existsSync(iconRoot)) return null;
  for (const size of ["512x512", "256x256", "128x128", "64x64"]) {
    const appsDir = join(iconRoot, size, "apps");
    if (!existsSync(appsDir)) continue;
    try {
      const pngs = readdirSync(appsDir).filter((f) => f.endsWith(".png"));
      if (pngs[0]) return join(appsDir, pngs[0]);
    } catch {
      // ignore and try next size
    }
  }
  return null;
}

/**
 * On Linux AppImage builds, writes a `.desktop` file on every launch pointing
 * at the currently-running AppImage. Survives auto-update: after electron-updater
 * replaces the AppImage, the next launch rewrites the entry to the new path.
 *
 * No-op on X11-non-AppImage, non-Linux, or dev runs (when APPIMAGE env is unset).
 */
export function writeDesktopEntry(): void {
  if (process.platform !== "linux") return;
  const appImagePath = process.env["APPIMAGE"];
  if (!appImagePath) return;

  const home = homedir();

  // Copy icon from the AppImage's mounted squashfs ($APPDIR) to a persistent
  // user icon dir. electron-builder stores the icon at a path derived from the
  // package name; findAppIcon locates whichever PNG is there.
  try {
    const appDir = process.env["APPDIR"];
    if (appDir) {
      const sourceIcon = findAppIcon(appDir);
      if (sourceIcon) {
        const iconDir = join(home, ".local/share/icons/hicolor/512x512/apps");
        mkdirSync(iconDir, { recursive: true });
        copyFileSync(sourceIcon, join(iconDir, "redvoice.png"));
      }
    }
  } catch {
    // Icon is cosmetic — proceed without it.
  }

  // Write .desktop. X-AppImage-Integrate=false tells AppImageLauncher to leave
  // this entry alone (no renaming/moving). We manage it ourselves.
  try {
    const appsDir = join(home, ".local/share/applications");
    mkdirSync(appsDir, { recursive: true });
    const desktopContent = [
      "[Desktop Entry]",
      "Name=RedVoice",
      "GenericName=Voice Chat",
      "Comment=Open-source screenshare + voice chat",
      `Exec="${appImagePath}" %U`,
      "Icon=redvoice",
      "Type=Application",
      "Categories=Network;Chat;AudioVideo;",
      "StartupWMClass=RedVoice",
      "X-AppImage-Integrate=false",
      "MimeType=x-scheme-handler/redvoice;",
      "",
    ].join("\n");
    writeFileSync(join(appsDir, "redvoice.desktop"), desktopContent, { mode: 0o644 });
  } catch {
    // Desktop entry is a convenience — if writing fails, app still runs.
  }
}
