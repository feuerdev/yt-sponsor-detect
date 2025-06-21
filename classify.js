import { pipeline } from '@xenova/transformers';

/**
 * @class Classifier
 *
 * @description
 * A singleton class for zero-shot text classification. This allows us to classify text
 * against arbitrary labels without needing a model pre-trained on those specific labels.
 * We use a mobile-friendly model to ensure it runs efficiently in a browser extension.
 */
class Classifier {
    static task = 'zero-shot-classification';
    static model = 'Xenova/mobilebert-uncased-mnli';
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            this.instance = await pipeline(this.task, this.model, { 
                progress_callback,
                quantized: true // Use the smallest quantized model
            });
        }
        return this.instance;
    }
}

const main = async () => {
    // The script now expects two arguments: the text to classify, and a comma-separated list of labels.
    const text = process.argv[2];
    const labels = process.argv[3]?.split(',');

    if (!text || !labels) {
        console.error('Usage: npm run classify "your text here" "label1,label2,label3"');
        process.exit(1);
    }

    console.log(`Analyzing text: "${text}"`);
    console.log(`With labels: [${labels.join(', ')}]`);

    // Initialize the classifier.
    const classifier = await Classifier.getInstance(data => {
        console.log(`Loading model... ${data.status} (${Math.round(data.progress || 0)}%)`);
    });

    // Perform the classification with the provided text and labels.
    const result = await classifier(text, labels);
    
    console.log('Classification result:');
    console.log(result);
};

main(); 