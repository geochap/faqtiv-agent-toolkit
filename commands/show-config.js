import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';

export default function showConfig(options) {
  try {
    const configPath = path.join(process.cwd(), 'faqtiv_config.yml');
    const configFile = fs.readFileSync(configPath, 'utf8');
    const config = yaml.load(configFile);

    if (options.json) {
      console.log(JSON.stringify(config, null, 2));
    } else {
      console.log(yaml.dump(config));
    }
  } catch (error) {
    console.error('Error reading or parsing faqtiv_config.yml:', error.message);
  }
}