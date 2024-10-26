import fs from 'fs';
import path from 'path';

function getFilesRecursively(directory, fileList = [], baseDir = directory) {
  const files = fs.readdirSync(directory, { withFileTypes: true });
  files.forEach(file => {
    if (file.isDirectory()) {
      fileList = getFilesRecursively(path.join(directory, file.name), fileList, baseDir);
    } else {
      const relativePath = path.relative(baseDir, path.join(directory, file.name));
      fileList.push({ fullPath: path.join(directory, file.name), relativePath });
    }
  });

  return fileList;
}

export function getAllFiles(directory, extension) {
  let files = getFilesRecursively(directory);

  if (extension) files = files.filter(file => file.relativePath.endsWith(extension));

  return files;
}

export function copyDir(src, dest) {
  // Create the destination directory if it doesn't exist
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Read the contents of the source directory
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      // Recursively copy subdirectories
      copyDir(srcPath, destPath);
    } else {
      // Copy files
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
