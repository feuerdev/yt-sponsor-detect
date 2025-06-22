import { pipeline } from '@xenova/transformers';

export const PROMOTIONAL_LABEL = 'sponsor';
export const NEUTRAL_LABEL = 'neutral';

/**
 * @class Classifier
 *
 * @description
 * A singleton class for zero-shot text classification.
 */
export class Classifier {
    static task = 'zero-shot-classification';
    static model = 'Xenova/mobilebert-uncased-mnli';
    static labels = [PROMOTIONAL_LABEL, NEUTRAL_LABEL]; // Source of truth for labels
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            this.instance = await pipeline(this.task, this.model, {
                progress_callback,
                quantized: false, // Full-precision model for better accuracy
            });
        }
        return this.instance;
    }
}

/**
 * Classifies a given text as either 'sponsored' or 'regular'.
 * This is the single public entry point for the classification logic.
 * 
 * @param {string} text The text to classify.
 * @param {number} threshold The confidence threshold to decide whether to block.
 * @returns {Promise<{block: boolean, scores: Record<string, number>}>} An object containing the block decision and the scores for each label.
 */
export async function classifyText(text, threshold) {
    const classifier = await Classifier.getInstance();
    const result = await classifier(text, Classifier.labels);

    const scores = result.labels.reduce((obj, label, index) => {
        obj[label] = result.scores[index];
        return obj;
    }, {});

    const promotionalScore = scores[PROMOTIONAL_LABEL] || 0;
    const block = promotionalScore > threshold;
    
    return { block, scores };
} 