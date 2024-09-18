import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import * as config from '../config.js';
import { exec } from 'child_process';

const configPath = path.join('faqtiv_config.yml');

async function installJSModules(name, moduleVersion) {
  return await new Promise((resolve, reject) => {
    const installCommand = config.project.runtime.packageManager === 'npm' ? 'install' : 'add';
    const npmCommand = moduleVersion ? `${config.project.runtime.packageManager} ${installCommand} ${name}@${moduleVersion}` : `${config.project.runtime.packageManager} ${installCommand} ${name}`;
    
    // Run npm install --save for the module
    exec(npmCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error installing module ${name}: ${error.message}`);
        return resolve(false);
      }
      console.log(`${npmCommand} completed successfully`);
      return resolve(true);
    });
  });
}

async function installPythonModules(name, moduleVersion) {
  return await new Promise((resolve, reject) => {
    const requirementsPath = path.join('requirements.txt');
    const requirement = moduleVersion ? `${name}==${moduleVersion}` : name;

    // Read the current requirements.txt content
    const originalRequirements = fs.readFileSync(requirementsPath, 'utf8');

    // Append the new requirement
    fs.appendFileSync(requirementsPath, `\n${requirement}`, 'utf8');

    // Activate virtual environment and run pip install
    const activateCommand = process.platform === 'win32' ? 
      `venv\\Scripts\\activate && ${config.project.runtime.packageManager} install -r requirements.txt` : 
      `source venv/bin/activate && ${config.project.runtime.packageManager} install -r requirements.txt`;

    // Run pip install for the module
    exec(activateCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error installing module ${name}: ${error.message}`);
        
        // Restore the original requirements.txt content if installation fails
        fs.writeFileSync(requirementsPath, originalRequirements, 'utf8');

        return resolve(false);
      }

      console.log(`${requirement} installed successfully`);
      return resolve(true);
    });
  });
}

export default async function addModule(name, alias = name, moduleVersion = '') {

  if (!fs.existsSync(configPath)) {
    console.log('faqtiv_config.yml not found');
    process.exit(1);
  }

  const faqtivConfig = yaml.load(fs.readFileSync(configPath, 'utf8'));

  // Check if the modules array exists, if not, create it
  if (!faqtivConfig.modules) {
    faqtivConfig.modules = [];
  }

  if (faqtivConfig.modules.filter((m) => m.name == name || m.alias == alias).length > 0) {
    console.log(`Module "${name}" or alias "${alias}" already exists`);
    process.exit(0);
  }

  // Add the new module to the array
  faqtivConfig.modules.push({ name, alias });

  // Convert the updated configuration back to a YAML string
  const newYamlContent = yaml.dump(faqtivConfig);
  const runtime = config.project.runtime.runtimeName;
  const installFns = {
    javascript: installJSModules,
    python: installPythonModules
  };

  const installModuleFn = installFns[runtime];
  if (!installModuleFn) {
    console.log(`Skipping module install for runtime ${runtime}`);
    process.exit(0);
  }
  const installedModules = await installModuleFn(name, moduleVersion);
  
  if (installedModules) {
    try {
      fs.writeFileSync(configPath, newYamlContent, 'utf8');
    } catch(e) {
      console.error('Failed to update faqtiv_config.yml:', error.message);
      process.exit(1);
    }
  } else {
    process.exit(1);
  }
}
