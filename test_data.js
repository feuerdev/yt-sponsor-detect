export const testData = [
    // === Sponsored Content ===
    {
        text: "This video is sponsored by AwesomeVPN. Use code 'USER' for 20% off.",
        expected: "sponsor"
    },
    {
        text: "Before we begin, I'd like to thank our friends at GlassWire for making this content possible. I've been using their firewall for years.",
        expected: "sponsor"
    },
    {
        text: "I'm so excited to tell you about Skillshare, the online learning community with thousands of inspiring classes for creative and curious people. Explore new skills, deepen existing passions, and get lost in creativity. The first 1,000 of my subscribers to click the link in the description will get a 1-month free trial.",
        expected: "sponsor"
    },
    {
        text: "This build wouldn't have been possible without the great components from PC-Parts. Check them out in the link below.",
        expected: "sponsor"
    },

    // === Regular Content ===
    {
        text: "Let's unbox this and see what we've got inside.",
        expected: "neutral"
    },
    {
        text: "In the previous video, we assembled the main chassis, and today we're moving on to the wiring and cable management.",
        expected: "neutral"
    },
    {
        text: "The architectural history of this building is quite fascinating, tracing its roots back to the early 19th century as a key trading post for the region. It has seen several renovations since then.",
        expected: "neutral"
    },
    {
        text: "I am absolutely blown away by the quality of this new camera. The dynamic range is just incredible and it feels great in the hand.",
        expected: "neutral"
    },
    {
        text: "Okay, let's get this connected and see if it boots up properly.",
        expected: "neutral"
    },

    // === False Positives (from user feedback) ===
    {
        text: "this happened— welcome by the way to the party, the Philippines,",
        expected: "neutral"
    },
    {
        text: "which triggers a mainland invasion of Taiwan, which prompts North Korea to attack South Korea,",
        expected: "neutral"
    },
    {
        text: "your warehouses, at which point you  are a golden target for opportunism.",
        expected: "neutral"
    }
]; 