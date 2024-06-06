import * as config from '../config.js';

export default async function listExamples() {
  if (config.project.taskExamples.length == 0) {
    return console.log('No examples added yet')
  }

  console.log('Examples:');
  console.log(config.project.taskExamples.join('\n'));
}
