import { pipeline } from '@xenova/transformers';

/**
 * @class Classifier
 *
 * @description
 * A singleton class for zero-shot text classification.
 */
export class Classifier {
    static task = 'zero-shot-classification';
    static model = 'Xenova/mobilebert-uncased-mnli';
    static labels = ['promotional content', 'neutral content']; // Source of truth for labels
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
 * @returns {Promise<{classification: string, score: number}>} An object containing the classification and confidence score.
 */
export async function classifyText(text) {
    const classifier = await Classifier.getInstance();
    const result = await classifier(text, Classifier.labels);

    const topResult = result.labels[0];
    const topScore = result.scores[0];

    const classification = (topResult === 'promotional content') ? 'sponsored' : 'regular';
    
    return { classification, score: topScore };
} 