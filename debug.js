import { Classifier } from './src/classifier.js';

const main = async () => {
    // The script now expects two arguments: the text to classify, and a comma-separated list of labels.
    const text = process.argv[2];
    const labels = process.argv[3]?.split(',');

    if (!text || !labels) {
        console.error('Usage: npm run debug "your text here" "label1,label2,label3"');
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