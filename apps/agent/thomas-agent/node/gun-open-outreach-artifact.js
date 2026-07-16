const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const PORTAL_URL = process.env.THREEDVR_PORTAL_OUTREACH_URL
  || 'https://portal.3dvr.tech/sales/outreach.html';

function usage() {
  console.error(
    [
      'Usage:',
      '  node gun-open-outreach-artifact.js "Lead Name" --draft draft.txt --file screenshot.png [--file mock.png]',
    ].join('\n')
  );
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    files: [],
    noOpen: false,
  };

  options.name = args.shift();

  while (args.length) {
    const flag = args.shift();

    if (flag === '--no-open') {
      options.noOpen = true;
      continue;
    }

    const value = args.shift();

    if (!value) {
      throw new Error(`Missing value for ${flag}`);
    }

    if (flag === '--draft') {
      options.draft = value;
    } else if (flag === '--file') {
      options.files.push(value);
    } else {
      throw new Error(`Unknown option: ${flag}`);
    }
  }

  return options;
}

function inferMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.txt' || ext === '.md') return 'text/plain';

  return 'application/octet-stream';
}

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function readAttachment(filePath) {
  const absolutePath = path.resolve(filePath);
  const buffer = fs.readFileSync(absolutePath);

  return {
    name: path.basename(filePath),
    mime: inferMime(filePath),
    size: buffer.length,
    encoding: 'base64',
    data: buffer.toString('base64'),
    sourcePath: absolutePath,
  };
}

function safeJsonForScript(payload) {
  return JSON.stringify(payload)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function buildHandoffHtml(payload) {
  const payloadJson = safeJsonForScript(payload);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>3dvr Outreach Handoff</title>
    <script src="https://cdn.jsdelivr.net/npm/gun/gun.js"></script>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #07120f;
        color: #f8f1d6;
        font-family: system-ui, sans-serif;
      }
      main {
        width: min(92vw, 680px);
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 24px;
        background: rgba(255,255,255,.06);
        padding: 28px;
        box-shadow: 0 24px 80px rgba(0,0,0,.35);
      }
      h1 { margin: 0 0 12px; font-size: 28px; }
      p { color: #d9d2bd; line-height: 1.55; }
      pre {
        max-height: 220px;
        overflow: auto;
        border-radius: 14px;
        background: rgba(0,0,0,.3);
        padding: 14px;
        color: #fff9df;
        white-space: pre-wrap;
      }
      a, button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 999px;
        background: #f8cf63;
        color: #07120f;
        font-weight: 800;
        padding: 12px 16px;
        text-decoration: none;
      }
      .row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
      #status { font-weight: 700; color: #f8cf63; }
    </style>
  </head>
  <body>
    <main>
      <p>3dvr local agent handoff</p>
      <h1>Saving outreach artifact</h1>
      <p id="status">Connecting to Gun…</p>
      <pre id="preview"></pre>
      <div class="row">
        <button id="retry" type="button">Retry save</button>
        <a id="portalLink" href="${PORTAL_URL}?artifact=${encodeURIComponent(payload.id)}">Open Outreach CRM</a>
      </div>
    </main>
    <script>
      const payload = ${payloadJson};
      const portalUrl = ${JSON.stringify(PORTAL_URL)};
      const statusEl = document.getElementById('status');
      const previewEl = document.getElementById('preview');
      const portalLink = document.getElementById('portalLink');
      const retry = document.getElementById('retry');

      previewEl.textContent = [
        payload.leadName,
        '',
        payload.draftText.slice(0, 900),
        '',
        'Attachments: ' + payload.attachments.length
      ].join('\\n');

      function save() {
        statusEl.textContent = 'Writing draft and screenshots to Gun…';
        const gun = Gun({
          peers: [
            'wss://gun-relay-3dvr.fly.dev/gun',
            'https://gun-relay-3dvr.fly.dev/gun'
          ],
          localStorage: false
        });
        const node = gun.get('3dvr').get('crm').get('outreach-artifacts').get(payload.id);
        const now = new Date().toISOString();
        node.put({
          id: payload.id,
          leadName: payload.leadName,
          draftText: payload.draftText,
          attachmentsJson: JSON.stringify(payload.attachments),
          attachmentCount: payload.attachments.length,
          source: '3dvr-agent-handoff',
          createdAt: payload.createdAt || now,
          updatedAt: now
        }, function (ack) {
          if (ack && ack.err) {
            statusEl.textContent = 'Gun save failed: ' + ack.err;
            return;
          }
          statusEl.textContent = 'Saved. Opening Outreach CRM…';
          setTimeout(function () {
            window.location.href = portalUrl + '?artifact=' + encodeURIComponent(payload.id);
          }, 900);
        });
      }

      retry.addEventListener('click', save);
      save();
    </script>
  </body>
</html>
`;
}

function writeHandoffFile(payload) {
  const outputDir = resolveOutputDir();
  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `${payload.id}-handoff.html`);
  fs.writeFileSync(outputPath, buildHandoffHtml(payload));
  return outputPath;
}

function resolveOutputDir() {
  if (process.env.THREEDVR_OUTREACH_DIR) {
    return path.resolve(process.env.THREEDVR_OUTREACH_DIR);
  }

  const home = os.homedir();
  const candidates = [
    path.join(home, '3dvr-outreach'),
    path.join(home, 'Downloads', '3dvr-outreach'),
    path.join(home, 'outreach'),
    '/sdcard/Download/3dvr-outreach',
  ];

  const existingParent = candidates.find((candidate) => {
    const parent = path.dirname(candidate);
    return parent && fs.existsSync(parent);
  });

  return existingParent || path.join(process.cwd(), '3dvr-outreach');
}

function fileUrl(filePath) {
  const resolved = path.resolve(filePath);
  if (process.platform === 'win32') {
    return `file:///${resolved.replace(/\\/g, '/')}`;
  }
  return `file://${resolved}`;
}

