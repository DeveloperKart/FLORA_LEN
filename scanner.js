
const MODEL_URL =
    "https://teachablemachine.withgoogle.com/models/mIiK1Xitk/";

const CONFIDENCE_THRESHOLD = 0.85;
const REQUIRED_STABLE_FRAMES = 5;

let model = null;
let webcam = null;
let scanning = false;
let voiceEnabled = true;
let scanningLoop = null;

// Voice control: remember the last plant announced.
let lastAnnouncedLabel = "";
let lastCandidateLabel = "";
let stableFrames = 0;

const camera = document.getElementById("camera");
const statusText = document.getElementById("status");
const resultText = document.getElementById("result");
const detailsText = document.getElementById("details");
const predictionsBox = document.getElementById("predictions");
const confidenceInfo = document.getElementById("confidenceInfo");

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const voiceBtn = document.getElementById("voiceBtn");

// Benefits and facts are educational information,
// not medical advice or proof of medicinal effectiveness.
const plantInfo = {
    "tulsi": {
        title: "Tulsi",
        benefits: [
            "Its aromatic leaves are used in cooking and traditional practices.",
            "Its flowers can provide food for visiting pollinators."
        ],
        fact:
            "Tulsi is also known as holy basil."
    },

    "bryophyllum pinnatum": {
        title: "Bryophyllum pinnatum",
        benefits: [
            "It makes an interesting ornamental succulent.",
            "It can be propagated using plantlets that grow along leaf margins."
        ],
        fact:
            "Its leaf margins can develop tiny plantlets."
    },

    "kalanchoe pinnata": {
        title: "Bryophyllum pinnatum",
        benefits: [
            "It makes an interesting ornamental succulent.",
            "It can be propagated using plantlets that grow along leaf margins."
        ],
        fact:
            "Its leaf margins can develop tiny plantlets."
    },

    "aloe vera": {
        title: "Aloe Vera",
        benefits: [
            "It is a drought-tolerant plant once established.",
            "Its gel is used in some skincare products."
        ],
        fact:
            "Aloe vera has thick, fleshy leaves that store water."
    },

    "crabgrass": {
        title: "Crabgrass",
        benefits: [
            "It can provide ground cover in some environments.",
            "Its seeds can provide food for some seed-eating birds."
        ],
        fact:
            "Crabgrass is a common grass weed in lawns and gardens."
    }
};

function normaliseLabel(label) {
    return label.trim().toLowerCase();
}

function getPlantInfo(label) {
    return plantInfo[normaliseLabel(label)] || {
        title: label,
        benefits: [
            "The model has classified this image into this category.",
            "Further identification may help establish its practical uses."
        ],
        fact:
            "This name comes from the class labels in your trained model."
    };
}

function speakPlant(label, confidence) {
    if (
        !voiceEnabled ||
        !("speechSynthesis" in window)
    ) {
        return;
    }

    const info = getPlantInfo(label);

    const announcement =
        `FloraLens identifies ${info.title}. ` +
        `Confidence: ${Math.round(confidence * 100)} percent. ` +
        `Benefit one: ${info.benefits[0]} ` +
        `Benefit two: ${info.benefits[1]} ` +
        `Interesting fact: ${info.fact}`;

    // Cancel any previous speech only when a new plant
    // qualifies for an announcement.
    window.speechSynthesis.cancel();

    const utterance =
        new SpeechSynthesisUtterance(announcement);

    utterance.lang = "en-IN";
    utterance.rate = 0.95;
    utterance.pitch = 1;

    window.speechSynthesis.speak(utterance);
}

async function loadModel() {
    if (model) return;

    statusText.textContent = "Loading FloraLens AI...";

    model = await tmImage.load(
        MODEL_URL + "model.json",
        MODEL_URL + "metadata.json"
    );

    statusText.textContent = "AI model loaded.";
}

async function startScanner() {
    if (scanning) return;

    startBtn.disabled = true;

    try {
        await loadModel();

        statusText.textContent =
            "Requesting camera permission...";

        webcam = new tmImage.Webcam(320, 320, true);

        await webcam.setup();
        await webcam.play();

        camera.replaceChildren(webcam.canvas);

        scanning = true;
        stopBtn.disabled = false;

        lastCandidateLabel = "";
        stableFrames = 0;

        statusText.textContent =
            "Scanning for plants...";

        scanningLoop = requestAnimationFrame(scanFrame);

    } catch (error) {
        console.error("FloraLens startup error:", error);

        if (webcam) {
            try {
                webcam.stop();
            } catch (cleanupError) {
                console.warn(cleanupError);
            }
            webcam = null;
        }

        scanning = false;
        startBtn.disabled = false;
        stopBtn.disabled = true;

        statusText.textContent =
            "Could not start. Check internet access, " +
            "camera permission, and the model URL.";
    }
}

