function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function slugifyHeading(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function renderInline(text) {
  const placeholders = [];
  let html = escapeHtml(text);

  html = html.replace(/`([^`]+)`/g, (_, code) => {
    const token = `__CODE_${placeholders.length}__`;
    placeholders.push(`<code class="api-doc-inline-code">${code}</code>`);
    return token;
  });

  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a class="api-doc-link" href="$2" target="_blank" rel="noreferrer">$1</a>',
  );

  placeholders.forEach((markup, index) => {
    html = html.replace(`__CODE_${index}__`, markup);
  });

  return html;
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

export function extractApiDocSections(markdown) {
  return markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.match(/^(##|###)\s+(.+)$/))
    .filter(Boolean)
    .map((match) => ({
      level: match[1].length,
      text: match[2].trim(),
      id: slugifyHeading(match[2]),
    }));
}

export function renderApiDocHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let paragraphLines = [];
  let listItems = [];
  let tableLines = [];
  let codeLines = [];
  let inCodeBlock = false;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    html.push(`<p class="api-doc-paragraph">${renderInline(paragraphLines.join(' '))}</p>`);
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    html.push(
      `<ul class="api-doc-list">${listItems
        .map((item) => `<li>${renderInline(item)}</li>`)
        .join('')}</ul>`,
    );
    listItems = [];
  };

  const flushTable = () => {
    if (tableLines.length < 2) {
      paragraphLines.push(...tableLines);
      tableLines = [];
      return;
    }

    const [headerRow, , ...bodyRows] = tableLines;
    const headers = splitTableRow(headerRow);
    const rows = bodyRows.map(splitTableRow);

    html.push(
      `<div class="api-doc-table-wrap"><table class="api-doc-table"><thead><tr>${headers
        .map((cell) => `<th>${renderInline(cell)}</th>`)
        .join('')}</tr></thead><tbody>${rows
        .map(
          (row) =>
            `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`,
        )
        .join('')}</tbody></table></div>`,
    );

    tableLines = [];
  };

  const flushCode = () => {
    if (codeLines.length === 0) {
      html.push('<pre class="api-doc-code-block"><code></code></pre>');
      return;
    }

    html.push(
      `<pre class="api-doc-code-block"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`,
    );
    codeLines = [];
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
    flushTable();
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (inCodeBlock) {
      if (trimmed.startsWith('```')) {
        flushCode();
        inCodeBlock = false;
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (trimmed.startsWith('```')) {
      flushAll();
      inCodeBlock = true;
      codeLines = [];
      continue;
    }

    if (!trimmed) {
      flushAll();
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      flushAll();
      html.push('<hr class="api-doc-divider">');
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushAll();
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      const tag = `h${level}`;
      html.push(`<${tag} id="${slugifyHeading(text)}">${renderInline(text)}</${tag}>`);
      continue;
    }

    if (/^- /.test(trimmed)) {
      flushParagraph();
      flushTable();
      listItems.push(trimmed.slice(2).trim());
      continue;
    }

    if (trimmed.startsWith('|') && trimmed.includes('|')) {
      flushParagraph();
      flushList();
      tableLines.push(trimmed);
      continue;
    }

    paragraphLines.push(trimmed);
  }

  if (inCodeBlock) {
    flushCode();
  }

  flushAll();

  return html.join('');
}
