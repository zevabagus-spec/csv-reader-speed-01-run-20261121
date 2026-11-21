// csv-reader-speed-01: a faster drop-in for csv-reader 1.0.0.
//
// run(input) returns exactly what csv-reader 1.0.0's readCsv returns for the
// same {text, header}: {columns, rows, errors}. The reading policy, restated:
// the text is read once, left to right; a leading U+FEFF is dropped; a record
// ends at LF or CRLF and a line left with no characters is no record; outside
// quotes a CR not followed by LF is dropped (stray_cr); a field that opens
// with a quote runs to the next quote that is not doubled ("" inside it is one
// quote, CRLF or a lone CR inside it reads as LF); what follows its closing
// quote up to the next comma or line break is appended as it stands
// (quote_junk, when the field ends); a quote that never closes is a literal
// character and the text after it is read again as unquoted
// (unterminated_quote); a quote inside an unquoted field is a literal
// character; fields stay strings, never trimmed or converted; columns is the
// first record when header is true, else null; rows holds the records after
// it, each padded (short_row, with fields: its field count) or cut (long_row,
// with extra: the cut fields) to the first record's width; each error is
// {code, line, row} in the order met, line the 1-based line its record starts
// on (counting every LF, CRLF and lone CR inside quotes) and row its record's
// index in rows (null for the header).
//
// Speed: the reference walks one character at a time and builds every field a
// character at a time. This reader instead finds each delimiter with the
// engine's native indexOf or one native regex exec, and cuts each field out
// with one slice. Records whose line holds no quote and no stray CR -- the
// overwhelming majority -- take a fast path that splits the line on commas
// with indexOf alone. Any record that holds a quote or a stray CR takes a
// slow path that mirrors the reference field by field, so the answers stay
// identical on every broken row. Nothing is cached from one case to the next;
// run is pure.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;
// One native call finds the next delimiter, instead of three indexOf scans.
const DELIM = /[,\n\r]/g;
const QDELIM = /["\n\r]/g;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `value` up to the next comma or line break: a CR not followed by LF is dropped
  // (stray_cr). Returns the field and how it ended; `added` counts the characters kept.
  function readUnquoted(value) {
    let added = 0;
    while (pos < n) {
      DELIM.lastIndex = pos;
      const m = DELIM.exec(text);
      if (m === null) {
        value += text.slice(pos, n);
        added += n - pos;
        pos = n;
        return { value, ended: END, added };
      }
      const next = m.index;
      const ch = m[0];
      if (ch === ',') {
        value += text.slice(pos, next);
        added += next - pos;
        pos = next + 1;
        return { value, ended: COMMA, added };
      }
      if (ch === '\n') {
        value += text.slice(pos, next);
        added += next - pos;
        pos = next + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      if (text.charCodeAt(next + 1) === 10) {
        value += text.slice(pos, next);
        added += next - pos;
        pos = next + 2;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      // A lone CR: dropped, and the field goes on.
      value += text.slice(pos, next);
      added += next - pos;
      error('stray_cr');
      pos = next + 1;
    }
    return { value, ended: END, added };
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    let closed = false;
    while (pos < n) {
      QDELIM.lastIndex = pos;
      const m = QDELIM.exec(text);
      if (m === null) {
        value += text.slice(pos, n);
        pos = n;
        break;
      }
      const next = m.index;
      const ch = m[0];
      if (ch === '"') {
        if (text.charCodeAt(next + 1) === 34) {
          value += text.slice(pos, next);
          value += '"';
          pos = next + 2;
          continue;
        }
        value += text.slice(pos, next);
        pos = next + 1;
        closed = true;
        break;
      }
      if (ch === '\n') {
        value += text.slice(pos, next);
        value += '\n';
        line += 1;
        pos = next + 1;
        continue;
      }
      // CRLF and a lone CR inside quotes are each one LF.
      value += text.slice(pos, next);
      value += '\n';
      line += 1;
      pos = next + (text.charCodeAt(next + 1) === 10 ? 2 : 1);
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text after it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      error('unterminated_quote');
      return readUnquoted('"');
    }
    if (pos >= n) return { value, ended: END, added: 0 };
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return { value, ended: COMMA, added: 0 };
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK, added: 0 };
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK, added: 0 };
    }
    // What follows the closing quote is appended as it stands, up to the next comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) error('quote_junk');
    return junk;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // The fast path: this record's line holds no quote and no stray CR, so it
    // is plain comma-separated fields on one line.
    const nl = text.indexOf('\n', pos);
    const end = nl === -1 ? n : nl;
    let segEnd = end;
    if (nl !== -1 && end > pos && text.charCodeAt(end - 1) === 13) segEnd = end - 1;
    const quoteAt = text.indexOf('"', pos);
    const hasQuote = quoteAt !== -1 && quoteAt < segEnd;
    let hasCr = false;
    if (!hasQuote) {
      const crAt = text.indexOf('\r', pos);
      hasCr = crAt !== -1 && crAt < segEnd;
    }

    let fields;
    let quoted = false;
    if (!hasQuote && !hasCr) {
      fields = [];
      let f = pos;
      while (true) {
        const commaAt = text.indexOf(',', f);
        if (commaAt === -1 || commaAt >= segEnd) {
          fields.push(text.slice(f, segEnd));
          break;
        }
        fields.push(text.slice(f, commaAt));
        f = commaAt + 1;
      }
      pos = nl === -1 ? n : nl + 1;
      if (nl !== -1) line += 1;
    } else {
      fields = [];
      let field;
      do {
        quoted = text.charCodeAt(pos) === 34;
        field = quoted ? readQuoted() : readUnquoted('');
        fields.push(field.value);
      } while (field.ended === COMMA);
    }

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
