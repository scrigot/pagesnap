# Troubleshooting

**"Captured, not copied"**
The popup closed or lost focus before the image was written. Press **C** or click **Copy**. To avoid it, keep the popup open until it says _Copied_. Clicking the page closes the popup.

**"Cannot capture this page"**
Chrome blocks extensions on `chrome://` pages, the Web Store, other extensions, and `file://` URLs unless file access is allowed (see [INSTALLATION.md](INSTALLATION.md#local-files)). Open a regular website.

**Only the visible part was captured**
The page cannot be scripted, for example Chrome's PDF viewer. PageSnap falls back to the visible area and says so.

**The capture is cut off at the bottom**

- The popup shows why. If the page was taller than _Maximum capture height_ (default 30,000 px), raise it in Settings.
- If it says the page _stopped scrolling_, the site limits scrolling (virtualized lists or scroll hijacking).

**The image is downscaled**
Chrome canvases are limited to about 32,767 px per side. Choose _Keep resolution, cut height_ in Settings, or capture a narrower window.

**A header appears in the middle, or content is missing under a banner**

- Fixed elements are shown once, in the first screen. A fixed _bottom_ bar therefore covers part of the first screen.
- Some sites switch a header to `fixed` only after scrolling. PageSnap rescans each frame, but if a header slips through, report the URL.
- Turn _Show fixed elements once_ off to keep overlays in every frame.

**Animations or lazy sections look half-loaded**
Set _Delay per frame_ to 300–800 ms. Images in view are already awaited automatically.

**"The tab navigated or closed during capture"**
The page reloaded or changed route mid-capture, or you switched tabs. Retry once the page has settled.

**The shortcut does nothing**
Another extension may own `Alt+Shift+S`. Open `chrome://extensions/shortcuts` and assign a new key to _Activate the extension_ under PageSnap.

**Pasting into Claude Code inserts nothing**
Claude Code reads clipboard images itself: `Ctrl+V` on macOS/Linux, `Alt+V` on Windows. Your terminal's own paste (`Cmd+V`, `Ctrl+Shift+V`) usually sends only text.

**Pasting into an app inserts nothing**
The destination may not accept clipboard images. Use **Download** (`D`) and attach the file instead.

**Reporting a bug**
Settings → Diagnostics → **Copy log** and paste it into the issue. It contains origins and sizes, but no page content.
