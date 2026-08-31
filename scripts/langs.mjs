// Renders an animated "most used languages" bar chart as SVG (light + dark).
// No dependencies: Node 20 fetch + GITHUB_TOKEN from the workflow.
import { writeFileSync, mkdirSync } from "node:fs";

const user = process.env.GH_USER;
const query = `{ user(login:"${user}") { repositories(first:100, ownerAffiliations:OWNER,
  isFork:false, privacy:PUBLIC) { nodes { languages(first:10,
  orderBy:{field:SIZE,direction:DESC}) { edges { size node { name color } } } } } } }`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
const body = await res.json();
if (body.errors) throw new Error(JSON.stringify(body.errors));

const totals = new Map();
for (const repo of body.data.user.repositories.nodes)
  for (const { size, node } of repo.languages.edges) {
    const cur = totals.get(node.name) ?? { size: 0, color: node.color };
    cur.size += size;
    totals.set(node.name, cur);
  }

const top = [...totals].sort((a, b) => b[1].size - a[1].size).slice(0, 6);
const sum = top.reduce((acc, [, v]) => acc + v.size, 0);
if (!sum) throw new Error("no language data");

const W = 480, PAD = 20, ROW = 30, BAR_X = 118, BAR_W = 292;
const H = PAD * 2 + 24 + top.length * ROW;

const render = ({ fg, muted, track }) => {
  const bars = top.map(([name, v], i) => {
    const pct = (100 * v.size) / sum;
    const w = Math.max(3, (BAR_W * pct) / 100).toFixed(1);
    const y = PAD + 24 + i * ROW;
    return { name, pct, w, y, i, color: v.color || muted };
  });

  // Animate transform, not width: Chromium's SVG-as-image lifecycle does not drive
  // layout for geometry properties, so an animated `width` strands at zero inside
  // GitHub's <img> embed. Stagger lives inside the keyframes rather than in
  // animation-delay, and scaleX(0) is never an inline style -- so if the animation
  // is dropped entirely, the bar still renders at its full attribute width.
  const keyframes = bars
    .map((b) => {
      const start = b.i * 7;
      return `@keyframes g${b.i}{0%,${start}%{transform:scaleX(0)}${start + 50}%,100%{transform:scaleX(1)}}`;
    })
    .join("");

  const rows = bars
    .map(
      (b) => `<text x="${PAD}" y="${b.y + 11}" class="n">${b.name}</text>
<rect x="${BAR_X}" y="${b.y + 2}" width="${BAR_W}" height="10" rx="5" fill="${track}"/>
<rect x="${BAR_X}" y="${b.y + 2}" width="${b.w}" height="10" rx="5" fill="${b.color}"
 style="transform-box:fill-box;transform-origin:left center;animation:g${b.i} 1.6s cubic-bezier(.22,.61,.36,1) forwards"/>
<text x="${W - PAD}" y="${b.y + 11}" class="p">${b.pct.toFixed(1)}%</text>`
    )
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Most used languages">
<style>
text{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Ubuntu,sans-serif}
.h{font-size:15px;font-weight:600;fill:${fg}}
.n{font-size:12px;fill:${fg}}
.p{font-size:12px;fill:${muted};text-anchor:end}
${keyframes}
</style>
<text x="${PAD}" y="${PAD + 12}" class="h">Most used languages</text>
${rows}
</svg>`;
};

mkdirSync("dist", { recursive: true });
writeFileSync("dist/langs.svg", render({ fg: "#24292f", muted: "#57606a", track: "#eaeef2" }));
writeFileSync("dist/langs-dark.svg", render({ fg: "#c9d1d9", muted: "#8b949e", track: "#30363d" }));
console.log(`ok: ${top.length} languages, top=${top[0][0]}`);
