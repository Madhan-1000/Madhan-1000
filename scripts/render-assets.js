// Simple GitHub stat renderer without external card services.
// Requires: Node 18+ for global fetch. Uses GITHUB_TOKEN to avoid rate limits.

const fs = require('fs');
const path = require('path');

const username = process.env.GITHUB_USERNAME || 'Madhan-1000';
const token = process.env.GITHUB_TOKEN;
const assetsDir = path.join(__dirname, '..', 'assets');

async function fetchJSON(url, options = {}) {
  const headers = { 'User-Agent': 'asset-renderer', Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();
  return res.text();
}

async function fetchUser() {
  return fetchJSON(`https://api.github.com/users/${username}`);
}

async function fetchAllRepos() {
  let page = 1;
  const repos = [];
  while (true) {
    const batch = await fetchJSON(`https://api.github.com/users/${username}/repos?per_page=100&page=${page}`);
    repos.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return repos;
}

async function fetchLanguages(repos) {
  const totals = {};
  for (const repo of repos) {
    const langs = await fetchJSON(repo.languages_url);
    for (const [lang, bytes] of Object.entries(langs)) {
      totals[lang] = (totals[lang] || 0) + bytes;
    }
  }
  return totals;
}

async function fetchContributions() {
  const to = new Date();
  const from = new Date(to.getTime() - 365 * 24 * 60 * 60 * 1000);
  const body = {
    query: `query($login:String!,$from:DateTime!,$to:DateTime!){\n      user(login:$login){\n        contributionsCollection(from:$from,to:$to){\n          contributionCalendar{\n            totalContributions\n            weeks{\n              contributionDays{date contributionCount}\n            }\n          }\n        }\n      }\n    }`,
    variables: { login: username, from: from.toISOString(), to: to.toISOString() }
  };
  const res = await fetchJSON('https://api.github.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const cal = res.data?.user?.contributionsCollection?.contributionCalendar;
  if (!cal) throw new Error('Missing contribution calendar');
  const days = cal.weeks.flatMap(w => w.contributionDays).map(d => ({ date: d.date, count: d.contributionCount }));
  days.sort((a, b) => new Date(a.date) - new Date(b.date));
  return { total: cal.totalContributions, days };
}

function computeStreak(days) {
  let best = 0;
  let current = 0;
  let currentStart = null;
  let bestRange = null;
  let prevDate = null;
  for (const d of days) {
    const date = new Date(d.date);
    const hasContrib = d.count > 0;
    const isNextDay = prevDate && (date - prevDate === 24 * 60 * 60 * 1000);
    if (hasContrib && (!prevDate || isNextDay)) {
      current = current + 1;
      if (!currentStart) currentStart = date;
    } else if (hasContrib) {
      current = 1;
      currentStart = date;
    } else {
      current = 0;
      currentStart = null;
    }
    if (current > best) {
      best = current;
      bestRange = [currentStart, date];
    }
    prevDate = date;
  }
  const currentEnd = current > 0 ? prevDate : null;
  return { current, best, currentRange: currentStart && currentEnd ? [currentStart, currentEnd] : null, bestRange };
}

function renderStatsCard({ user, totalContrib, totalStars }) {
  const width = 500;
  const height = 180;
  const lines = [
    `Repos: ${user.public_repos}`,
    `Followers: ${user.followers}`,
    `Stars (public): ${totalStars}`,
    `Total contributions (1y): ${totalContrib}`
  ];
  const lineY = [70, 100, 130, 160];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="GitHub stats">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop stop-color="#0f2027" offset="0"/>
      <stop stop-color="#00ffcc" offset="1"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="url(#bg)" opacity="0.18"/>
  <text x="24" y="36" fill="#00ffcc" font-family="'Fira Code', Consolas, monospace" font-size="20" font-weight="600">GitHub Stats — ${user.login}</text>
  ${lines.map((t, i) => `<text x="32" y="${lineY[i]}" fill="#e8f7f2" font-family="'Fira Code', Consolas, monospace" font-size="18">${t}</text>`).join('\n  ')}
</svg>`;
}

function renderTopLangsCard(langTotals) {
  const entries = Object.entries(langTotals);
  const sum = entries.reduce((a, [, v]) => a + v, 0) || 1;
  const top = entries.sort((a, b) => b[1] - a[1]).slice(0, 6).map(([lang, bytes]) => ({ lang, pct: (bytes / sum) * 100 }));
  const width = 500;
  const height = 220;
  const barWidth = width - 120;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Top languages">
  <defs>
    <linearGradient id="bg2" x1="0" x2="1" y1="0" y2="1">
      <stop stop-color="#000000" offset="0"/>
      <stop stop-color="#0f2027" offset="0.5"/>
      <stop stop-color="#00ffcc" offset="1"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="url(#bg2)" opacity="0.18"/>
  <text x="24" y="36" fill="#00ffcc" font-family="'Fira Code', Consolas, monospace" font-size="20" font-weight="600">Top Languages — ${username}</text>
  ${top.map((entry, i) => {
    const y = 70 + i * 28;
    const bar = Math.max(6, (entry.pct / 100) * barWidth);
    return `<text x="24" y="${y + 14}" fill="#e8f7f2" font-family="'Fira Code', Consolas, monospace" font-size="14">${entry.lang}</text>
    <rect x="120" y="${y}" width="${bar}" height="16" rx="4" fill="#00ffcc" opacity="0.7"/>
    <text x="${120 + bar + 8}" y="${y + 14}" fill="#c8ffef" font-family="'Fira Code', Consolas, monospace" font-size="14">${entry.pct.toFixed(1)}%</text>`;
  }).join('\n  ')}
</svg>`;
}

function renderStreakCard(streak) {
  const width = 500;
  const height = 180;
  const lines = [
    `Current streak: ${streak.current} day${streak.current === 1 ? '' : 's'}`,
    `Best streak: ${streak.best} day${streak.best === 1 ? '' : 's'}`
  ];
  const rangeText = streak.currentRange ? `${fmtDate(streak.currentRange[0])} → ${fmtDate(streak.currentRange[1])}` : 'No current streak';
  const bestRangeText = streak.bestRange ? `${fmtDate(streak.bestRange[0])} → ${fmtDate(streak.bestRange[1])}` : 'No streak recorded';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Contribution streaks">
  <defs>
    <linearGradient id="bg3" x1="0" x2="1" y1="0" y2="1">
      <stop stop-color="#00100f" offset="0"/>
      <stop stop-color="#00ffcc" offset="1"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="url(#bg3)" opacity="0.18"/>
  <text x="24" y="36" fill="#00ffcc" font-family="'Fira Code', Consolas, monospace" font-size="20" font-weight="600">Contribution Streaks — ${username}</text>
  <text x="24" y="74" fill="#e8f7f2" font-family="'Fira Code', Consolas, monospace" font-size="18">${lines[0]}</text>
  <text x="24" y="98" fill="#a8e6d6" font-family="'Fira Code', Consolas, monospace" font-size="14">${rangeText}</text>
  <text x="24" y="134" fill="#e8f7f2" font-family="'Fira Code', Consolas, monospace" font-size="18">${lines[1]}</text>
  <text x="24" y="158" fill="#a8e6d6" font-family="'Fira Code', Consolas, monospace" font-size="14">${bestRangeText}</text>
</svg>`;
}

function renderActivityCard(weeks) {
  const width = 900;
  const height = 260;
  if (!weeks.length) weeks.push(0);
  const max = Math.max(...weeks, 1);
  const points = weeks.map((v, i) => {
    const x = 30 + (i / Math.max(weeks.length - 1, 1)) * (width - 60);
    const y = height - 40 - (v / max) * (height - 80);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Activity graph">
  <defs>
    <linearGradient id="bg4" x1="0" x2="1" y1="0" y2="1">
      <stop stop-color="#000000" offset="0"/>
      <stop stop-color="#0f2027" offset="0.5"/>
      <stop stop-color="#00ffcc" offset="1"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="url(#bg4)" opacity="0.18"/>
  <text x="24" y="36" fill="#00ffcc" font-family="'Fira Code', Consolas, monospace" font-size="20" font-weight="600">Activity (weekly commits) — ${username}</text>
  <polyline fill="none" stroke="#00ffcc" stroke-width="3" points="${points}" />
  <line x1="30" y1="${height - 40}" x2="${width - 30}" y2="${height - 40}" stroke="#00ffcc" stroke-width="1" opacity="0.4"/>
  <line x1="30" y1="40" x2="30" y2="${height - 40}" stroke="#00ffcc" stroke-width="1" opacity="0.4"/>
  <text x="${width - 34}" y="${height - 46}" fill="#a8e6d6" font-family="'Fira Code', Consolas, monospace" font-size="12" text-anchor="end">${weeks.length} weeks</text>
  <text x="34" y="56" fill="#a8e6d6" font-family="'Fira Code', Consolas, monospace" font-size="12">max ${max}</text>
</svg>`;
}

function renderBadge(label) {
  const width = 170;
  const height = 42;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label} badge">
  <rect x="0" y="0" width="${width}" height="${height}" rx="8" fill="#00ffcc" />
  <text x="50%" y="26" fill="#000000" font-family="'Fira Code', Consolas, monospace" font-size="16" font-weight="700" text-anchor="middle">${label}</text>
</svg>`;
}

function renderLeetCodePlaceholder() {
  const width = 500;
  const height = 160;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="LeetCode placeholder">
  <rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="#111" opacity="0.7"/>
  <text x="24" y="64" fill="#00ffcc" font-family="'Fira Code', Consolas, monospace" font-size="20" font-weight="600">LeetCode card</text>
  <text x="24" y="100" fill="#a8e6d6" font-family="'Fira Code', Consolas, monospace" font-size="14">Add API-backed rendering when available.</text>
</svg>`;
}

function renderStaticHeader() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="280" viewBox="0 0 900 280" role="img" aria-label="Header">
  <defs>
    <linearGradient id="grad" x1="0" x2="1" y1="0" y2="1">
      <stop stop-color="#000000" offset="0"/>
      <stop stop-color="#0f2027" offset="0.5"/>
      <stop stop-color="#00ffcc" offset="1"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="900" height="280" fill="#000" />
  <path d="M0 200 C 200 260, 400 180, 600 220 C 750 250, 850 200, 900 230 L 900 280 L 0 280 Z" fill="url(#grad)" opacity="0.6"/>
  <text x="50%" y="110" fill="#00ffcc" font-size="64" font-family="'Fira Code', Consolas, monospace" text-anchor="middle" font-weight="700">MADHAN</text>
  <text x="50%" y="160" fill="#a8e6d6" font-size="20" font-family="'Fira Code', Consolas, monospace" text-anchor="middle">Full Stack Web Developer | Problem Solver</text>
</svg>`;
}

function renderStaticFooter() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="90" viewBox="0 0 900 90" role="img" aria-label="Footer">
  <defs>
    <linearGradient id="grad2" x1="0" x2="1" y1="0" y2="1">
      <stop stop-color="#000000" offset="0"/>
      <stop stop-color="#0f2027" offset="0.5"/>
      <stop stop-color="#00ffcc" offset="1"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="900" height="90" fill="url(#grad2)" opacity="0.8"/>
  <text x="50%" y="55" fill="#ffffff" font-size="24" font-family="'Fira Code', Consolas, monospace" text-anchor="middle">Thanks for visiting</text>
</svg>`;
}

function renderTyping() {
  const lines = [
    'Aiming to become the strongest programmer on planet.',
    'Constantly learning new things',
    'Competitive programming till my memory runs out',
    'Building projects inspired from creative thoughts.'
  ];
  const width = 750;
  const height = 80;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Typing lines">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#000" opacity="0.6" rx="8"/>
  <text x="16" y="28" fill="#00ffcc" font-family="'Fira Code', Consolas, monospace" font-size="18">${lines[0]}</text>
  <text x="16" y="50" fill="#a8e6d6" font-family="'Fira Code', Consolas, monospace" font-size="16">${lines[1]}</text>
  <text x="16" y="70" fill="#a8e6d6" font-family="'Fira Code', Consolas, monospace" font-size="16">${lines[2]}</text>
</svg>`;
}

function fmtDate(d) {
  const yyyy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function main() {
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
  const user = await fetchUser();
  const repos = await fetchAllRepos();
  const langTotals = await fetchLanguages(repos);
  const contrib = await fetchContributions();
  const streak = computeStreak(contrib.days);
  const totalStars = repos.reduce((a, r) => a + (r.stargazers_count || 0), 0);
  const weekly = []; // sum per calendar week
  let bucket = 0;
  for (let i = 0; i < contrib.days.length; i++) {
    bucket += contrib.days[i].count;
    if ((i + 1) % 7 === 0) {
      weekly.push(bucket);
      bucket = 0;
    }
  }
  if (bucket > 0) weekly.push(bucket);

  const files = {
    'header.svg': renderStaticHeader(),
    'footer.svg': renderStaticFooter(),
    'typing.svg': renderTyping(),
    'github-stats.svg': renderStatsCard({ user, totalContrib: contrib.total, totalStars }),
    'top-langs.svg': renderTopLangsCard(langTotals),
    'streak.svg': renderStreakCard(streak),
    'activity.svg': renderActivityCard(weekly),
    'badge-linkedin.svg': renderBadge('LinkedIn'),
    'badge-gmail.svg': renderBadge('Gmail'),
    'badge-portfolio.svg': renderBadge('Portfolio'),
    'leetcode.svg': renderLeetCodePlaceholder()
  };

  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(assetsDir, name), content, 'utf8');
  }
}

main().catch(err => {
  console.error('Failed to render assets:', err.message);
  process.exit(1);
});
