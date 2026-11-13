# Security Policy

## Supported versions

The latest release on `main` is supported.

## Reporting a vulnerability

Please **do not open a public issue.** Use GitHub → _Security_ → _Report a vulnerability_ on this repository. Include the affected version, reproduction steps, and impact. Expect an acknowledgement within 7 days.

## Security model

- **Permissions:** `activeTab`, `scripting`, `clipboardWrite`, and `storage`; `downloads` is optional. No host permissions, so no background access to sites.
- **No network:** the extension makes no requests, and its CSP is `script-src 'self'`. There is no remote code.
- **Page agent** runs in Chrome's isolated world, only on the tab the user invoked it on. It accepts messages only from PageSnap's own extension ID and reads geometry, not content.
- **Messaging:** the service worker accepts port connections and runtime messages only from its own extension ID.
- **Data at rest:** the last capture lives in extension-origin IndexedDB, inaccessible to websites.

In scope: anything that leaks capture data off-device, lets a page influence PageSnap beyond its own geometry, or leaves pages modified after capture.
