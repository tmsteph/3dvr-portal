const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile, spawn } = require('node:child_process');
const { chmod, mkdir, mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const cli = path.join(__dirname, '..', 'thomas-agent', 'scripts', '3dvr');

function runCli(args, env = {}) {
  return new Promise((resolve, reject) => {
    execFile(cli, args, {
      env: {
        ...process.env,
        THREEDVR_OAUTH_FILE: path.join(__dirname, '.tmp-oauth-test.json'),
        ...env,
      },
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function runCliInteractive(input, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cli, [], {
      env: {
        ...process.env,
        THREEDVR_OAUTH_FILE: path.join(__dirname, '.tmp-oauth-test.json'),
        ...env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        const error = new Error(`3dvr exited with ${code}`);
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
    child.stdin.end(input);
  });
}

test('help exposes install, setup, connect, and email aliases', async () => {
  const { stdout } = await runCli(['--help']);

  assert.match(stdout, /3dvr setup\s+first-run setup checklist/);
  assert.match(stdout, /3dvr install\s+install\/update instructions/);
  assert.match(stdout, /3dvr connect \[gmail\]\s+connect email with portal OAuth/);
  assert.match(stdout, /3dvr outreach next\s+same as 3dvr next/);
  assert.match(stdout, /3dvr outreach sent\s+same as 3dvr contacted/);
  assert.match(stdout, /3dvr inbox watch\s+run inbox monitor once with reply previews/);
  assert.match(stdout, /3dvr send-auto\s+auto-send the next direct-email lead and mark it contacted/);
  assert.match(stdout, /3dvr lead send-current\s+auto-send the currently loaded lead/);
  assert.match(stdout, /3dvr meeting \[room\] \[control\]\s+build or open a meeting pack with smart join, ops, meshcast, and fallback links/);
  assert.match(stdout, /3dvr yolo\s+local llama\.cpp patch-edit helper/);
  assert.match(stdout, /3dvr yolo-app\s+generate a page inside the 3dvr-site repo/);
  assert.match(stdout, /3dvr yolo-new-site\s+generate a new site repo and push it to GitHub/);
  assert.match(stdout, /3dvr agent task\s+route a task to Codex, OpenClaw, Claude, OpenAI, or shell/);
  assert.match(stdout, /3dvr agent queue\s+enqueue\/list remote server tasks/);
  assert.match(stdout, /3dvr agent worker\s+run queued tasks on this machine/);
  assert.match(stdout, /3dvr revenue\s+market research, A\/B experiments, and revenue reports/);
  assert.match(stdout, /3dvr dev yolo\s+same as 3dvr yolo/);
  assert.match(stdout, /3dvr dev yolo-app\s+same as 3dvr yolo-app/);
  assert.match(stdout, /3dvr dev yolo-new-site\s+same as 3dvr yolo-new-site/);
  assert.match(stdout, /3dvr email connect\s+same as 3dvr auth login google/);
  assert.match(stdout, /supports portal OAuth or a legacy Gmail app password/i);
});

test('install command gives npm and OAuth-first setup path', async () => {
  const { stdout } = await runCli(['install']);

  assert.match(stdout, /npm install -g 3dvr-agent/);
  assert.match(stdout, /npm link/);
  assert.match(stdout, /3dvr setup/);
  assert.match(stdout, /3dvr connect/);
  assert.match(stdout, /Email auth supports portal OAuth or a legacy Gmail app password/);
});

test('guided menu accepts commands and stays open until quit', async () => {
  const { stdout } = await runCliInteractive('help\nq\n');

  assert.match(stdout, /CRM focus:/);
  assert.match(stdout, /Commands also work here: `next`, `contacted`, `sent-next`, `send-auto`, `ask-form`, `inbox check`, `status`, `crm`, or direct `ask-\*` commands\./);
  assert.match(stdout, /3dvr CLI v1/);
  assert.ok((stdout.match(/Welcome to 3dvr/g) || []).length >= 2);
});

test('menu shows the active lead on the auto-send slot', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), '3dvr-cli-'));
  const leads = path.join(tmp, 'leads.csv');
  const sessionFile = path.join(tmp, 'session.env');
  await writeFile(
    leads,
    'name,link,contact,status,score,source,updated\nCurrent Lead,https://current.example,mailto:current@example.com,new,30,test,now\n',
  );

  try {
    const { stdout } = await runCliInteractive('q\n', {
      THREEDVR_LEADS_FILE: leads,
      THREEDVR_SESSION_FILE: sessionFile,
    });

    assert.match(stdout, /10\) Auto-send current\s+Send the current lead: Current Lead, or the next queue item if none is loaded/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('menu option 1 shows the next lead result', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), '3dvr-cli-'));
  const leads = path.join(tmp, 'leads.csv');
  await writeFile(
    leads,
    'name,link,contact,status,score,source,updated\nAcme Studio,https://acme.example,mailto:owner@acme.example,new,22,test,now\n',
  );

  try {
    const { stdout } = await runCliInteractive('1\nq\n', {
      THREEDVR_LEADS_FILE: leads,
    });

    assert.match(stdout, /NEXT LEAD/);
    assert.match(stdout, /Name: Acme Studio/);
    assert.match(stdout, /Route: email/);
    assert.match(stdout, /STEP 2: Send this opener/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('menu accepts direct ask-track commands', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), '3dvr-cli-'));
  const leads = path.join(tmp, 'leads.csv');
  await writeFile(
    leads,
    'name,link,contact,status,score,source,updated\nCasa By Craft,https://casa.example,mailto:hello@casa.example,new,11,test,now\n',
  );

  try {
    const { stdout } = await runCliInteractive('ask-track contact "Casa By Craft"\nq\n', {
      THREEDVR_LEADS_FILE: leads,
    });
    const leadsText = await readFile(leads, 'utf8');

    assert.match(stdout, /Contacted: Casa By Craft/);
    assert.match(leadsText, /Casa By Craft,https:\/\/casa\.example,mailto:hello@casa\.example,contacted/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('lead card shows the current lead summary in the menu', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), '3dvr-cli-'));
  const leads = path.join(tmp, 'leads.csv');
  await writeFile(
    leads,
    'name,link,contact,status,score,source,updated\nAcme Studio,https://acme.example,mailto:owner@acme.example,new,22,test,now\n',
  );

  try {
    const { stdout } = await runCliInteractive('2\nq\n', {
      THREEDVR_LEADS_FILE: leads,
    });

    assert.match(stdout, /Lead: Acme Studio \| status: new \| score: 22/);
    assert.match(stdout, /Category: Email-ready/);
    assert.match(stdout, /Site: https:\/\/acme\.example/);
    assert.match(stdout, /Contact: mailto:owner@acme\.example/);
    assert.match(stdout, /Quick actions:/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('status shows lead contact categories', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), '3dvr-cli-'));
  const leads = path.join(tmp, 'leads.csv');
  await writeFile(
    leads,
    'name,link,contact,status,score,source,updated\nMail Lead,https://mail.example,mailto:lead@mail.example,new,20,test,now\nWeb Lead,https://web.example,https://web.example/contact,new,10,test,now\n',
  );

  try {
    const { stdout } = await runCli(['status'], {
      THREEDVR_LEADS_FILE: leads,
    });

    assert.match(stdout, /email-ready:\s+1/);
    assert.match(stdout, /web-contact:\s+1/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('email status reports the legacy Gmail fallback when app password is present', async () => {
  const { stdout } = await runCli(['email', 'status'], {
    GMAIL_APP_PASSWORD: 'app-password-test',
  });

  assert.match(stdout, /Legacy Gmail app password: configured for 3dvr\.tech@gmail\.com/);
});

test('track command proxies to ask-track', async () => {
  const { stdout } = await runCli(['track', 'failures', '1']);

  assert.match(stdout, /No failure entries found\.|failures/i);
});

test('meeting command prints a sanitized meeting pack', async () => {
  const { stdout } = await runCli(['meeting', 'Team Sync!', 'Control/Board']);

  assert.match(stdout, /Meeting pack/);
  assert.match(stdout, /Room: teamsync/);
  assert.match(stdout, /Control: controlboard/);
  assert.match(stdout, /Smart Join:/);
  assert.match(stdout, /Meeting Ops:/);
  assert.match(stdout, /Host \/ Director:/);
  assert.match(stdout, /Guest \/ Participant:/);
  assert.match(stdout, /Fallback \/ Crunch:/);
  assert.match(stdout, /Meshcast Meeting:/);
  assert.match(stdout, /WhatsApp quick copy:/);
  assert.match(stdout, /Meeting: https:\/\/portal\.3dvr\.tech\/portal\.3dvr\.tech\/video\/join\.html\?room=teamsync&control=controlboard&role=participant&name=guest&profile=low&codec=h264/);
  assert.match(stdout, /Fallback: https:\/\/vdo\.ninja\/\?room=teamsync&label&showlabels&codec=h264&vb=120&ab=24&fps=4&scale=96p&stereo=0&buffer=30/);
  assert.match(stdout, /room=teamsync/);
  assert.match(stdout, /control=controlboard/);
  assert.match(stdout, /vdo\.ninja\/\?room=teamsync&label&showlabels&codec=h264&vb=120&ab=24&fps=4&scale=96p&stereo=0&buffer=30/);
});

test('meeting whatsapp mode prints the compact share block', async () => {
  const { stdout } = await runCli(['meeting', '--whatsapp', 'Team Sync!', 'Control/Board']);

  assert.match(stdout, /^Meeting: https:\/\/portal\.3dvr\.tech\/portal\.3dvr\.tech\/video\/join\.html\?room=teamsync&control=controlboard&role=participant&name=guest&profile=low&codec=h264$/m);
  assert.match(stdout, /^Fallback: https:\/\/vdo\.ninja\/\?room=teamsync&label&showlabels&codec=h264&vb=120&ab=24&fps=4&scale=96p&stereo=0&buffer=30$/m);
  assert.match(stdout, /^Ops: https:\/\/portal\.3dvr\.tech\/portal\.3dvr\.tech\/video\/ops\.html\?room=teamsync&control=controlboard&role=participant&name=guest&profile=normal&codec=h264$/m);
});

test('meeting open mode launches the smart join link', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), '3dvr-meeting-'));
  const openLog = path.join(tmp, 'open.log');

  try {
    const { stdout } = await runCli(['meeting', '--open', 'Team Sync!', 'Control/Board'], {
      THREEDVR_OPEN_URL_LOG: openLog,
    });
    const openText = await readFile(openLog, 'utf8');

    assert.equal(stdout.trim(), '');
    assert.match(openText, /\/portal\.3dvr\.tech\/video\/join\.html\?room=teamsync&control=controlboard&role=participant&name=guest&profile=low&codec=h264/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('meeting open auto mode can prefer meshcast for low bandwidth profiles', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), '3dvr-meeting-'));
  const openLog = path.join(tmp, 'open.log');

  try {
    await runCli(['meeting', '--open', 'Team Sync!', 'Control/Board'], {
      THREEDVR_OPEN_URL_LOG: openLog,
      THREEDVR_MEETING_PROFILE: 'meshcast',
    });
    const openText = (await readFile(openLog, 'utf8')).trim();

    assert.match(openText, /\/portal\.3dvr\.tech\/video\/meshcast\.html$/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('agent status includes the heartbeat section', async () => {
  const { stdout } = await runCli(['agent', 'status']);

  assert.match(stdout, /Heartbeat/);
  assert.match(stdout, /Heartbeat snapshot/);
  assert.match(stdout, /Inbox worker/);
  assert.match(stdout, /Outreach worker/);
});

test('sent-next marks the last shown lead and advances to the next one', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), '3dvr-cli-'));
  const leads = path.join(tmp, 'leads.csv');
  const sessionFile = path.join(tmp, 'session.env');
  const openLog = path.join(tmp, 'open.log');
  await writeFile(
    leads,
    'name,link,contact,status,score,source,updated\nAlpha Studio,https://alpha.example,mailto:alpha@example.com,new,20,test,now\nBeta Studio,https://beta.example,mailto:beta@example.com,new,10,test,now\n',
  );

  try {
    const { stdout } = await runCliInteractive('2\n0\nq\n', {
      THREEDVR_LEADS_FILE: leads,
      THREEDVR_SESSION_FILE: sessionFile,
      THREEDVR_OPEN_URL_LOG: openLog,
    });
    const leadsText = await readFile(leads, 'utf8');

    assert.match(stdout, /Lead: Alpha Studio \| status: new \| score: 20/);
    assert.match(stdout, /Contacted: Alpha Studio/);
    assert.match(stdout, /Lead: Beta Studio \| status: new \| score: 10/);
    assert.match(leadsText, /Alpha Studio,https:\/\/alpha\.example,mailto:alpha@example\.com,contacted/);
    assert.match(leadsText, /Beta Studio,https:\/\/beta\.example,mailto:beta@example\.com,new/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('ask-next skips automatic page opening by default', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), '3dvr-cli-'));
  const leads = path.join(tmp, 'leads.csv');
  await writeFile(
    leads,
    'name,link,contact,status,score,source,updated\nBlueprint Homes,https://blueprinthomes.com/,mailto:hello@blueprinthomes.com,new,25,test,now\n',
  );

  try {
    const { stdout } = await runCli(['next'], {
      THREEDVR_LEADS_FILE: leads,
      THREEDVR_OPEN_LEAD_PAGE: '0',
    });

    assert.match(stdout, /NEXT LEAD/);
    assert.match(stdout, /Action: email/);
    assert.match(stdout, /Skipping automatic page open\./);
    assert.match(stdout, /open_url "mailto:hello@blueprinthomes.com"/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('ask-next prefers explicit form routes over newer generic site leads', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), '3dvr-cli-'));
  const leads = path.join(tmp, 'leads.csv');
  await writeFile(
    leads,
    'name,link,contact,status,date,variant\nGeneric Site,https://generic.example,https://generic.example,new,2026-05-07,\nExplicit Form,https://form.example,https://form.example/contact,new,2026-05-01,route=form\n',
  );

  try {
    const { stdout } = await runCli(['next'], {
      THREEDVR_LEADS_FILE: leads,
      THREEDVR_OPEN_LEAD_PAGE: '0',
    });

    assert.match(stdout, /Name: Explicit Form/);
    assert.match(stdout, /Route: form/);
    assert.match(stdout, /Quality: form-ready/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('ask-next treats phone-only leads as manual outreach', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), '3dvr-cli-'));
  const leads = path.join(tmp, 'leads.csv');
  await writeFile(
    leads,
    'name,link,contact,status,score,source,updated\nCall Me LLC,,+18643602659,new,25,test,now\n',
  );

  try {
    const { stdout } = await runCli(['next'], {
      THREEDVR_LEADS_FILE: leads,
      THREEDVR_OPEN_LEAD_PAGE: '0',
    });

    assert.match(stdout, /NEXT LEAD/);
    assert.match(stdout, /Action: review/);
    assert.match(stdout, /Call or text this number/);
    assert.match(stdout, /\+18643602659/);
    assert.doesNotMatch(stdout, /open_url "\+18643602659"/);
    assert.match(stdout, /manual outreach first, then ask-track contact "Call Me LLC"/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('inbox daemon run-now prepends reply preview mode', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), '3dvr-inbox-daemon-'));
  const scriptDir = path.join(tmp, 'scripts');
  await mkdir(scriptDir, { recursive: true });

  const daemonScript = path.join(scriptDir, 'ask-inbox-daemon');
  const inboxScript = path.join(scriptDir, 'ask-inbox');
  const argsLog = path.join(tmp, 'args.log');
  const daemonSource = await readFile(path.join(__dirname, '..', 'thomas-agent', 'scripts', 'ask-inbox-daemon'), 'utf8');

  await writeFile(daemonScript, daemonSource);
  await writeFile(
    inboxScript,
    `#!/usr/bin/env bash
printf '%s\n' "$@" > "${argsLog}"
`,
  );
  await chmod(daemonScript, 0o755);
  await chmod(inboxScript, 0o755);

  await new Promise((resolve, reject) => {
    execFile(daemonScript, ['run-now', '--limit', '3'], {
      env: {
        ...process.env,
        PATH: `${scriptDir}:${process.env.PATH}`,
      },
    }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  const logged = await readFile(argsLog, 'utf8');

  assert.match(logged, /--reply-preview/);
  assert.match(logged, /--limit/);
  assert.match(logged, /3/);

  await rm(tmp, { recursive: true, force: true });
});
