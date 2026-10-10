// Client-side archive and directory support. Never transmits selected files.
const romInput = document.getElementById('romFile');
const form = document.getElementById('romSelect');
const status = document.getElementById('romMessage');
if (romInput && form) {
  romInput.accept = '.z64,.n64,.v64,.zip';
  const folder = document.createElement('input');
  folder.type = 'file'; folder.multiple = true; folder.webkitdirectory = true;
  folder.style.display = 'none';
  const folderButton = document.createElement('button');
  folderButton.type = 'button'; folderButton.textContent = 'Choose folder';
  form.append(folder, folderButton);
  folderButton.addEventListener('click', () => folder.click());
  const original = romInput.onchange;
  const matches = name => /\.(z64|n64|v64)$/i.test(name);
  const select = async files => {
    let candidates = [];
    for (const file of files) {
      if (matches(file.name)) candidates.push(file);
      else if (/\.zip$/i.test(file.name)) {
        try {
          await import('./vendor/jszip.min.js');
          const JSZip = window.JSZip;
          if (!JSZip) throw new Error('ZIP reader unavailable');
          if (file.size > 64 * 1024 * 1024) throw new Error('ZIP exceeds 64 MB limit');
          const zip = await JSZip.loadAsync(file);
          const entries = Object.values(zip.files).filter(entry => !entry.dir && matches(entry.name));
          for (const entry of entries) {
            if (entry._data?.uncompressedSize > 32 * 1024 * 1024) continue;
            const blob = await entry.async('blob');
            candidates.push(new File([blob], entry.name.split('/').pop(), {type:'application/octet-stream'}));
          }
        } catch (error) { status.textContent = 'Unable to read ZIP: ' + error.message; }
      }
    }
    if (!candidates.length) { status.textContent = 'No supported ROM found (.z64, .n64, .v64).'; return; }
    let chosen = candidates[0];
    if (candidates.length > 1) {
      const choice = prompt('Choose ROM number:\n' + candidates.map((file,i) => `${i+1}. ${file.name}`).join('\n'), '1');
      const index = Number(choice)-1;
      if (!Number.isInteger(index) || index < 0 || index >= candidates.length) return;
      chosen = candidates[index];
    }
    const transfer = new DataTransfer(); transfer.items.add(chosen);
    romInput.files = transfer.files;
    status.textContent = 'Selected ' + chosen.name + '. Processing locally…';
    form.requestSubmit();
  };
  romInput.addEventListener('change', event => {
    const files = Array.from(event.target.files || []);
    if (files.some(file => /\.zip$/i.test(file.name))) { event.stopImmediatePropagation(); select(files); }
  }, true);
  folder.addEventListener('change', event => select(Array.from(event.target.files || [])));
}
