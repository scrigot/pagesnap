# Installation

PageSnap is installed from source until it is published on the Chrome Web Store.

## Requirements

- Chrome 116+ or another Chromium browser (Edge, Brave, Arc, Opera)
- Node.js 20+ and npm (to build)

## Build and load

```bash
git clone https://github.com/scrigot/pagesnap.git
```

```bash
cd pagesnap && npm ci && npm run build
```

1. Go to `chrome://extensions` (Edge: `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose the `dist/` directory.
4. Pin PageSnap: puzzle-piece icon → pin.

On first install Chrome shows no permission warnings beyond "Read and change data on the current page when you click the extension" (`activeTab`) and clipboard access.

## Update

```bash
git pull && npm ci && npm run build
```

Then click the reload icon on PageSnap's card in `chrome://extensions`.

## Local files

To capture `file://` pages, open PageSnap's **Details** in `chrome://extensions` and turn on **Allow access to file URLs**.

## Packaging a zip

```bash
npm run package   # writes pagesnap.zip from dist/
```

## Uninstall

Click **Remove** on the card in `chrome://extensions`. This deletes PageSnap's settings and its stored last capture.
