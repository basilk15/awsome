function csvCell(value) {
  let text = String(value ?? '');
  if (/^\s*[=+@-]|^[\t\r\n]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function resourceInventoryCsv(resources) {
  const rows = [['Name', 'Resource ID', 'Type', 'Region', 'Profile']];
  for (const { name, id, type, region, profile } of resources) {
    rows.push([name, id, type, region, profile]);
  }
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
