import fs from 'fs';
import path from 'path';
import { headersUpToDate } from './update-headers.js';
import * as yaml from 'js-yaml';
import { getAllFiles } from '../lib/file-utils.js';
import * as config from '../config.js';

const metadataDir = './.faqtiv/code';
const codeDir = './code/';
const tasksDir = './tasks/';
const codeFileExtension = config.project.runtime.codeFileExtension;

function findCorrespondingMetadata(ymlFiles, jsFile) {
  const ymlPath = jsFile.relativePath.replace(codeFileExtension, '.yml');
  return ymlFiles.find(yml => yml.relativePath === ymlPath);
}

function findCorrespondingTask(taskDir, jsFile) {
  const taskPath = path.join(taskDir, jsFile.relativePath.replace(codeFileExtension, '.txt'));
  return fs.existsSync(taskPath) ? {
    fullPath: taskPath,
    lastModified: fs.statSync(taskPath).mtime
  } : null;
}

function isOutdated(jsFile, ymlFile, taskFile, functions, libs) {
  let message = '';
  const reasons = {
    functionsAreNewerThanCode: false,
    libsAreNewerThanCode: false,
    codeIsNewerThanMetadada: false
  };

  if (!ymlFile || !taskFile) return false;  // Ensure all components exist

  const jsStat = fs.statSync(jsFile.fullPath);
  const metadataStat = fs.statSync(ymlFile.fullPath);
  const metadata = yaml.load(fs.readFileSync(ymlFile.fullPath, 'utf8'));
  const newerFunctions = metadata.output.functions.filter(dep => {
    const func = functions.find(f => f.name === dep.name);
    return func && jsStat.mtime < func.lastModified;
  });
  if (newerFunctions.length > 0) {
    message += `${message.length > 0 ? '\n    ' : ''} Function dependencies have been updated: ${newerFunctions.map(f => f.name).join(', ')}`;
    reasons.functionsAreNewerThanCode = true;
  }

  const newerLibs = libs.filter(func => {
    return jsStat.mtime < func.lastModified
  });
  if (newerLibs.length > 0) {
    message += `${message.length > 0 ? '\n    ' : ''} Library dependencies have been updated: ${newerLibs.map(f => f.name).join(', ')}`;
    reasons.libsAreNewerThanCode = true;
  }

  if (jsStat.mtime > metadataStat.mtime) {
    message += `${message.length > 0 ? '\n    ' : ''} Code is newer than metadata`;
    reasons.codeIsNewerThanMetadada = true;
  }

  return { message, reasons };
}

function getTaskName(file) {
  const fullPath = file.fullPath;
  const lastSlashIndex = fullPath.lastIndexOf('/');
  const fileName = fullPath.substring(lastSlashIndex + 1);
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex === -1) return fileName; // No extension found
  return fileName.substring(0, lastDotIndex);
}

export function getOutdatedItems() {
  const libs = config.project.libs;
  const functions = config.project.functions;
  const codeFiles = getAllFiles(codeDir, codeFileExtension);
  const metadataFiles = getAllFiles(metadataDir, '.yml');

  const headersUpdated = headersUpToDate();
  if (!headersUpdated) {
    console.log('Warning: The header file is outdated. Please run `faqtiv update-headers` to reflect recent changes in function files.');
    process.exit(0);
  }

  return codeFiles.map(file => {
    const correspondingYml = findCorrespondingMetadata(metadataFiles, file);
    const correspondingTask = findCorrespondingTask(tasksDir, file);
    const outdatedInfo = isOutdated(file, correspondingYml, correspondingTask, functions, libs);

    return {
      file,
      taskName: getTaskName(file),
      ...outdatedInfo
    };
  }).filter(i => i.message);
}

export default function() {
  try {
    const outdatedItems = getOutdatedItems();

    if (outdatedItems.length == 0) {
      return console.log('Everything up to date!');
    }

    console.log('The following files will be processed upon migration:');
    outdatedItems.forEach((item) => {
      console.log(`- ${item.file.fullPath}: 
    ${item.message}`);
    });
  } catch (error) {
    console.error('Error evaluating migration:', error);
  }
}