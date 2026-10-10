import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function findReadme(root) {
  const names = await readdir(root).catch(() => []);
  const candidates = names.filter((name) => /^readme(\.(md|markdown|txt|rst))?$/i.test(name));
  const name = candidates.find((candidate) => /\.(md|markdown)$/i.test(candidate)) ?? candidates[0];
  return name ? path.join(root, name) : null;
}

export async function loadReadme(root) {
  const file = await findReadme(root);
  if (!file) return null;
  return { file, ...parseReadme(await readFile(file, "utf8")) };
}

const imagePattern = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const linkPattern = /(?<!!)\[(?:[^[\]]|!\[[^\]]*\]\([^)]*\))*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const htmlMediaPattern = /<(img|video|source)\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;
const htmlLinkPattern = /<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["']/gi;
const bareAttachmentPattern = /^\s*(https:\/\/github\.com\/user-attachments\/assets\/[\w-]+)\s*$/;

function plain(text) {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~>#|]/g, " ");
}

function countWords(text) {
  return plain(text).split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

export function parseReadme(source) {
  const text = source.replace(/<!--[\s\S]*?-->/g, "");
  const lines = text.split(/\r?\n/);
  const prose = [];
  const media = [];
  const links = [];
  const headings = [];
  let codeBlocks = 0;
  let fence = null;

  lines.forEach((line, index) => {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
      return;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      codeBlocks += 1;
      return;
    }
    prose.push(line);

    const markdownHeading = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    const htmlHeading = line.match(/^\s*<h([1-6])\b[^>]*>(.*?)<\/h\1>/i);
    if (markdownHeading) headings.push({ level: markdownHeading[1].length, text: plain(markdownHeading[2]).trim(), line: index });
    else if (htmlHeading) headings.push({ level: Number(htmlHeading[1]), text: plain(htmlHeading[2]).trim(), line: index });

    for (const match of line.matchAll(imagePattern)) media.push({ src: match[1], line: index });
    for (const match of line.matchAll(htmlMediaPattern)) media.push({ src: match[2], line: index, tag: match[1].toLowerCase() });
    const attachment = line.match(bareAttachmentPattern);
    if (attachment) media.push({ src: attachment[1], line: index });
    for (const match of line.matchAll(linkPattern)) links.push({ href: match[1], line: index });
    for (const match of line.matchAll(htmlLinkPattern)) links.push({ href: match[1], line: index });
  });

  const h1 = headings.find((heading) => heading.level === 1);
  const firstSection = headings.find((heading) => heading.level >= 2 && heading.line > (h1?.line ?? -1));
  return {
    title: h1?.text ?? null,
    lead: leadParagraph(lines, h1?.line ?? -1),
    words: countWords(prose.join("\n")),
    codeBlocks,
    headings,
    media,
    links,
    firstSectionLine: firstSection?.line ?? lines.length,
  };
}

// The first prose paragraph after the H1, skipping badge rows, images and bare HTML.
function leadParagraph(lines, start) {
  const paragraph = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*(#|```|~~~|<h[1-6])/i.test(line)) break;
    if (paragraph.length && /^\s*([-*+]|\d+[.)]|\|)\s/.test(line)) break;
    const words = countWords(line.replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, ""));
    const isDecoration = words === 0 || /^\s*(!\[|<(img|p|div|picture|a|video|br|sub)\b|\[!\[|https?:\/\/\S+\s*$)/i.test(line);
    if (!line.trim() || isDecoration) {
      if (paragraph.length) break;
      continue;
    }
    paragraph.push(line.trim());
  }
  return paragraph.length ? plain(paragraph.join(" ")).replace(/\s+/g, " ").trim() : null;
}

export { countWords };
