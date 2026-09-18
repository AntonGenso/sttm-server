/**
 * CSV для Excel, а не по RFC 4180.
 *
 * Два отступления от стандарта, оба вынужденные: разделитель `;` (Excel с
 * русской локалью читает `,` как десятичную запятую и сваливает строку в одну
 * ячейку) и BOM в начале файла (без него кириллица в UTF-8 открывается
 * кракозябрами). LibreOffice и Google Sheets оба варианта понимают.
 */

const SEPARATOR = ";";
const BOM = "﻿";

/**
 * Кавычки удваиваются, и в них заворачивается всё, где есть разделитель,
 * кавычка или перенос строки. Ведущий `=` или `+` — формула для Excel, поэтому
 * такие значения тоже уходят в кавычки.
 */
const escapeCell = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);
  const needsQuotes =
    text.includes(SEPARATOR) ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r") ||
    /^[=+\-@]/.test(text);

  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
};

/** `rows` — массив массивов; первая строка обычно заголовок. */
const toCsv = (rows) =>
  BOM +
  rows.map((row) => row.map(escapeCell).join(SEPARATOR)).join("\r\n") +
  "\r\n";

module.exports = { toCsv, SEPARATOR };
