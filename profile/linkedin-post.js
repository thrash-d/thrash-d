// Builds the profile README's LinkedIn post of the week.
//
//   node profile/linkedin-post.js pick <all-possible-linkedin-posts dir> <blocklist file> <out dir>
//   node profile/linkedin-post.js render <out dir> <vale JSON file>
//   node profile/linkedin-post.js --test
//
// pick writes the week's post to <out dir>/post.linkedin.md and its seed to
// meta.json. The post comes from all-possible-linkedin-posts' own generator,
// seeded by the ISO week, so a week always gets the same post. render prints
// the README block: the post in a collapsible section with slop-linter's
// findings on it and a link to the full post on the live site.
"use strict";
const fs = require("fs");
const path = require("path");

const SITE = "https://thrash-d.github.io/all-possible-linkedin-posts/";
// The page's default dial positions. The link rebuilds the post with the
// page's dials, so these must match or the linked post won't match the quote.
const DIALS = { coh: 2, brag: 1, dash: 1, tags: 4 };
// Limits for the first line, which is the collapsed summary.
const MIN_CHARS = 25;
const MAX_CHARS = 160;
const MAX_TRIES = 50;

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  return [year, Math.ceil(((d - Date.UTC(year, 0, 1)) / 864e5 + 1) / 7)];
}

function isBlocked(text, blocklist) {
  const norm = " " + text.toLowerCase().replace(/[^a-z]+/g, " ").trim() + " ";
  return blocklist.some(entry =>
    entry.includes(" ") ? norm.includes(` ${entry} `)
      : [entry, entry + "s", entry + "es"].some(w => norm.includes(` ${w} `)));
}

