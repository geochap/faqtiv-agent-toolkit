import fs from 'fs/promises';
import path from 'path';
import * as config from '../config.js';

async function setEnvVar(key, value) {
  const envPath = path.join(config.project.rootDir, '.env');
  let envContent = '';

  try {
    envContent = await fs.readFile(envPath, 'utf-8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, create an empty one
      await fs.writeFile(envPath, '');
      console.log('.env file created.');
    } else {
      console.error('Error reading .env file:', error);
      return;
    }
  }

  const lines = envContent.split('\n');
  const updatedLines = lines.filter(line => !line.startsWith(`${key}=`));
  updatedLines.push(`${key}=${value}`);

  try {
    await fs.writeFile(envPath, updatedLines.join('\n'));
    console.log(`Environment variable ${key} has been added/updated in .env file.`);
  } catch (error) {
    console.error('Error writing to .env file:', error);
  }
}

export default setEnvVar;