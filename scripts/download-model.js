import { fileURLToPath } from 'node:url';
import { installAssets } from './model-assets.mjs';
import { MODEL_SPEC } from '../src/model-spec.js';

try {
    await installAssets(fileURLToPath(new URL('../model/', import.meta.url)));
    console.log(`Verified ${MODEL_SPEC.repository}@${MODEL_SPEC.revision} (${MODEL_SPEC.precision}). No inference executed.`);
    console.log('Ettin weights are CC BY-NC-SA 4.0; non-commercial use, attribution and share-alike obligations apply. See docs/ettin-integration.md.');
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
