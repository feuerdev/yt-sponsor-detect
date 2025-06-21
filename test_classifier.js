import { pipeline } from '@xenova/transformers';
import { testData } from './test_data.js';

// Re-using the same singleton class from classify.js would be ideal,
// but for a standalone test script, defining it here is simple and effective.
class Classifier {
    static task = 'zero-shot-classification';
    static model = 'Xenova/mobilebert-uncased-mnli';
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            this.instance = await pipeline(this.task, this.model, {
                progress_callback,
                quantized: false,
            });
        }
        return this.instance;
    }
}

const main = async () => {
    console.log('Starting classifier feasibility test...');

    let lastLoggedProgress = 0;
    const classifier = await Classifier.getInstance(data => {
        if (data.status === 'progress') {
            // Only log download progress, not every single tick.
            const progress = Math.round(data.progress);
            // Avoid spamming the console; log every 5%
            if (progress % 5 === 0 && progress !== (lastLoggedProgress || 0)) {
                console.log(`Loading model... ${progress}%`);
                lastLoggedProgress = progress;
            }
        } else if (data.status === 'ready') {
            console.log('Model loaded and ready.');
        }
    });

    const labels = ['promotional content', 'neutral content'];
    let passed = 0;
    let failed = 0;

    console.log('\n--- Running Tests ---\n');

    for (const item of testData) {
        const result = await classifier(item.text, labels);
        const topResult = result.labels[0];

        const classifiedAs = (topResult === 'promotional content') ? 'sponsored' : 'regular';

        let status = '✅ PASSED';
        if (classifiedAs !== item.expected) {
            status = '❌ FAILED';
            failed++;
        } else {
            passed++;
        }

        console.log(`- Test: ${status}`);
        console.log(`  - Text: "${item.text.substring(0, 80)}..."`);
        console.log(`  - Expected: ${item.expected}`);
        console.log(`  - Got: ${classifiedAs} (Score: ${result.scores[0].toFixed(4)})`);
        console.log('---');
    }

    console.log(`\n--- Test Summary ---`);
    console.log(`Total Tests: ${testData.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Accuracy: ${((passed / testData.length) * 100).toFixed(2)}%`);
    console.log(`--------------------\n`);

    if (failed > 0) {
        process.exit(1); // Exit with error code if any test fails
    }
};

main(); 