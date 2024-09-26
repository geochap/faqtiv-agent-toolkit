function escapeForShell(text) {
  const isWindows = process.platform === 'win32';
  const normalizedText = text.replace(/\r\n/g, '\n');

  let escapedText;
  if (isWindows) {
    escapedText = normalizedText
      .replace(/"/g, '""')       // Double double quotes
      .replace(/`/g, '``')       // Double backticks
      .replace(/\$/g, '`$')      // Escape dollar sign with backtick
      .replace(/\\/g, '\\\\')    // Escape backslashes
      .replace(/\n/g, '`n');     // Newline in PowerShell
  } else {
    escapedText = normalizedText
      .replace(/"/g, '\\"')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$')
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n');
  }

  return `"${escapedText}"`;
}