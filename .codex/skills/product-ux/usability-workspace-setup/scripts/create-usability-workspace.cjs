#!/usr/bin/env node
/*
 * Folder structure for usability evaluation
 * - incoming/: NEW evidence files (not yet evaluated)
 * - processed/: evidence files ALREADY evaluated (moved from incoming/)
 * - protocol/: protocol definitions and templates
 * - results/: evaluation results and reports
 * - memory/: feature-level memory
 */
const fs = require('fs');
const path = require('path');

const FEATURE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function parseArguments(args) {
  let featureId;
  let explicitFeatureDir;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--feature-dir') {
      if (explicitFeatureDir) throw new Error('Duplicate --feature-dir option');
      explicitFeatureDir = args[index + 1];
      if (!explicitFeatureDir || explicitFeatureDir.startsWith('--')) {
        throw new Error('feature_dir required after --feature-dir');
      }
      index += 1;
    } else if (argument.startsWith('--feature-dir=')) {
      if (explicitFeatureDir) throw new Error('Duplicate --feature-dir option');
      explicitFeatureDir = argument.slice('--feature-dir='.length);
      if (!explicitFeatureDir) throw new Error('feature_dir required after --feature-dir=');
    } else if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`);
    } else if (featureId) {
      throw new Error('Provide either feature_id or --feature-dir, not both');
    } else {
      featureId = argument;
    }
  }

  if (!featureId && !explicitFeatureDir) {
    throw new Error('feature_id or --feature-dir required');
  }
  if (featureId && !FEATURE_ID_PATTERN.test(featureId)) {
    throw new Error('feature_id must match /^[A-Za-z0-9][A-Za-z0-9_-]*$/');
  }

  return { featureId, explicitFeatureDir };
}

function requireDirectory(directory, label) {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error(`${label} does not exist or is not a directory: ${directory}`);
  }
}

let parsed;
try {
  parsed = parseArguments(process.argv.slice(2));
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  console.error('Usage: node create-usability-workspace.cjs <feature_id>');
  console.error('   or: node create-usability-workspace.cjs --feature-dir <path>');
  process.exit(1);
}

let featureDir;
try {
  featureDir = path.resolve(
    process.cwd(),
    parsed.explicitFeatureDir ?? path.join('specs', parsed.featureId),
  );
  requireDirectory(featureDir, 'feature_dir');
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const baseDir = path.join(featureDir, 'usability');
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
