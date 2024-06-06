import * as config from '../config.js';

export default async function listModules() {
  console.log('Installed modules:');
  console.log(
    config.project.modules
      .map(m => `${m.name}:${m.alias}`)
      .join('\n')
  );
}