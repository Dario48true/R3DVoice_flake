import { writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

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

  // Copy icon from AppImage's temporary mount to a persistent user icon dir.
  // process.resourcesPath points inside the AppImage squashfs; copyFileSync
  // reads through the mount and writes to the persistent location.
  try {
    const iconDir = join(home, ".local/share/icons/hicolor/512x512/apps");
    mkdirSync(iconDir, { recursive: true });
    const sourceIcon = join(process.resourcesPath, "icon.png");
    const targetIcon = join(iconDir, "redvoice.png");
    copyFileSync(sourceIcon, targetIcon);
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
