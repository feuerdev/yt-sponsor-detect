import { classifyText } from './src/classifier.js';
import { testData } from './test_data.js';

const main = async () => {
    console.log('Starting classifier feasibility test...');

    // We only need to run this once to ensure the model is downloaded.
    await classifyText("priming the model"); 
    console.log('Model loaded and ready.');

    let passed = 0;
    let failed = 0;

    console.log('\n--- Running Tests ---\n');

    for (const item of testData) {
        const result = await classifyText(item.text);

        let status = '✅ PASSED';
        if (result.classification !== item.expected) {
            status = '❌ FAILED';
            failed++;
        } else {
            passed++;
        }

        console.log(`- Test: ${status}`);
        console.log(`  - Text: "${item.text.substring(0, 80)}..."`);
        console.log(`  - Expected: ${item.expected}`);
        console.log(`  - Got: ${result.classification} (Score: ${result.score.toFixed(4)})`);
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