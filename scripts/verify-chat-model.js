const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const configPath = path.join(root, 'config', 'local-ai.config.json');
const packagePath = path.join(root, 'package.json');
const manifestPath = path.join(root, 'models', 'manifest.json');

function verifyModel() {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const activeModel = config.activeModel;
  const localPath = path.join(root, activeModel.relativePath);
  const appDataPath = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'LocalCore', 'models', activeModel.fileName)
    : null;
  if (!fs.existsSync(localPath) && !(appDataPath && fs.existsSync(appDataPath))) {
    throw new Error('The configured chat model is not installed. Run "npm run ' + activeModel.setupCommand + '".');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  if (manifest.defaultModelId !== activeModel.id || packageJson.localAI.activeModel !== activeModel.id) {
    throw new Error('The configured chat model does not match the application metadata.');
  }
  console.log('Verified active chat model: ' + activeModel.name + '.');
}

try {
  verifyModel();
} catch (error) {
  console.error('Could not verify chat model: ' + error.message);
  process.exitCode = 1;
}
