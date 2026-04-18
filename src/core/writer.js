const fs = require('fs');

/**
 * Writes a parameter change back to the source file.
 * Uses the searchPattern/replaceTemplate from AI analysis for precise replacement.
 */
function writeParameterToFile(filePath, param) {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    let content = fs.readFileSync(filePath, 'utf-8');
    const { searchPattern, replaceTemplate, currentValue, newValue } = param;

    let replaced = false;

    // Strategy 1: Use searchPattern + replaceTemplate if available
    if (searchPattern && replaceTemplate) {
      const replacementValue = formatValueForTemplate(replaceTemplate, newValue);
      if (content.includes(searchPattern)) {
        const replacement = replaceTemplate.replace('{{value}}', replacementValue);
        content = content.replace(searchPattern, replacement);
        replaced = true;
      } else if (currentValue !== undefined) {
        const searchValue = formatValueForTemplate(replaceTemplate, currentValue);
        const derivedSearch = replaceTemplate.replace('{{value}}', searchValue);
        if (content.includes(derivedSearch)) {
          const replacement = replaceTemplate.replace('{{value}}', replacementValue);
          content = content.replace(derivedSearch, replacement);
          replaced = true;
        }
      }
    }

    // Strategy 2: Line-based replacement if we have a line number
    if (!replaced && param.line && currentValue !== undefined) {
      const lines = content.split('\n');
      const lineIdx = param.line - 1;
      if (lineIdx >= 0 && lineIdx < lines.length) {
        const line = lines[lineIdx];
        if (line.includes(String(currentValue))) {
          lines[lineIdx] = line.replace(String(currentValue), String(newValue));
          content = lines.join('\n');
          replaced = true;
        } else {
          for (const variant of getValueVariants(currentValue, newValue)) {
            if (line.includes(variant.search)) {
              lines[lineIdx] = line.replace(variant.search, variant.replace);
              content = lines.join('\n');
              replaced = true;
              break;
            }
          }
        }
      }
    }

    // Strategy 2b: Replace the enclosing string/template literal around the reported line
    if (!replaced && param.line && newValue !== undefined) {
      const nextContent = replaceEnclosingLiteralAtLine(content, param.line, newValue);
      if (nextContent !== null) {
        content = nextContent;
        replaced = true;
      }
    }

    // Strategy 3: Global search for the exact currentValue string
    if (!replaced && currentValue !== undefined) {
      for (const variant of getValueVariants(currentValue, newValue)) {
        if (content.includes(variant.search)) {
          const idx = content.indexOf(variant.search);
          content = content.slice(0, idx) + variant.replace + content.slice(idx + variant.search.length);
          replaced = true;
          break;
        }
      }
    }

    if (!replaced) {
      return { success: false, error: 'Could not locate the parameter in the file. The code may have changed.' };
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function escapeForReplace(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatValueForTemplate(template, value) {
  const raw = String(value ?? '');
  const marker = '{{value}}';
  const idx = template.indexOf(marker);
  if (idx === -1) return raw;

  const before = template.slice(0, idx).trimEnd();
  const after = template.slice(idx + marker.length).trimStart();
  const quote = before[before.length - 1];

  if (quote === '`' && after.startsWith('`')) {
    return raw
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$\{/g, '\\${');
  }

  if (quote === '\'' && after.startsWith('\'')) {
    return raw
      .replace(/\\/g, '\\\\')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/'/g, "\\'");
  }

  if (quote === '"' && after.startsWith('"')) {
    return raw
      .replace(/\\/g, '\\\\')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/"/g, '\\"');
  }

  return raw;
}

function getValueVariants(currentValue, newValue) {
  const current = String(currentValue ?? '');
  const next = String(newValue ?? '');

  return [
    { search: current, replace: next },
    { search: escapeSingleQuoted(current), replace: escapeSingleQuoted(next) },
    { search: escapeDoubleQuoted(current), replace: escapeDoubleQuoted(next) },
    { search: escapeTemplateLiteral(current), replace: escapeTemplateLiteral(next) },
  ].filter((variant, index, arr) => variant.search && arr.findIndex(v => v.search === variant.search && v.replace === variant.replace) === index);
}

function escapeSingleQuoted(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/'/g, "\\'");
}

function escapeDoubleQuoted(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');
}

function escapeTemplateLiteral(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

function replaceEnclosingLiteralAtLine(content, lineNumber, newValue) {
  const offset = getOffsetForLine(content, lineNumber);
  if (offset < 0) return null;

  for (const quote of ['`', '\'', '"']) {
    const range = findEnclosingLiteralRange(content, offset, quote);
    if (!range) continue;

    const escapedValue = quote === '`'
      ? escapeTemplateLiteral(newValue)
      : quote === '\''
        ? escapeSingleQuoted(newValue)
        : escapeDoubleQuoted(newValue);

    return content.slice(0, range.start + 1) + escapedValue + content.slice(range.end);
  }

  return null;
}

function getOffsetForLine(content, lineNumber) {
  if (!lineNumber || lineNumber < 1) return -1;
  let line = 1;
  for (let i = 0; i < content.length; i++) {
    if (line === lineNumber) return i;
    if (content[i] === '\n') line++;
  }
  return line === lineNumber ? content.length : -1;
}

function findEnclosingLiteralRange(content, offset, quote) {
  for (let start = offset; start >= 0; start--) {
    if (content[start] !== quote || isEscaped(content, start)) continue;
    const end = findClosingLiteral(content, start + 1, quote);
    if (end !== -1 && end >= offset) {
      return { start, end };
    }
  }
  return null;
}

function findClosingLiteral(content, start, quote) {
  for (let i = start; i < content.length; i++) {
    if (content[i] === quote && !isEscaped(content, i)) {
      return i;
    }
  }
  return -1;
}

function isEscaped(content, index) {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && content[i] === '\\'; i--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}

module.exports = { writeParameterToFile };
