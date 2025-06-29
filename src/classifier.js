import { pipeline, env } from '@xenova/transformers';

export const PROMOTIONAL_LABEL = 'sponsor';
export const NEUTRAL_LABEL = 'neutral';

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = 'model/';

/**
 * @class Classifier
 *
 * @description
 * A singleton class for zero-shot text classification.
 */
export class Classifier {
    static task = 'zero-shot-classification';
    static model = 'mobilebert-uncased-mnli';
    static instance = null;

    static async getInstance() {
        if (this.instance === null) {
            this.instance = await pipeline(this.task, this.model, {
                local_files_only: true,
                model_file_name: 'model',
                quantized: false, // Full-precision model for better accuracy
            });
        }
        return this.instance;
    }
}

/**
 * Classifies a given text against a set of candidate labels.
 * 
 * @param {string} text The text to classify.
 * @param {string[]} labels The candidate labels to test against.
 * @returns {Promise<Record<string, number>>} An object containing the scores for each label.
 */
export async function classifyText(text, labels) {
    const classifier = await Classifier.getInstance();
    const result = await classifier(text, labels);

    const scores = result.labels.reduce((obj, label, index) => {
        obj[label] = result.scores[index];
        return obj;
    }, {});
    
    return scores;
} 