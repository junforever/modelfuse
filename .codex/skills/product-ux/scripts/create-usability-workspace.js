#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const featureId = process.argv[2];

if (!featureId) {
  console.error('Error: feature_id required');
  console.error('Usage: node create-usability-workspace.js <feature_id>');
  process.exit(1);
}

const baseDir = path.join('specs', featureId, 'usability');
const folders = ['incoming', 'processed', 'protocol', 'results', 'memory'];

folders.forEach(folder => {
  const folderPath = path.join(baseDir, folder);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
    console.log(`Created: ${folderPath}`);
  } else {
    console.log(`Exists: ${folderPath}`);
  }
});

console.log(`Workspace ready: ${baseDir}`);