async function scanFrame() {
    if (!scanning || !webcam || !model) return;

    try {
        webcam.update();

        const predictions =
            await model.predict(webcam.canvas);

        if (!scanning) return;

        predictions.sort(
            (a, b) => b.probability - a.probability
        );

        const best = predictions[0];

        renderPredictions(predictions);

        if (!best || best.probability <= CONFIDENCE_THRESHOLD) {
            resultText.textContent =
                "Waiting for confidence above 85%";

            detailsText.textContent =
                "Keep one plant clearly in view.";

            confidenceInfo.textContent =
                "No prediction has crossed the 85% threshold.";

            lastCandidateLabel = "";
            stableFrames = 0;

        } else {
            const info = getPlantInfo(best.className);

            resultText.textContent = info.title;

            detailsText.textContent =
                `Benefit 1: ${info.benefits[0]} ` +
                `Benefit 2: ${info.benefits[1]} ` +
                `Fact: ${info.fact}`;

            confidenceInfo.textContent =
                `Confidence: ${(best.probability * 100).toFixed(1)}%`;

            // Require the same qualifying prediction for five
            // consecutive frames before considering it stable.
            if (best.className === lastCandidateLabel) {
                stableFrames++;
            } else {
                lastCandidateLabel = best.className;
                stableFrames = 1;
            }

            // Announce ONLY if:
            // 1. Confidence is above 85%.
            // 2. The prediction is stable.
            // 3. It differs from the last announced plant.
            if (
                stableFrames >= REQUIRED_STABLE_FRAMES &&
                best.className !== lastAnnouncedLabel
            ) {
                if (voiceEnabled) {
                    speakPlant(
                        best.className,
                        best.probability
                    );
                }

                lastAnnouncedLabel = best.className;

                statusText.textContent =
                    `Announced ${info.title}. Waiting for a different plant above 85%.`;
            }
        }

    } catch (error) {
        console.error("Prediction error:", error);

        statusText.textContent =
            "Prediction error. Check the browser console.";
    }

    if (scanning) {
        scanningLoop = requestAnimationFrame(scanFrame);
    }
}

function renderPredictions(predictions) {
    predictionsBox.replaceChildren();

    for (const prediction of predictions) {
        const percent = prediction.probability * 100;

        const row = document.createElement("div");
        row.className = "prediction";

        const label = document.createElement("div");

        label.textContent =
            `${prediction.className}: ${percent.toFixed(1)}%`;

        const bar = document.createElement("div");
        bar.className = "bar";

        const fill = document.createElement("div");
        fill.className = "fill";
        fill.style.width = `${percent}%`;

        bar.appendChild(fill);
        row.append(label, bar);
        predictionsBox.appendChild(row);
    }
}

function stopScanner() {
    scanning = false;

    if (scanningLoop !== null) {
        cancelAnimationFrame(scanningLoop);
        scanningLoop = null;
    }

    if (webcam) {
        try {
            webcam.stop();
        } catch (error) {
            console.warn("Camera cleanup:", error);
        }

        webcam = null;
    }

    camera.replaceChildren();

    if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }

    startBtn.disabled = false;
    stopBtn.disabled = true;

    resultText.textContent = "Waiting for a plant...";
    detailsText.textContent =
        "Start the scanner to identify a plant.";

    confidenceInfo.textContent =
        "Confidence scores will appear here.";

    predictionsBox.replaceChildren();
    statusText.textContent = "Scanner stopped.";

    lastCandidateLabel = "";
    stableFrames = 0;

    // Reset for the next scanning session.
    lastAnnouncedLabel = "";
}

startBtn.addEventListener("click", startScanner);
stopBtn.addEventListener("click", stopScanner);

voiceBtn.addEventListener("click", () => {
    voiceEnabled = !voiceEnabled;

    voiceBtn.textContent =
        `Voice: ${voiceEnabled ? "ON" : "OFF"}`;

    if (!voiceEnabled && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }

    statusText.textContent = voiceEnabled
        ? "Voice enabled. A different qualifying plant will be announced."
        : "Voice disabled.";
});

window.addEventListener("pagehide", stopScanner);
