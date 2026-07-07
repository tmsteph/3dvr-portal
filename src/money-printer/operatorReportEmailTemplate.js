function clean(value) {
  return String(value || '').trim();
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function button(label, href, color = '#0f766e') {
  if (!href) return '';
  return `<a href="${escapeHtml(href)}" style="display:inline-block;margin:8px 8px 0 0;padding:12px 16px;border-radius:8px;background:${color};color:#ffffff;text-decoration:none;font-weight:700;">${escapeHtml(label)}</a>`;
}

function mailtoUrl({ to, subject, body }) {
  if (!to) return '';
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  return `mailto:${encodeURIComponent(to)}?${params.toString()}`;
}

function summarizeReport(report = {}) {
  const risk = clean(report.selfReview?.risk || 'unknown');
  const merged = Boolean(report.merge?.merged);
  const prUrl = clean(report.pr?.url);
  const failed = Boolean(report.emailReport?.failed);
  const blocked = risk === 'RED' || (report.pr?.blocked) || failed;
  const needsReview = risk === 'YELLOW' || (prUrl && !merged);
  const actionRequired = blocked || needsReview;
  return {
    risk,
    merged,
    prUrl,
    actionRequired,
    headline: actionRequired ? 'Please review this' : 'Handled. No action needed.',
    status: blocked ? 'Blocked' : needsReview ? 'Review needed' : 'Handled',
    summary: blocked
      ? 'Money Printer stopped or hit a failure. Check the buttons below.'
      : needsReview
        ? 'Money Printer prepared something, but it needs a human decision before it moves.'
        : 'Money Printer completed the safe loop. A GREEN change was merged or handled.',
    nextAction: blocked
      ? 'Open the PR or server log and decide whether to fix, skip, or rerun.'
      : needsReview
        ? 'Open the PR, review the change, then merge or close it.'
        : 'Nothing. You can ignore this email unless you want to inspect the run.',
    color: blocked ? '#b91c1c' : needsReview ? '#b45309' : '#0f766e'
  };
}

export function buildOperatorReportEmailHtml({ report = {}, text = '', to = '' } = {}) {
  const summary = summarizeReport(report);
  const repoUrl = 'https://github.com/tmsteph/3dvr-portal';
  const actionsUrl = `${repoUrl}/actions`;
  const portalUrl = 'https://portal.3dvr.tech/money-printer/';
  const replyUrl = mailtoUrl({
    to,
    subject: `Money Printer report: ${summary.status}`,
    body: [
      'I reviewed the Money Printer report.',
      `Risk: ${summary.risk}`,
      summary.prUrl ? `PR: ${summary.prUrl}` : '',
      '',
      'Decision / note:'
    ].filter(Boolean).join('\n')
  });

  const primaryButtons = [
    button(summary.prUrl && !summary.merged ? 'Review PR' : summary.prUrl ? 'Open PR' : '', summary.prUrl, summary.color),
    button('Open Money Printer', portalUrl, '#1d4ed8'),
    button('View GitHub Actions', actionsUrl, '#334155'),
    button('Reply with decision', replyUrl, '#6d28d9')
  ].join('');

  const verification = Array.isArray(report.verification?.commands)
    ? report.verification.commands.map(item => `<li>${escapeHtml(item.command)}: <strong>${item.ok ? 'pass' : 'fail'}</strong></li>`).join('')
    : '<li>No verification commands recorded.</li>';

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f8fafc;color:#0f172a;font-family:Arial,sans-serif;">
    <div style="max-width:680px;margin:0 auto;padding:24px;">
      <div style="border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;padding:20px;">
        <p style="margin:0 0 8px;color:#475569;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;">3DVR Money Printer</p>
        <h1 style="margin:0 0 12px;font-size:28px;line-height:1.1;">${escapeHtml(summary.headline)}</h1>
        <div style="display:inline-block;margin:0 0 16px;padding:6px 10px;border-radius:999px;background:${summary.color};color:#ffffff;font-weight:700;">${escapeHtml(summary.status)} · ${escapeHtml(summary.risk)}</div>
        <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">${escapeHtml(summary.summary)}</p>
        <div style="margin:0 0 16px;padding:14px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;">
          <p style="margin:0 0 4px;color:#475569;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;">One thing to do</p>
          <p style="margin:0;font-size:17px;line-height:1.45;font-weight:700;">${escapeHtml(summary.nextAction)}</p>
        </div>
        <div>${primaryButtons}</div>
      </div>

      <div style="margin-top:16px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;padding:20px;">
        <h2 style="margin:0 0 12px;font-size:18px;">What happened</h2>
        <ul style="margin:0;padding-left:20px;line-height:1.7;">
          <li>Command: <strong>${escapeHtml(report.command || 'unknown')}</strong></li>
          <li>Auto-merge allowed: <strong>${report.selfReview?.autoMergeAllowed ? 'yes' : 'no'}</strong></li>
          <li>Merged: <strong>${summary.merged ? 'yes' : 'no'}</strong></li>
          <li>Branch: <strong>${escapeHtml(report.branch || '')}</strong></li>
        </ul>
      </div>

      <div style="margin-top:16px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;padding:20px;">
        <h2 style="margin:0 0 12px;font-size:18px;">Checks</h2>
        <ul style="margin:0;padding-left:20px;line-height:1.7;">${verification}</ul>
      </div>

      <details style="margin-top:16px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;padding:16px;">
        <summary style="cursor:pointer;font-weight:700;">Plain report</summary>
        <pre style="white-space:pre-wrap;font-size:13px;line-height:1.5;color:#334155;">${escapeHtml(text)}</pre>
      </details>
    </div>
  </body>
</html>`;
}
