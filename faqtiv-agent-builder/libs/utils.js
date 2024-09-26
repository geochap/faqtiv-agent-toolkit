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
      .replace(/\\/g, '\\\\')    // Escape backslashes first
      .replace(/"/g, '\\"')      // Then escape double quotes
      .replace(/`/g, '\\`')      // Then escape backticks
      .replace(/\$/g, '\\$')     // Then escape dollar signs
      .replace(/\n/g, '\\n');    // Then replace newlines
  }

  return `"${escapedText}"`;
}