import { downloadFilename } from '../shared/format';
import type { CaptureSummary } from '../shared/types';

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export async function hasDownloadPermission(): Promise<boolean> {
  return chrome.permissions.contains({ permissions: ['downloads'] });
}

/** Saves via chrome.downloads (service workers have no URL.createObjectURL). */
export async function downloadBlob(blob: Blob, summary: CaptureSummary): Promise<void> {
  const url = `data:image/png;base64,${toBase64(await blob.arrayBuffer())}`;
  await chrome.downloads.download({ url, filename: downloadFilename(summary), saveAs: false });
}
