# Privacy

**Short version:** PageSnap never sends anything anywhere. Screenshots stay on your device.

## What PageSnap accesses

| Data                                                                                                        | When                                                              | Where it goes                                                                                     |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Pixels of the current tab                                                                                   | Only after you click PageSnap or press its shortcut (`activeTab`) | Stitched in the extension's service worker, then written to your clipboard and to local IndexedDB |
| Page geometry: viewport and content size, scroll offsets, computed `position` of elements, image load state | During capture                                                    | Used in memory; the origin and sizes appear in the local diagnostics log                          |
| Page title                                                                                                  | During capture                                                    | Stored with the last capture (shown nowhere else)                                                 |
| Your settings                                                                                               | When you change them                                              | `chrome.storage.sync` (synced by Chrome if you use Chrome Sync)                                   |

PageSnap does **not** read page text, form fields, cookies, local storage, history, or other tabs. It does not inject anything persistent. Temporary style changes made during capture are reverted.

## Storage

- **Last capture:** one PNG plus its summary in the extension's IndexedDB, replaced by the next capture. It exists so you can press **Copy** again after the popup closes. It is removed when you uninstall the extension.
- **Diagnostics log:** in memory only (lost when the service worker stops), at most 300 entries. It contains page **origins**, not full URLs.

## Network

None. The extension makes no network requests. There are no analytics, telemetry, crash reporting, remote configuration, or remotely hosted code. The CSP is `script-src 'self'`.

## Permissions

`activeTab`, `scripting`, `clipboardWrite`, and `storage`, plus optional `downloads` requested only if you enable automatic downloads. PageSnap has no host permissions, so it cannot access any site in the background.

## Restricted pages

Chrome blocks extensions from capturing browser pages (`chrome://`), the Chrome Web Store, and other extensions. PageSnap respects that and makes no attempt to work around it.

## Research data

The research code in `research/` runs only on synthetic fixtures or pages you explicitly choose. The project never collects user screenshots. See [research/README.md](../research/README.md#data-policy).
