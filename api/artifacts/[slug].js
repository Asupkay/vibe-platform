/**
 * GET /a/:slug - View artifact
 * Renders artifact as HTML with social context and provenance
 */

const { kv } = await import('@vercel/kv');

function renderMarkdown(md) {
  return md
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

function renderBlocks(blocks) {
  let html = '';

  for (const block of blocks) {
    if (block.type === 'heading') {
      const level = block.level || 2;
      html += `<h${level}>${block.text}</h${level}>\n`;
    }
    else if (block.type === 'paragraph') {
      html += `<p>${renderMarkdown(block.markdown)}</p>\n`;
    }
    else if (block.type === 'bullets') {
      html += '<ul>\n';
      for (const item of block.items) {
        html += `<li>${item}</li>\n`;
      }
      html += '</ul>\n';
    }
    else if (block.type === 'places' && block.items) {
      html += '<div class="places">\n';
      for (const place of block.items) {
        html += `<div class="place-card">\n`;
        html += `<h3>${place.name}</h3>\n`;
        if (place.neighborhood) {
          html += `<p class="neighborhood">${place.neighborhood}</p>\n`;
        }
        html += `<p class="why">${place.why}</p>\n`;
        if (place.link) {
          html += `<p><a href="${place.link}" target="_blank">View →</a></p>\n`;
        }
        html += `</div>\n`;
      }
      html += '</div>\n';
    }
    else if (block.type === 'schedule' && block.items) {
      html += '<div class="schedule">\n';
      for (const item of block.items) {
        html += `<div class="schedule-item">\n`;
        if (item.time) {
          html += `<span class="time">${item.time}</span>`;
        }
        html += `<span class="event">${item.event}</span>\n`;
        html += `</div>\n`;
      }
      html += '</div>\n';
    }
    else if (block.type === 'callout') {
      const style = block.style || 'info';
      html += `<div class="callout callout-${style}">\n`;
      html += `<p>${block.text}</p>\n`;
      html += `</div>\n`;
    }
    else if (block.type === 'checklist' && block.items) {
      html += '<div class="checklist">\n';
      for (const item of block.items) {
        const checked = item.checked ? 'checked' : '';
        html += `<label><input type="checkbox" ${checked}> ${item.text}</label>\n`;
      }
      html += '</div>\n';
    }
    else if (block.type === 'attribution') {
      html += `<div class="attribution">\n`;
      html += `<p>Created by @${block.from}`;
      if (block.to) {
        html += ` for @${block.to}`;
      }
      html += `</p>\n`;
      if (block.context) {
        html += `<p class="context">${block.context}</p>\n`;
      }
      html += `</div>\n`;
    }
  }

  return html;
}

function renderArtifactPage(artifact) {
  const blocksHtml = renderBlocks(artifact.content.blocks);
  const createdDate = new Date(artifact.created_at).toLocaleDateString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${artifact.title} | /vibe</title>
  <meta name="description" content="A ${artifact.template} artifact created by @${artifact.created_by}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      background: #f5f5f5;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      border-bottom: 2px solid #e5e5e5;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
    }
    .meta {
      display: flex;
      gap: 20px;
      font-size: 0.9em;
      color: #666;
    }
    .badge {
      display: inline-block;
      background: #6B8FFF;
      color: white;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 0.85em;
      text-transform: uppercase;
      font-weight: 600;
    }
    .content h2 { margin-top: 30px; margin-bottom: 15px; }
    .content h3 { margin-top: 20px; margin-bottom: 10px; }
    .content p { margin-bottom: 15px; }
    .content ul { margin-left: 20px; margin-bottom: 15px; }
    .content li { margin-bottom: 5px; }
    .places {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
      margin: 20px 0;
    }
    .place-card {
      border: 1px solid #e5e5e5;
      padding: 20px;
      border-radius: 6px;
      background: #fafafa;
    }
    .place-card h3 { margin-top: 0; color: #6B8FFF; }
    .place-card .neighborhood {
      font-size: 0.9em;
      color: #666;
      margin-bottom: 10px;
    }
    .place-card .why {
      font-style: italic;
      color: #444;
    }
    .schedule {
      background: #fafafa;
      padding: 20px;
      border-radius: 6px;
      margin: 20px 0;
    }
    .schedule-item {
      display: flex;
      gap: 15px;
      padding: 10px 0;
      border-bottom: 1px solid #e5e5e5;
    }
    .schedule-item:last-child { border-bottom: none; }
    .schedule-item .time {
      font-weight: 600;
      color: #6B8FFF;
      min-width: 150px;
    }
    .callout {
      padding: 15px 20px;
      border-radius: 6px;
      margin: 20px 0;
      border-left: 4px solid;
    }
    .callout-info { background: #e8f4ff; border-color: #6B8FFF; }
    .callout-warning { background: #fff3e0; border-color: #ff9800; }
    .checklist {
      background: #fafafa;
      padding: 20px;
      border-radius: 6px;
      margin: 20px 0;
    }
    .checklist label {
      display: block;
      padding: 8px 0;
      cursor: pointer;
    }
    .checklist input { margin-right: 10px; }
    .attribution {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #e5e5e5;
      color: #666;
      font-size: 0.9em;
    }
    .attribution .context {
      font-style: italic;
      margin-top: 5px;
    }
    .footer {
      margin-top: 40px;
      text-align: center;
      color: #999;
      font-size: 0.85em;
    }
    a { color: #6B8FFF; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${artifact.title}</h1>
      <div class="meta">
        <span class="badge">${artifact.template}</span>
        <span>By @${artifact.created_by}</span>
        ${artifact.created_for ? `<span>For @${artifact.created_for}</span>` : ''}
        <span>${createdDate}</span>
      </div>
    </div>

    <div class="content">
      ${blocksHtml}
    </div>

    <div class="footer">
      <p>Created with <a href="https://slashvibe.dev">/vibe</a></p>
    </div>
  </div>
</body>
</html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { slug } = req.query;

    if (!slug) {
      return res.status(400).json({ error: 'Missing slug parameter' });
    }

    if (!kv) {
      return res.status(503).send('<h1>Service Unavailable</h1><p>Storage not configured</p>');
    }

    const artifactIds = await kv.smembers('artifacts:all') || [];
    let artifact = null;

    for (const id of artifactIds) {
      const a = await kv.get(`artifact:${id}`);
      if (a && a.slug === slug) {
        artifact = a;
        break;
      }
    }

    if (!artifact) {
      return res.status(404).send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Artifact Not Found</title>
</head>
<body style="font-family: sans-serif; text-align: center; padding: 100px 20px;">
  <h1>404 - Artifact Not Found</h1>
  <p>This artifact may have expired or been removed.</p>
  <p><a href="https://slashvibe.dev">← Back to /vibe</a></p>
</body>
</html>
      `);
    }

    if (artifact.expires_at) {
      const expiryDate = new Date(artifact.expires_at);
      if (expiryDate < new Date()) {
        return res.status(410).send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Artifact Expired</title>
</head>
<body style="font-family: sans-serif; text-align: center; padding: 100px 20px;">
  <h1>Artifact Expired</h1>
  <p>This artifact expired on ${expiryDate.toLocaleDateString()}.</p>
  <p><a href="https://slashvibe.dev">← Back to /vibe</a></p>
</body>
</html>
        `);
      }
    }

    const html = renderArtifactPage(artifact);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);

  } catch (error) {
    console.error('GET /api/artifacts/[slug] error:', error);
    return res.status(500).send('<h1>Error</h1><p>Failed to load artifact</p>');
  }
}
