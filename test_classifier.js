import { classifyText, PROMOTIONAL_LABEL, NEUTRAL_LABEL } from './src/classifier.js';
import { testData } from './test_data.js';

const main = async () => {
    console.log('Starting classifier test suite...');

    // We only need to run this once to ensure the model is downloaded.
    await classifyText("priming the model", 0.95); 
    console.log('Model loaded and ready.');

    const thresholds = [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.98, 0.99];
    let bestThreshold = 0;
    let maxAccuracy = 0;

    console.log(`\n--- Running Tests for ${testData.length} Items Across ${thresholds.length} Thresholds ---\n`);

    for (const threshold of thresholds) {
        let passed = 0;
        let failed = 0;

        for (const item of testData) {
            const result = await classifyText(item.text, threshold);
            const predictedLabel = result.block ? PROMOTIONAL_LABEL : NEUTRAL_LABEL;

            if (predictedLabel === item.expected) {
                passed++;
            } else {
                failed++;
            }
        }
        
        const accuracy = (passed / testData.length);
        console.log(`- Threshold: ${threshold.toFixed(2)} | Accuracy: ${(accuracy * 100).toFixed(2)}% (${passed}/${testData.length})`);

        if (accuracy > maxAccuracy) {
            maxAccuracy = accuracy;
            bestThreshold = threshold;
        }
    }

    console.log(`\n--- Test Summary ---`);
    console.log(`Best performing threshold: ${bestThreshold.toFixed(2)} with ${maxAccuracy * 100}% accuracy.`);
    console.log(`--------------------\n`);
};

main(); 