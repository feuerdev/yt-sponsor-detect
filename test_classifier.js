import { classifyText } from './src/classifier.js';
import { testData } from './test_data.js';

const experiments = [
    {
        name: "Descriptive Sentences",
        labels: [
            "This is a paid promotion, endorsement, or sponsorship.",
            "This is neutral, normal, or regular content."
        ],
        getPromotionalScore: (scores) => scores["This is a paid promotion, endorsement, or sponsorship."]
    },
    {
        name: "Simple Keywords",
        labels: ["sponsor", "neutral"],
        getPromotionalScore: (scores) => scores.sponsor
    },
    {
        name: "Multi-Label Keywords",
        labels: ["sponsor", "advertisement", "promotion", "neutral", "regular content"],
        getPromotionalScore: (scores) => Math.max(scores.sponsor || 0, scores.advertisement || 0, scores.promotion || 0)
    },
    {
        name: "Hypothesis Template",
        labels: [
            "This text is about a paid promotion.",
            "This text is about a regular video segment."
        ],
        getPromotionalScore: (scores) => scores["This text is about a paid promotion."]
    },
    {
        name: "Specific Promo Keywords",
        labels: ["sponsored by", "thanks to our sponsor", "get 20% off", "link in description", "neutral content"],
        getPromotionalScore: (scores) => Math.max(
            scores["sponsored by"] || 0,
            scores["thanks to our sponsor"] || 0,
            scores["get 20% off"] || 0,
            scores["link in description"] || 0
        )
    },
    {
        name: "Explicit Call to Action",
        labels: ["promotional content", "call to action", "neutral content"],
        getPromotionalScore: (scores) => scores["promotional content"]
    }
];

const main = async () => {
    console.log('Starting classifier experimentation suite...');
    await classifyText("priming the model", ["test"]);
    console.log('Model loaded and ready.');

    let bestExperimentResult = { name: null, accuracy: 0, threshold: 0, labels: [] };

    for (const experiment of experiments) {
        console.log(`\n--- Running Experiment: "${experiment.name}" ---`);
        let bestThresholdForExp = 0;
        let maxAccuracyForExp = 0;

        const thresholds = [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.99, 0.999];
        
        for (const threshold of thresholds) {
            let passed = 0;
            for (const item of testData) {
                const scores = await classifyText(item.text, experiment.labels);
                const promotionalScore = experiment.getPromotionalScore(scores);
                const predictedLabel = promotionalScore > threshold ? 'sponsor' : 'neutral';
                
                if (predictedLabel === item.expected) {
                    passed++;
                }
            }
            const accuracy = (passed / testData.length);
            if (accuracy >= maxAccuracyForExp) {
                maxAccuracyForExp = accuracy;
                bestThresholdForExp = threshold;
            }
        }
        
        console.log(`  Best result for "${experiment.name}": ${(maxAccuracyForExp * 100).toFixed(2)}% accuracy at >= ${bestThresholdForExp.toFixed(2)} threshold.`);

        if (maxAccuracyForExp > bestExperimentResult.accuracy) {
            bestExperimentResult = {
                name: experiment.name,
                accuracy: maxAccuracyForExp,
                threshold: bestThresholdForExp,
                labels: experiment.labels
            };
        }
    }
    
    console.log('\n\n--- Overall Best Result ---');
    console.log(`Experiment: "${bestExperimentResult.name}"`);
    console.log(`Accuracy: ${(bestExperimentResult.accuracy * 100).toFixed(2)}%`);
    console.log(`Optimal Threshold: ${bestExperimentResult.threshold.toFixed(2)}`);
    console.log(`Winning Labels:`, bestExperimentResult.labels);
    console.log('--------------------------\n');
};

main();