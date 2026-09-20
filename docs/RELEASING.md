# Publishing a new version (auto-update)

Installed copies of Kairo check GitHub for a newer release, **ask the user**, and only then download and install it.
Nothing is downloaded or installed without a click on "Download and install".

## Release a new version

1. Commit your changes to `main` and make sure CI is green.
2. Run:

   ```bash
   npm run release -- 0.1.2
   ```

   The script bumps the version in `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `Cargo.lock` and
   `tauri.conf.json`, commits, creates the tag `v0.1.2` and pushes both. (`--dry` only bumps and commits locally.)
3. The tag starts `.github/workflows/release.yml`. It builds installers for Windows, macOS and Linux, signs the update
   packages, publishes the GitHub Release (the release notes are the commit messages since the previous tag) and
   uploads `latest.json`.
4. Within a few minutes every installed copy that checks for updates sees the new version.

Use the semantic version: `patch` for fixes (0.1.1 → 0.1.2), `minor` for features (0.1.x → 0.2.0).
Write commit messages as if users read them: they become the "What's new" text in the update dialog.

## How it works

* The app embeds the **public** signing key (`plugins.updater.pubkey` in `src-tauri/tauri.conf.json`) and the feed URL
  `https://github.com/foy4ik/kairo/releases/latest/download/latest.json`.
* `latest.json` lists the newest version and, per platform, the package URL and its signature.
* The app downloads a package only if the signature verifies against the embedded public key, so a tampered file is rejected.
* On Windows the installer runs in "passive" mode (progress bar, no questions) and restarts the app.
* Settings → Updates lets the user switch the automatic check off or check manually.
* Update checks contact GitHub only; no user data is sent. User data lives outside the install folder and is never touched.

## The signing key (important)

Update packages are signed with a private key that is **not** in the repository. It is protected by a password:

* GitHub secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (used by the release workflow),
* the developer machine keeps `~/.tauri/kairo-updater.key` (the key) and `~/.tauri/kairo-updater.password.txt` (its password).

GitHub secrets cannot be read back, so these two local files are the only copy. **Back up both together in a password
manager or an encrypted drive.** Without the key *and* its password, installed apps can no longer verify new updates and
users must reinstall manually.

To create a new pair (installed apps will not trust it, users reinstall once):

```bash
npx tauri signer generate -w ~/.tauri/kairo-updater.key -p "<new password>"
```

then put the public key (`.key.pub`) into `plugins.updater.pubkey` in `tauri.conf.json`, the private key into the
`TAURI_SIGNING_PRIVATE_KEY` secret and the password into `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, and release a new version.

## Platforms

* Windows: NSIS installer (per user). macOS: Apple-silicon build (`aarch64`); Linux: AppImage (updates itself) and `.deb`
  (install manually).
* Installers are not code-signed with a Microsoft/Apple certificate, so first installs show a SmartScreen / Gatekeeper
  warning. That does not affect the update signature check described above.
