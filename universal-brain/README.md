# Universal Brain MVP

Open `/universal-brain/app.html` to import and search CSV history locally using IndexedDB.

To export history, load `extension/` as an unpacked Chromium extension in `chrome://extensions` (Developer mode), click the extension, and export. Then import the CSV in the app.

The extension exports browser history **URLs, titles, and most recent visit times**, not a full per-visit log. It requests history and downloads permissions; it does not transmit browsing data. The local app supports CSV quoted fields, local search, and deletion. Browser storage can be cleared by the user or browser.

Current limits: no Operator integration, sync, page content capture, or Firefox packaging. Test in Chromium before production use.