const escapeMd = s => s.replace(/([\\`*_[\]<>#|~])/g, "\\$1").replace(/@/g, "&#64;");
const escapeHtml = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/@/g, "&#64;");

function pickPost(gen, blocklist, date) {
  const [year, week] = isoWeek(date);
  const base = `w${year}${String(week).padStart(2, "0")}`;
  for (let i = 0; i < MAX_TRIES; i++) {
    // Seeds must match the page's link format, letters and digits only.
    const seed = i ? `${base}r${i}` : base;
    const text = gen.build(seed, DIALS).text;
    const hook = text.split("\n")[0].trim();
    // A hook ending in a colon leads into the rest of the post, so it reads cut off as a summary.
    const usable = hook.length >= MIN_CHARS && hook.length <= MAX_CHARS && !hook.endsWith(":");
    if (usable && !isBlocked(text, blocklist)) return { seed, text };
  }
  throw new Error(`no usable post in ${MAX_TRIES} seeds for ${base}`);
}

function render({ seed, text }, alerts) {
  const hook = text.split("\n")[0].trim();
  // A README joins consecutive lines into one, so a line followed by another
  // gets a trailing backslash, which Markdown renders as a line break.
  const lines = text.trim().split("\n").map(l => escapeMd(l.trimEnd()));
  const quoted = lines.map((l, i) => {
    const br = l && lines[i + 1] ? "\\" : "";
    return ("> " + l + br).trimEnd();
  }).join("\n");
  const rules = [...new Set(alerts.map(a => a.Check.split(".").pop()))];
  const n = alerts.length;
  const verdict = n ? `${n} ${n === 1 ? "finding" : "findings"}: ${rules.join(", ")}` : "no findings";
  return [
    "<details>",
    `<summary>This week's LinkedIn post, courtesy of all-possible-linkedin-posts: ${escapeHtml(hook)}</summary>`,
    "",
    quoted,
    "",
    `[slop-linter](https://github.com/thrash-d/slop-linter) on this post: ${verdict}. [Open it on the site](${SITE}#p${seed}).`,
    "",
    "</details>",
  ].join("\n");
}

function selfTest() {
  const assert = require("assert");
  assert.deepStrictEqual(isoWeek(new Date("2026-09-28T12:00:00Z")), [2026, 40]);
  assert.deepStrictEqual(isoWeek(new Date("2021-01-01T00:00:00Z")), [2020, 53]);
  assert.deepStrictEqual(isoWeek(new Date("2024-12-30T00:00:00Z")), [2025, 1]);
  const list = ["ass", "two words"];
  assert.ok(!isBlocked("A class act from Scunthorpe", list));
  assert.ok(isBlocked("These two words appear", list));
  assert.strictEqual(escapeMd("a *b* [c] #d @e"), "a \\*b\\* \\[c\\] \\#d &#64;e");
  // The blocklist applies to the whole post, not just the first line.
  const posts = {
    w202640: "A clean first line that is long enough.\n\nThen a bad ass line.",
    w202640r1: "Here is what nobody tells you:\n\nrest",
    w202640r2: "Too short.\n\nrest",
    w202640r3: "A clean hook for the whole week.\n\n#Tag",
  };
  const gen = { build: seed => ({ text: posts[seed] }) };
  assert.deepStrictEqual(pickPost(gen, list, new Date("2026-09-28")), { seed: "w202640r3", text: posts.w202640r3 });
  const block = render({ seed: "w202640r3", text: "Hook <b> @me\n\n#Tag" }, [{ Check: "NoSlopLinkedIn.Hashtags" }, { Check: "NoSlop.EmDash" }]);
  assert.ok(block.includes("<summary>This week's LinkedIn post, courtesy of all-possible-linkedin-posts: Hook &lt;b&gt; &#64;me</summary>"));
  assert.ok(block.includes("> Hook \\<b\\> &#64;me\n>\n> \\#Tag"));
  const pair = render({ seed: "s", text: "One\nTwo\n\nThree" }, []);
  assert.ok(pair.includes("> One\\\n> Two\n>\n> Three"));
  assert.ok(block.includes("on this post: 2 findings: Hashtags, EmDash. [Open it on the site](" + SITE + "#pw202640r3)."));
  assert.ok(render({ seed: "s", text: "Clean." }, []).includes("on this post: no findings."));
  console.log("self-test passed");
}

if (require.main === module) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === "--test") {
    selfTest();
  } else if (cmd === "pick" && args.length === 3) {
    const [dir, blockFile, out] = args;
    const { createGenerator } = require(path.resolve(dir, "generator.js"));
    const gen = createGenerator(JSON.parse(fs.readFileSync(path.join(dir, "lexicon.json"), "utf8")));
    const listed = fs.readFileSync(blockFile, "utf8").split("\n").map(s => s.trim().toLowerCase()).filter(Boolean);
    if (listed.length < 100) throw new Error(`blocklist looks truncated: ${listed.length} entries`);
    const { seed, text } = pickPost(gen, listed, new Date());
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "post.linkedin.md"), text.trim() + "\n");
    fs.writeFileSync(path.join(out, "meta.json"), JSON.stringify({ seed }));
    console.log(`picked ${seed}`);
  } else if (cmd === "render" && args.length === 2) {
    const [out, valeFile] = args;
    const { seed } = JSON.parse(fs.readFileSync(path.join(out, "meta.json"), "utf8"));
    const text = fs.readFileSync(path.join(out, "post.linkedin.md"), "utf8");
    const results = JSON.parse(fs.readFileSync(valeFile, "utf8"));
    // Vale prints a runtime error as a JSON object too; only a file -> alerts map is a result.
    if (!results || typeof results !== "object" || !Object.values(results).every(Array.isArray)) {
      throw new Error(`Vale didn't return results: ${JSON.stringify(results).slice(0, 200)}`);
    }
    const alerts = Object.values(results).flat();
    console.log(render({ seed, text }, alerts));
  } else {
    throw new Error("usage: linkedin-post.js pick <generator dir> <blocklist> <out dir> | render <out dir> <vale json> | --test");
  }
}
