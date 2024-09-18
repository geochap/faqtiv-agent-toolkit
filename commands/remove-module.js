import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import * as config from '../config.js';
import { exec } from 'child_process';

const configPath = path.join('faqtiv_config.yml');

async function uninstallJSModules(name) {
  return await new Promise((resolve, reject) => {
    const installCommand = config.project.runtime.packageManager === 'npm' ? 'uninstall' : 'remove';
    const npmCommand = `${config.project.runtime.packageManager} ${installCommand} ${name}`;
    
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

async function uninstallPythonModules(name) {
  return await new Promise((resolve, reject) => {
    const requirementsPath = path.join('requirements.txt');
    const requirement = name;

    // Read the current requirements.txt content
    const originalRequirements = fs.readFileSync(requirementsPath, 'utf8');
    const requirementsArray = originalRequirements.split('\n');
    
    // Find and remove the module from requirementsArray
    const updatedRequirementsArray = requirementsArray.filter(line => !line.includes(requirement));
    
    if (updatedRequirementsArray.length === requirementsArray.length) {
      // Module not found in requirements.txt
      console.log(`Module ${requirement} not found in requirements.txt`);
      return resolve(false);
    }

    // Write the updated requirements back to requirements.txt
    fs.writeFileSync(requirementsPath, updatedRequirementsArray.join('\n'), 'utf8');

    // Activate virtual environment and run pip uninstall
    const activateCommand = process.platform === 'win32' ? 
      `venv\\Scripts\\activate && ${config.project.runtime.packageManager} uninstall -y ${name}` : 
      `source venv/bin/activate && ${config.project.runtime.packageManager} uninstall -y ${name}`;

    // Run pip uninstall for the module
    exec(activateCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error uninstalling module ${name}: ${error.message}`);
        
        // Restore the original requirements.txt content if uninstallation fails
        fs.writeFileSync(requirementsPath, originalRequirements, 'utf8');

        return resolve(false);
      }

      console.log(`${requirement} uninstalled successfully`);
      return resolve(true);
    });
  });
}

export default async function removeModule(name) {
  if (!fs.existsSync(configPath)) {
    console.log('faqtiv_config.yml not found');
    process.exit(1);
  }

  const faqtivConfig = yaml.load(fs.readFileSync(configPath, 'utf8'));

  if (!faqtivConfig.modules || faqtivConfig.modules.filter((m) => m.name == name).length == 0) {
    console.error(`Module "${name}" is not installed`);
    process.exit(1);
  }

  // Remove module from config array
  faqtivConfig.modules = faqtivConfig.modules.filter((m) => m.name != name);

  // Convert the updated configuration back to a YAML string
  const newYamlContent = yaml.dump(faqtivConfig);
  const runtime = config.project.runtime.runtimeName;
  const uninstallFns = {
    javascript: uninstallJSModules,
    python: uninstallPythonModules
  };

  const uninstallModuleFn = uninstallFns[runtime];
  if (!uninstallModuleFn) {
    console.log(`Skipping module uninstall for runtime ${runtime}`);
    process.exit(0);
  }
  const uninstalledModule = await uninstallModuleFn(name);
  
  if (uninstalledModule) {
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
