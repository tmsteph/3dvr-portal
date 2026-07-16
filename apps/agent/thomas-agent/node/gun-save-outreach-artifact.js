const fs = require('fs');
const path = require('path');
const { outreachArtifactsNode, slugify } = require('./gun-db');

function usage() {
  console.error(
    [
      'Usage:',
      '  node gun-save-outreach-artifact.js "Lead Name" --draft draft.txt --file screenshot.png [--file mock.png]',
      '  node gun-save-outreach-artifact.js --list "Lead Name"',
    ].join('\n')
  );
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    files: [],
    list: false,
  };

  if (args[0] === '--list') {
    options.list = true;
    args.shift();
  }

  options.name = args.shift();

  while (args.length) {
    const flag = args.shift();
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

function putGun(node, payload) {
  return new Promise((resolve, reject) => {
    node.put(payload, (ack = {}) => {
      if (ack.err) {
        reject(new Error(ack.err));
        return;
      }

      resolve(ack);
    });
  });
}

function onceGun(node) {
  return new Promise((resolve) => {
    node.once((data) => resolve(data || {}));
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function listArtifact(name) {
  const id = slugify(name);
  const data = await onceGun(outreachArtifactsNode().get(id));

  if (!data || !data.id) {
    console.error(`No outreach artifact found for ${name} (${id})`);
    process.exit(1);
  }

  const attachments = JSON.parse(data.attachmentsJson || '[]').map((item) => ({
    name: item.name,
    mime: item.mime,
    size: item.size,
  }));

  console.log(
    JSON.stringify(
      {
        id: data.id,
        leadName: data.leadName,
        gunPath: `3dvr/crm/outreach-artifacts/${id}`,
        draftPreview: String(data.draftText || '').slice(0, 240),
        attachmentCount: data.attachmentCount,
        attachments,
        updatedAt: data.updatedAt,
      },
      null,
      2
    )
  );
}

async function saveArtifact({ name, draft, files }) {
  if (!name || !draft) {
    usage();
    process.exit(1);
  }

  const id = slugify(name);
  const draftPath = path.resolve(draft);
  const draftText = fs.readFileSync(draftPath, 'utf8');
  const attachments = files.map(readAttachment);
  const now = new Date().toISOString();
  const node = outreachArtifactsNode().get(id);

  const existing = await onceGun(node);
  const artifact = {
    ...(existing || {}),
    id,
    leadName: name,
    draftText,
    draftPath,
    attachmentsJson: JSON.stringify(attachments),
    attachmentCount: attachments.length,
    updatedAt: now,
    createdAt: existing && existing.createdAt ? existing.createdAt : now,
  };

  await putGun(node, artifact);
  await sleep(1500);

  console.log(`Saved outreach artifact: ${name} (${id})`);
  console.log(`Gun path: 3dvr/crm/outreach-artifacts/${id}`);
  console.log(`Attachments: ${attachments.map((item) => item.name).join(', ') || 'none'}`);
}

async function main() {
  let options;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    usage();
    process.exit(1);
  }

  if (!options.name) {
    usage();
    process.exit(1);
  }

  if (options.list) {
    await listArtifact(options.name);
    return;
  }

  await saveArtifact(options);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`Failed to save outreach artifact: ${error.message}`);
    process.exit(1);
  });

setTimeout(() => {
  console.error('Timed out writing outreach artifact');
  process.exit(1);
}, 10000);
