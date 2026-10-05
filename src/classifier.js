import { pipeline, env } from '@xenova/transformers';
import { MODEL_SPEC } from './model-spec.js';

export const PROMOTIONAL_LABEL = 'sponsor';
export const NEUTRAL_LABEL = 'neutral';
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = 'model/';

export class ClassificationError extends Error {
    constructor(code) {
        super(`Sponsor classifier unavailable (${code}). Playback must remain unchanged.`);
        this.name = 'ClassificationError';
        this.code = code;
    }
}

export class Classifier {
    static task = MODEL_SPEC.task;
    static model = MODEL_SPEC.directory;
    static instance = null;
    static loading = null;

    static async getInstance() {
        if (this.instance !== null) return this.instance;
        if (this.loading === null) {
            this.loading = Promise.resolve().then(() => pipeline(this.task, this.model, {
                local_files_only: true, model_file_name: 'model', quantized: false,
            })).then(instance => {
                this.instance = instance;
                return instance;
            }).catch(() => { throw new ClassificationError('model_unavailable'); })
                .finally(() => { this.loading = null; });
        }
        return this.loading;
    }
}

export async function classifyText(text, labels) {
    const classifier = await Classifier.getInstance();
    let result;
    try {
        result = await classifier(text, labels, { padding: true, truncation: true });
    } catch {
        throw new ClassificationError('inference_failed');
    }
    if (!result || !Array.isArray(result.labels) || !Array.isArray(result.scores)
        || result.labels.length !== labels.length || result.scores.length !== labels.length
        || new Set(result.labels).size !== labels.length
        || result.labels.some(label => !labels.includes(label))
        || result.scores.some(score => !Number.isFinite(score) || score < 0 || score > 1)) {
        throw new ClassificationError('invalid_output');
    }
    return Object.fromEntries(result.labels.map((label, index) => [label, result.scores[index]]));
}
