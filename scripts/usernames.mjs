// Writes usernames.txt (gitignored): every account's username and join date. Never passwords.
// Run: npm run usernames   (needs SUPABASE_SECRET_KEY in .env; no VITE_ prefix so it never ships to the site)
import { writeFileSync } from 'node:fs';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key || key.startsWith('paste')) {
  console.error('add SUPABASE_SECRET_KEY to .env first (Supabase → Project Settings → API Keys → secret key)');
  process.exit(1);
}

const users = [];
for (let page = 1; ; page++) {
  const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=1000`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    console.error(`Supabase said ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const batch = (await res.json()).users ?? [];
  users.push(...batch);
  if (batch.length < 1000) break;
}

users.sort((a, b) => a.created_at.localeCompare(b.created_at));
const lines = users.map((u) => {
  const name = u.user_metadata?.username ?? u.email?.split('@')[0] ?? '?';
  return `${name.padEnd(26)}joined ${u.created_at.slice(0, 10)}`;
});
const out = `${users.length} accounts (as of ${new Date().toLocaleString()})\n\n${lines.join('\n')}\n`;
writeFileSync('usernames.txt', out);
console.log(`wrote usernames.txt (${users.length} accounts)`);
