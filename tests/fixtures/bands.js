// Deterministic band palette shared by fixtures and E2E assertions.
// Band i is BAND px tall and filled with bandColor(i). Labels sit in the left
// 30% so the right side of every band is a single solid color.
window.BAND = 100;
window.bandColor = (i) => [(i * 67 + 30) % 256, (i * 131 + 60) % 256, (i * 29 + 90) % 256];
window.renderBands = (container, from, to) => {
  for (let i = from; i < to; i++) {
    const d = document.createElement('div');
    const [r, g, b] = window.bandColor(i);
    d.className = 'band';
    d.style.cssText = `height:${window.BAND}px;background:rgb(${r},${g},${b});position:relative`;
    d.innerHTML = `<span style="position:absolute;left:8px;top:8px;font:bold 20px monospace;color:#fff;background:#000;padding:2px 6px">#${i}</span>`;
    container.appendChild(d);
  }
};