function commandExists(command) {
  const pathEntries = String(process.env.PATH || '').split(path.delimiter);
  return pathEntries.some((entry) => fs.existsSync(path.join(entry, command)));
}

function detectOpenCommand() {
  if (process.env.THREEDVR_OPEN_COMMAND) {
    return {
      command: process.env.THREEDVR_OPEN_COMMAND,
      args: [],
    };
  }

  if (process.platform === 'darwin') {
    return { command: 'open', args: [] };
  }

  if (process.platform === 'win32') {
    return { command: 'cmd', args: ['/c', 'start', ''] };
  }

  const linuxCommands = ['termux-open', 'xdg-open', 'gio'];
  const command = linuxCommands.find(commandExists);

  if (!command) {
    return null;
  }

  if (command === 'gio') {
    return { command, args: ['open'] };
  }

  return { command, args: [] };
}

function openHandoffFile(outputPath) {
  const opener = detectOpenCommand();

  if (!opener) {
    return false;
  }

  const target = fileUrl(outputPath);
  const child = spawn(opener.command, [...opener.args, target], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  return true;
}

function main() {
  let options;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    usage();
    process.exit(1);
  }

  if (!options.name || !options.draft) {
    usage();
    process.exit(1);
  }

  const id = slugify(options.name);
  const draftText = fs.readFileSync(path.resolve(options.draft), 'utf8');
  const attachments = options.files.map(readAttachment);
  const payload = {
    id,
    leadName: options.name,
    draftText,
    attachments,
    createdAt: new Date().toISOString(),
  };
  const outputPath = writeHandoffFile(payload);
  const opened = options.noOpen ? false : openHandoffFile(outputPath);

  console.log(`Created handoff: ${outputPath}`);
  if (opened) {
    console.log('Opened handoff in the system browser.');
  } else {
    console.log(`Open this file in a browser to sync into the portal: ${outputPath}`);
  }
}

main();
