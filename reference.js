'use strict';

/**
 * Build a path reference in the same form used by dsh-drop-caret for a code range.
 * Lines are 1-based and the end line is omitted for one-line selections.
 */
function formatCodeReference(filePath, startLine, endLine) {
  const p = String(filePath || '').trim();
  if (!p) throw new Error('A file path is required');
  const start = Number(startLine);
  const end = Number(endLine);
  if (!Number.isInteger(start) || start < 1 || !Number.isInteger(end) || end < start) {
    throw new Error('Line range must use positive, ordered 1-based line numbers');
  }
  return end > start ? p + ':' + start + '-' + end : p + ':' + start;
}

/** Keep file and folder references as plain paths. */
function formatResourceReference(filePath) {
  const p = String(filePath || '').trim();
  if (!p) throw new Error('A resource path is required');
  return p;
}

module.exports = { formatCodeReference, formatResourceReference };
