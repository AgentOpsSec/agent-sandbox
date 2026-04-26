// AgentOpsSec TUI helpers. Zero dependencies. Safe in tests by default.
//
// Colors (per AgentOpsSec brand):
//   safe    #5eea8a (green)
//   warning #ffb84d (amber)
//   risk    #ff5c4d (red)
//   link    #7aa9ff (blue)
//   "AgentOps" white + "Sec" green
//
// Color is OFF by default. CLI `defaultIo()` opts in via setColor(shouldColor()).
// Tests inject their own IO and never call defaultIo, so output stays plain.

const PALETTE = {
  white: "255;255;255",
  green: "94;234;138",
  amber: "255;184;77",
  red: "255;92;77",
  blue: "122;169;255",
  dim: "142;152;168"
};
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

let enabled = false;

export function setColor(value) { enabled = Boolean(value); }
export function colorEnabled() { return enabled; }

export function shouldColor(stream = process.stdout) {
  if (process.env.NO_COLOR != null && process.env.NO_COLOR !== "") return false;
  if (process.env.FORCE_COLOR === "0") return false;
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0") return true;
  return Boolean(stream && stream.isTTY);
}

function color(name, text) {
  if (!enabled) return String(text);
  const rgb = PALETTE[name] || PALETTE.white;
  return `\x1b[38;2;${rgb}m${text}${RESET}`;
}

export const fg = (name, text) => color(name, text);
export const red = (text) => color("red", text);
export const amber = (text) => color("amber", text);
export const green = (text) => color("green", text);
export const blue = (text) => color("blue", text);
export const white = (text) => color("white", text);
export const dim = (text) => color("dim", text);
export const bold = (text) => (enabled ? `${BOLD}${text}${RESET}` : String(text));

// Map a risk/severity/status word to a color.
export function risk(level, text = level) {
  const word = String(level || "").toLowerCase();
  if (/(critical|high|fail|block|error|danger|worsened|reject)/.test(word)) return red(text);
  if (/(medium|warn|attention|stale|unknown)/.test(word)) return amber(text);
  if (/(low|none|safe|allow|pass|ok|good|approve|complete|installed|present|found|pinned|ready)/.test(word)) return green(text);
  return String(text);
}

// Apply brand decoration: blue github URL, "AgentOps"+"Sec" split.
// URL is colored as a single unit so the slash-path stays blue.
// Skips JSON/CSV/TSV-shaped chunks so structured output stays parseable.
export function paint(text) {
  if (!enabled) return String(text);
  const source = String(text);
  if (looksStructured(source)) return source;
  const urlRe = /(https?:\/\/)?github\.com\/AgentOpsSec(?:\/[A-Za-z0-9._-]+)?/g;
  let out = "";
  let last = 0;
  let match;
  while ((match = urlRe.exec(source)) !== null) {
    out += splitBrand(source.slice(last, match.index));
    out += blue(match[0]);
    last = match.index + match[0].length;
  }
  out += splitBrand(source.slice(last));
  return out;
}

function looksStructured(text) {
  const head = text.replace(/^\s+/, "");
  if (!head) return false;
  const first = head[0];
  return first === "{" || first === "[" || first === '"';
}

function splitBrand(text) {
  return text.replace(/AgentOpsSec/g, () => `${white("AgentOps")}${green("Sec")}`);
}

// Severity icons for compact summaries (kept ASCII-safe).
export function statusIcon(level) {
  const word = String(level || "").toLowerCase();
  if (/(critical|high|fail|block|error)/.test(word)) return red("x");
  if (/(medium|warn|attention)/.test(word)) return amber("!");
  if (/(low|none|safe|allow|pass|ok|good|complete)/.test(word)) return green("v");
  return dim("-");
}
