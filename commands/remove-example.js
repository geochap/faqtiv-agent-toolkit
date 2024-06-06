import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const configPath = path.join('faqtiv_config.yml');

export default async function removeExample(name, options) {
  if (!fs.existsSync(configPath)) {
    console.log('faqtiv_config.yml not found');
    process.exit(1);
  }
  const removeAll = options.all;

  if (!removeAll && !name) {
    console.error("error: missing required argument 'taskName'");
    process.exit(1);
  }

  const faqtivConfig = yaml.load(fs.readFileSync(configPath, 'utf8'));
  let taskExamples = faqtivConfig.task_examples || [];

  if (!removeAll) { 
    const index = taskExamples.indexOf(name);
    if (index === -1) {
      console.log(`Nothing to remove, task "${name}" is not an example`);
      process.exit(1);
    }

    // Remove the example from the array
    taskExamples.splice(index, 1);
  } else {
    taskExamples = [];
  }

  // Convert the updated configuration back to a YAML string
  faqtivConfig.task_examples = taskExamples;
  const newYamlContent = yaml.dump(faqtivConfig);

  try {
    fs.writeFileSync(configPath, newYamlContent, 'utf8');
    if (!removeAll) console.log(`Task "${name}" removed from the examples`);
    if (removeAll) console.log('Removed all examples');
  } catch (error) {
    console.error('Failed to update faqtiv_config.yml:', error.message);
    process.exit(1);
  }
}
