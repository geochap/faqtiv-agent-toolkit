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
