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
            // Dynamically import the pipeline function based on the environment.
            const { pipeline } = await (async () => {
                if (typeof self !== 'undefined' && typeof self.chrome !== 'undefined') {
                    // Running in the extension, so import from CDN.
                    return import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1');
                }
                // Running in Node.js for local testing.
                return import('@xenova/transformers');
            })();

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

    const promotionalScore = scores['promotional content'] || 0;
    const block = promotionalScore > threshold;
    
    return { block, scores };
} 