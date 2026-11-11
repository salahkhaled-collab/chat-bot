// Tiny, safe formatter for model replies: escapes all HTML first, then adds
// bold, italics, inline code, links, bullet/numbered lists and simple tables.

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
}

function isTableRow(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line);
}

function cells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}

function table(lines: string[]): string {
  const rows = lines.filter((l) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(l));
  const [head, ...body] = rows;
  const th = cells(head).map((c) => `<th>${inline(c)}</th>`).join("");
  const tr = body
    .map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

export function formatReply(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    if (isTableRow(line)) {
      const block: string[] = [];
      while (i < lines.length && isTableRow(lines[i])) block.push(lines[i++]);
      out.push(table(block));
      continue;
    }

    const bullet = /^\s*[-*•]\s+/;
    const numbered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const pattern = bullet.test(line) ? bullet : numbered;
      const tag = pattern === bullet ? "ul" : "ol";
      const items: string[] = [];
      while (i < lines.length && pattern.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(pattern, ""))}</li>`);
        i++;
      }
      out.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      out.push(`<p class="subhead">${inline(heading[1])}</p>`);
      i++;
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isTableRow(lines[i]) &&
      !bullet.test(lines[i]) &&
      !numbered.test(lines[i])
    ) {
      para.push(inline(lines[i]));
      i++;
    }
    out.push(`<p>${para.join("<br>")}</p>`);
  }

  return out.join("");
}
