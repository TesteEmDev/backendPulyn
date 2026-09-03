// Normalização única de UID NFC/RFID para o backend.
function normalizeUid(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-F]/g, '');
}

// Expressão SQL Server equivalente para aceitar registros antigos com :, - ou espaços.
function uidSqlExpression(column) {
  return `REPLACE(REPLACE(REPLACE(REPLACE(UPPER(TRIM(${column})), ':', ''), '-', ''), ' ', ''), CHAR(9), '')`;
}

module.exports = { normalizeUid, uidSqlExpression };
