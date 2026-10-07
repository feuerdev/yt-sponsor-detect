import { fileURLToPath } from 'node:url';
import { verifyAssets } from './model-assets.mjs';
import { MODEL_SPEC } from '../src/model-spec.js';
try {
    await verifyAssets(fileURLToPath(new URL(`../model/${MODEL_SPEC.directory}/`, import.meta.url)));
    console.log(`Verified pinned model ${MODEL_SPEC.revision}. Inference and rights require separate evidence.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
