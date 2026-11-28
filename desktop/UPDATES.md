# Updating the desktop app

The Windows app updates itself from inside: it checks GitHub Releases a few seconds after opening
(and every 4 hours), and offers **Update now / Later**. "Update now" downloads, restarts and installs
by itself. Staff can also check by hand: press **Ctrl + Shift + U**, or tap **Alt** to show the menu bar and
choose **Help → Check for updates…**.

## What needs an update — and what doesn't
- Website changes (pages, fixes, kitchen checklist, roles…): **nothing to do**. The app shows the live
  site, so every PC already has them the moment Vercel finishes deploying.
- Changes to the desktop shell itself (`desktop/` folder: splash, menus, window behaviour): do the steps below.

## Releasing a new desktop version
1. In `desktop/package.json` raise `"version"` (for example `1.1.0` → `1.1.1`). It must be higher than
   what is installed, and each version can be released only once.
2. Commit and push to `main`.
3. GitHub → **Actions → Build Windows app → Run workflow**.
4. When it finishes (green tick), a new Release appears under the repo's **Releases**. Every PC with the
   Setup version offers the update within a few hours, or immediately via Help → Check for updates…

## One-time note
The first updater-enabled version (1.1.0) must be installed by hand on each PC, once. Updates come
from inside the app after that. The portable `.exe` cannot update itself; use the Setup version.
