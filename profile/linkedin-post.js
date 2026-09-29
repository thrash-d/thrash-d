// Prints the profile README's LinkedIn post of the week.
//
//   node profile/linkedin-post.js <all-possible-linkedin-posts dir> <blocklist file>
//   node profile/linkedin-post.js --test
//
// The post comes from all-possible-linkedin-posts' own generator, seeded by the
// ISO week, so a week always gets the same post. Only the post's first line is
// shown, and the link opens the full post on the live site.
"use strict";
const fs = require("fs");
const path = require("path");

const SITE = "https://thrash-d.github.io/all-possible-linkedin-posts/";
// The page's default dial positions. The link rebuilds the post with the
// page's dials, so these must match or the linked post won't match the quote.
const DIALS = { coh: 2, brag: 1, dash: 1, tags: 4 };
const MIN_CHARS = 25;
const MAX_CHARS = 160;
const MAX_TRIES = 50;

// The LDNOOBW list covers profanity and slurs. A dictionary combo can also
// drop an identity or atrocity word into an upbeat post. That reads worse than
// a swear, so those words reroll too.
const EXTRA_BLOCKED = `
  abortion african africans arab arabs asian asians black blacks cancer corpse
  cripple disabled gay gays genocide gypsy hindu hitler holocaust islam islamic
  jew jewish jews kill killed killing lesbian lynch lynching massacre midget
  murder murdered muslim muslims nazi nazis queer rape raped refugee refugees
  retard sikh slave slavery slaves suicide terror terrorism terrorist
  terrorists trans transgender white whites
`.split(/\s+/).filter(Boolean);

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

const escapeMd = s => s.replace(/([\\`*_[\]<>#|~])/g, "\\$1");

function pickPost(gen, blocklist, date) {
  const [year, week] = isoWeek(date);
  const base = `w${year}${String(week).padStart(2, "0")}`;
  for (let i = 0; i < MAX_TRIES; i++) {
    // Seeds must match the page's link format, letters and digits only.
    const seed = i ? `${base}r${i}` : base;
    const hook = gen.build(seed, DIALS).text.split("\n")[0].trim();
    // A hook ending in a colon leads into the rest of the post, so it reads cut off here.
    const usable = hook.length >= MIN_CHARS && hook.length <= MAX_CHARS && !hook.endsWith(":");
    if (usable && !isBlocked(hook, blocklist)) return { seed, hook };
  }
  throw new Error(`no usable post in ${MAX_TRIES} seeds for ${base}`);
}

function line({ seed, hook }) {
  return `This week's LinkedIn post, courtesy of [all-possible-linkedin-posts](${SITE}#p${seed}): ${escapeMd(hook)}`;
}

function selfTest() {
  const assert = require("assert");
  assert.deepStrictEqual(isoWeek(new Date("2026-09-28T12:00:00Z")), [2026, 40]);
  assert.deepStrictEqual(isoWeek(new Date("2021-01-01T00:00:00Z")), [2020, 53]);
  assert.deepStrictEqual(isoWeek(new Date("2024-12-30T00:00:00Z")), [2025, 1]);
  const list = ["ass", "two words", "jew"];
  assert.ok(!isBlocked("A class act from Scunthorpe", list));
  assert.ok(isBlocked("Proud of my Jews in the team", list));
  assert.ok(isBlocked("These two words appear", list));
  assert.strictEqual(escapeMd("a *b* [c] #d"), "a \\*b\\* \\[c\\] \\#d");
  const hooks = { w202640: "What a bad ass hook this one is.", w202640r1: "Here is what nobody tells you:", w202640r2: "Too short.", w202640r3: "A clean hook for the whole week." };
  const gen = { build: seed => ({ text: hooks[seed] + "\nrest of the post" }) };
  assert.deepStrictEqual(pickPost(gen, list, new Date("2026-09-28")), { seed: "w202640r3", hook: hooks.w202640r3 });
  console.log("self-test passed");
}

if (require.main === module) {
  if (process.argv[2] === "--test") {
    selfTest();
  } else {
    const [dir, blockFile] = process.argv.slice(2);
    if (!dir || !blockFile) throw new Error("usage: linkedin-post.js <generator dir> <blocklist file>");
    const { createGenerator } = require(path.resolve(dir, "generator.js"));
    const gen = createGenerator(JSON.parse(fs.readFileSync(path.join(dir, "lexicon.json"), "utf8")));
    const listed = fs.readFileSync(blockFile, "utf8").split("\n").map(s => s.trim().toLowerCase()).filter(Boolean);
    if (listed.length < 100) throw new Error(`blocklist looks truncated: ${listed.length} entries`);
    console.log(line(pickPost(gen, listed.concat(EXTRA_BLOCKED), new Date())));
  }
}
