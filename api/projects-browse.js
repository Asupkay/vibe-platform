/**
 * /projects - Browse all shipped projects
 * PET Green aesthetic (VIBE_HOUSE_STYLE.md)
 */

const fs = require('fs');
const path = require('path');

// Check if KV is configured
const KV_CONFIGURED = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

async function getKV() {
  if (!KV_CONFIGURED) return null;
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch (e) {
    return null;
  }
}

async function getApprovedProjects() {
  const kv = await getKV();
  if (kv) {
    const approved = await kv.get('vibe:approved_projects');
    return approved || [];
  }
  return [];
}

module.exports = async (req, res) => {
  try {
    // Load static projects from projects.json
    const projectsPath = path.join(process.cwd(), 'data/projects.json');
    const staticData = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
    const staticProjects = staticData.projects || [];

    // Load dynamic projects from KV
    const dynamicProjects = await getApprovedProjects();

    // Merge and dedupe by ID
    const projectsMap = new Map();
    [...staticProjects, ...dynamicProjects].forEach(p => {
      if (!projectsMap.has(p.id)) {
        projectsMap.set(p.id, p);
      }
    });
    const allProjects = Array.from(projectsMap.values());

    // Sort by date (newest first)
    allProjects.sort((a, b) => {
      const dateA = new Date(a.date || a.createdAt || 0);
      const dateB = new Date(b.date || b.createdAt || 0);
      return dateB - dateA;
    });

    // Apply filters from query params
    const { category, search } = req.query;
    let filteredProjects = allProjects;

    if (category) {
      filteredProjects = filteredProjects.filter(p => p.category === category);
    }

    if (search) {
      const query = search.toLowerCase();
      filteredProjects = filteredProjects.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        (p.creator && p.creator.toLowerCase().includes(query))
      );
    }

    // Category stats
    const categories = [
      { id: 'agents', name: 'AI Agents', icon: '🤖', color: '#00ff00' },
      { id: 'platform', name: 'Platforms', icon: '🏗️', color: '#6B8FFF' },
      { id: 'art', name: 'Art', icon: '🎨', color: '#ff6b6b' },
      { id: 'tools', name: 'Tools', icon: '🛠️', color: '#ffd700' },
      { id: 'infrastructure', name: 'Infrastructure', icon: '⚙️', color: '#888888' },
      { id: 'culture', name: 'Culture', icon: '🌍', color: '#ff69b4' },
      { id: 'education', name: 'Education', icon: '📚', color: '#4ecdc4' }
    ];

    const categoryCounts = {};
    allProjects.forEach(p => {
      categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
    });

    // Render HTML with PET Green design
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>/vibe projects - ${filteredProjects.length} shipped</title>
  <style>
    /* PET Green Design System */
    :root {
      --bg: #000000;
      --fg: #00FF41;
      --fg-dim: #00AA2B;
      --fg-bright: #88FFA8;
      --glow: rgba(0, 255, 65, 0.3);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background: var(--bg);
      color: var(--fg);
      font-family: 'Courier New', Monaco, 'SF Mono', monospace;
      font-size: 14px;
      letter-spacing: 0.05em;
      line-height: 1.6;
      padding: 20px;
      max-width: 1200px;
      margin: 0 auto;
      position: relative;
    }

    /* Scan lines overlay */
    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: repeating-linear-gradient(
        0deg,
        rgba(0, 255, 65, 0.03) 0px,
        transparent 1px,
        transparent 2px,
        rgba(0, 255, 65, 0.03) 3px
      );
      pointer-events: none;
      z-index: 9999;
    }

    /* Text glow */
    body, h1, h2, h3, a {
      text-shadow: 0 0 2px var(--glow);
    }

    /* Header */
    header {
      border: 1px solid var(--fg);
      padding: 15px;
      margin-bottom: 30px;
      position: relative;
    }

    h1 {
      font-size: 24px;
      margin-bottom: 10px;
      color: var(--fg-bright);
    }

    .subtitle {
      color: var(--fg-dim);
      font-size: 12px;
    }

    /* Box drawing characters */
    .box {
      border: 1px solid var(--fg);
      padding: 15px;
      margin-bottom: 20px;
    }

    /* Categories */
    .categories {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 30px;
    }

    .category-pill {
      background: transparent;
      border: 1px solid var(--fg);
      color: var(--fg);
      padding: 8px 16px;
      text-decoration: none;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .category-pill:hover,
    .category-pill.active {
      background: var(--fg);
      color: var(--bg);
      box-shadow: 0 0 10px var(--glow);
    }

    .category-count {
      opacity: 0.7;
      margin-left: 8px;
    }

    /* Search */
    .search-box {
      width: 100%;
      max-width: 600px;
      margin-bottom: 30px;
    }

    input[type="text"] {
      width: 100%;
      background: var(--bg);
      border: 1px solid var(--fg);
      color: var(--fg);
      padding: 12px;
      font-family: inherit;
      font-size: 14px;
      letter-spacing: inherit;
    }

    input[type="text"]:focus {
      outline: none;
      box-shadow: 0 0 10px var(--glow);
    }

    /* Project Grid */
    .projects-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }

    .project-card {
      border: 1px solid var(--fg);
      padding: 15px;
      transition: all 0.2s;
      cursor: pointer;
    }

    .project-card:hover {
      box-shadow: 0 0 15px var(--glow);
      transform: translateY(-2px);
    }

    .project-name {
      font-size: 16px;
      color: var(--fg-bright);
      margin-bottom: 8px;
      font-weight: bold;
    }

    .project-description {
      font-size: 12px;
      color: var(--fg);
      margin-bottom: 12px;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .project-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: var(--fg-dim);
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--fg-dim);
    }

    .project-creator {
      text-decoration: none;
      color: var(--fg);
    }

    .project-creator:hover {
      color: var(--fg-bright);
    }

    .project-badge {
      background: var(--fg);
      color: var(--bg);
      padding: 2px 6px;
      font-size: 10px;
      margin-left: 8px;
    }

    /* Links */
    a {
      color: var(--fg);
      text-decoration: underline;
    }

    a:hover {
      color: var(--fg-bright);
    }

    /* Footer status bar */
    footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: var(--bg);
      border-top: 1px solid var(--fg);
      padding: 10px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      z-index: 1000;
    }

    .status-left {
      color: var(--fg-dim);
    }

    .status-right a {
      margin-left: 20px;
    }

    /* Empty state */
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--fg-dim);
    }

    @media (max-width: 768px) {
      .projects-grid {
        grid-template-columns: 1fr;
      }

      footer {
        flex-direction: column;
        gap: 10px;
        text-align: center;
      }

      .categories {
        justify-content: center;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>/vibe projects</h1>
    <div class="subtitle">${filteredProjects.length} projects shipped${category ? ` • ${categories.find(c => c.id === category)?.name}` : ''}${search ? ` • search: "${search}"` : ''}</div>
  </header>

  <!-- Search -->
  <div class="search-box">
    <input type="text" id="search" placeholder="Search projects..." value="${search || ''}" />
  </div>

  <!-- Categories -->
  <div class="categories">
    <a href="/projects" class="category-pill ${!category ? 'active' : ''}">
      All <span class="category-count">${allProjects.length}</span>
    </a>
    ${categories.map(cat => `
      <a href="/projects?category=${cat.id}" class="category-pill ${category === cat.id ? 'active' : ''}">
        ${cat.icon} ${cat.name} <span class="category-count">${categoryCounts[cat.id] || 0}</span>
      </a>
    `).join('')}
  </div>

  <!-- Projects Grid -->
  ${filteredProjects.length === 0 ? `
    <div class="empty-state">
      <div>┌──────────────────────────────┐</div>
      <div>│  No projects found           │</div>
      <div>│  Try a different filter      │</div>
      <div>└──────────────────────────────┘</div>
    </div>
  ` : `
    <div class="projects-grid">
      ${filteredProjects.map(project => `
        <div class="project-card" onclick="window.open('${project.url}', '_blank')">
          <div class="project-name">${project.name}</div>
          <div class="project-description">${project.description}</div>
          <div class="project-meta">
            <span>
              ${project.creator ? `
                <a href="/u/${project.creator}" class="project-creator" onclick="event.stopPropagation()">
                  @${project.creator}
                </a>
              ` : 'anonymous'}
              ${project.verified ? '<span class="project-badge">verified</span>' : ''}
            </span>
            <span>${project.dateDisplay || new Date(project.date || project.createdAt).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `}

  <!-- Footer Status Bar -->
  <footer>
    <div class="status-left">
      F1=help F2=submit F3=profile
    </div>
    <div class="status-right">
      <a href="/">home</a>
      <a href="/api/vibe">vibe</a>
      <a href="/style-demo">style</a>
    </div>
  </footer>

  <script>
    // Live search
    const searchInput = document.getElementById('search');
    let searchTimeout;

    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const value = e.target.value.trim();
        const url = new URL(window.location);
        if (value) {
          url.searchParams.set('search', value);
        } else {
          url.searchParams.delete('search');
        }
        window.location.href = url.toString();
      }, 500);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'F1') {
        e.preventDefault();
        window.open('https://slashvibe.dev', '_blank');
      }
      if (e.key === 'F2') {
        e.preventDefault();
        alert('POST to /api/projects to submit a project');
      }
      if (e.key === 'F3') {
        e.preventDefault();
        const creator = prompt('Enter handle:');
        if (creator) window.location.href = \`/u/\${creator}\`;
      }
    });
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.status(200).send(html);

  } catch (error) {
    console.error('Error rendering /projects:', error);
    res.status(500).json({ error: 'Failed to load projects', details: error.message });
  }
};
