export function unescapeText(code) {
  const isWindows = process.platform === 'win32';
  
  if (isWindows) {
    return code
      .replace(/\\\\/g, '\\')   // Unescape backslashes first
      .replace(/`n/g, '\n')     // Convert PowerShell newline to actual newline
      .replace(/``/g, '`')      // Unescape backticks
      .replace(/""/g, '"')      // Unescape double quotes
      .replace(/`\$/g, '$');    // Unescape dollar signs
  } else {
    return code
      .replace(/\\\\/g, '\\')   // Unescape backslashes first
      .replace(/\\n/g, '\n')    // Convert escaped newline to actual newline
      .replace(/\\`/g, '`')     // Unescape backticks
      .replace(/\\"/g, '"')     // Unescape double quotes
      .replace(/\\\$/g, '$');   // Unescape dollar signs
  }
}