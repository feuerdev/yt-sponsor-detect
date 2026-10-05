import { fileURLToPath } from 'node:url';
import { installAssets } from './model-assets.mjs';
import { MODEL_SPEC } from '../src/model-spec.js';

try {
    await installAssets(fileURLToPath(new URL('../model/', import.meta.url)));
    console.log(`Verified ${MODEL_SPEC.repository}@${MODEL_SPEC.revision} (full precision). No inference executed.`);
    console.log('Model rights remain unverified. Do not redistribute this artifact.');
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
