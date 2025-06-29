import { pipeline } from '@xenova/transformers';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const MODEL_ID = 'Xenova/mobilebert-uncased-mnli';
const MODEL_SUBFOLDER = 'mobilebert-uncased-mnli';
const CACHE_DIR = path.join(root, 'node_modules', '@xenova', 'transformers', '.cache');
const MODEL_CACHE_PATH = path.join(CACHE_DIR, 'Xenova', MODEL_SUBFOLDER);
const TARGET_MODEL_DIR = path.join(root, 'model');
const TARGET_MODEL_PATH = path.join(TARGET_MODEL_DIR, MODEL_SUBFOLDER);

async function downloadAndCopyModel() {
    console.log('Downloading model... This may take a moment.');
    // 1. Trigger download by creating a pipeline.
    // We don't need the output, just to run it once to cache the model.
    await pipeline('zero-shot-classification', MODEL_ID);
    console.log('Model downloaded successfully.');

    // 2. Ensure target directory exists.
    await fs.mkdir(TARGET_MODEL_PATH, { recursive: true });

    // 3. Copy model files from cache to the local model directory.
    console.log(`Copying model from ${MODEL_CACHE_PATH} to ${TARGET_MODEL_PATH}`);
    const filesToCopy = [
        'config.json',
        'tokenizer.json',
        'tokenizer_config.json',
    ];

    for (const file of filesToCopy) {
        const src = path.join(MODEL_CACHE_PATH, file);
        const dest = path.join(TARGET_MODEL_PATH, file);
        await fs.copyFile(src, dest);
    }
    
    // 4. Copy and rename the ONNX model file
    const onnxSrcDir = path.join(MODEL_CACHE_PATH, 'onnx');
    const onnxFiles = await fs.readdir(onnxSrcDir);
    const modelFile = onnxFiles.find(file => file.endsWith('.onnx'));

    if (!modelFile) {
        throw new Error('Could not find .onnx model file in cache.');
    }

    const onnxDestDir = path.join(TARGET_MODEL_PATH, 'onnx');
    await fs.mkdir(onnxDestDir, { recursive: true });

    const onnxSrc = path.join(onnxSrcDir, modelFile);
    const onnxDest = path.join(onnxDestDir, 'model.onnx');
    await fs.copyFile(onnxSrc, onnxDest);

    console.log('Model files copied and prepared successfully.');
}

downloadAndCopyModel().catch(error => {
    console.error('Failed to download and copy model:', error);
    process.exit(1);
}); 