
/* ==========================================
   FLORALENS — AI PLANT SCANNER
   ========================================== */

const MODEL_URL =
    "https://teachablemachine.withgoogle.com/models/mIiK1Xitk/";

const CONFIDENCE_THRESHOLD = 0.85;
const REQUIRED_STABLE_FRAMES = 5;

// Scanner state
let model = null;
let webcam = null;
let scanning = false;
let voiceEnabled = true;
let scanningLoop = null;

// Voice announcement memory
let lastAnnouncedClass = "";
let candidateClass = "";
let stableFrames = 0;

// HTML elements from scanner.html
const camera = document.getElementById("camera");
const statusText = document.getElementById("status");
const resultText = document.getElementById("result");
const detailsText = document.getElementById("details");
const predictionsBox = document.getElementById("predictions");
const confidenceInfo = document.getElementById("confidenceInfo");

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const voiceBtn = document.getElementById("voiceBtn");

/* ==========================================
   PLANT INFORMATION
   ========================================== */

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
            "It is grown as an ornamental succulent.",
            "It can be propagated using plantlets that grow along its leaf margins."
        ],
        fact:
            "Tiny plantlets can develop along the edges of its leaves."
    },

    "aloe vera": {
        title: "Aloe Vera",
        benefits: [
            "It is a drought-tolerant plant once established.",
            "Its gel is used in some skincare products."
        ],
        fact:
            "Aloe Vera has thick, fleshy leaves that store water."
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

const BACKGROUND_CLASS = "background / noise";

/* ==========================================
   HELPER FUNCTIONS
   ========================================== */

function normaliseLabel(label) {
    return label.trim().toLowerCase();
}

function isBackground(label) {
    return normaliseLabel(label) === BACKGROUND_CLASS;
}

function getPlantInfo(label) {
    return plantInfo[normaliseLabel(label)] || {
        title: label,
        benefits: [
            "Further research may help establish its practical uses.",
            "Correct identification is important before relying on plant information."
        ],
        fact:
            "This class name comes from your trained AI model."
    };
}

/* ==========================================
   VOICE — SPEAK CLASS NAME ONLY
   ========================================== */

function speakClassName(label) {
    if (
        !voiceEnabled ||
        !("speechSynthesis" in window)
    ) {
        return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(label);

    utterance.lang = "en-IN";
    utterance.rate = 0.95;
    utterance.pitch = 1;

    window.speechSynthesis.speak(utterance);
}

/* ==========================================
   DISPLAY RESULTS
   ========================================== */

function displayResult(prediction) {
    const label = prediction.className;
    const confidence = prediction.probability;
    const percentage = (confidence * 100).toFixed(1);

    resultText.textContent = label;

    confidenceInfo.textContent =
        `Confidence: ${percentage}%`;

    if (isBackground(label)) {
        detailsText.textContent =
            "Background or noise detected. " +
            "Show a clear plant in front of the camera " +
            "to see its benefits and interesting facts.";

        return;
    }

    const info = getPlantInfo(label);

    resultText.textContent = info.title;

    detailsText.textContent =
        `Benefits\n` +
        `1. ${info.benefits[0]}\n` +
        `2. ${info.benefits[1]}\n\n` +
        `Interesting fact\n` +
        `${info.fact}`;

    detailsText.style.whiteSpace = "pre-line";
}

/* ==========================================
   CONFIDENCE BARS
   ========================================== */

function renderPredictions(predictions) {
    predictionsBox.replaceChildren();

    for (const prediction of predictions) {
        const percentage = prediction.probability * 100;

        const row = document.createElement("div");
        row.className = "prediction";

        const label = document.createElement("div");

        label.textContent =
            `${prediction.className}: ${percentage.toFixed(1)}%`;

        const bar = document.createElement("div");
        bar.className = "bar";

        const fill = document.createElement("div");
        fill.className = "fill";

        fill.style.width =
            `${Math.max(0, Math.min(100, percentage))}%`;

        bar.appendChild(fill);
        row.append(label, bar);
        predictionsBox.appendChild(row);
    }
}

/* ==========================================
   LOAD TEACHABLE MACHINE MODEL
   ========================================== */

async function loadModel() {
    if (model) return;

    statusText.textContent = "Loading FloraLens AI model...";

    model = await tmImage.load(
        MODEL_URL + "model.json",
        MODEL_URL + "metadata.json"
    );

    statusText.textContent =
        "Model loaded successfully.";
}

/* ==========================================
   START SCANNER
   ========================================== */

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

        candidateClass = "";
        stableFrames = 0;

        statusText.textContent =
            "Scanner running. Show a plant or background.";

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
            "Scanner could not start. Check your internet, " +
            "camera permission, and model URL.";
    }
}

/* ==========================================
   SCAN AND CLASSIFY
   ========================================== */

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

        renderPredictions(predictions);

        const best = predictions[0];

        if (!best) {
            statusText.textContent =
                "Waiting for a prediction.";

            candidateClass = "";
            stableFrames = 0;

        } else {
            // Always display the current best prediction.
            // Background predictions never show plant benefits.
            displayResult(best);

            if (
                best.probability <= CONFIDENCE_THRESHOLD
            ) {
                statusText.textContent =
                    "Waiting for confidence above 85%.";

                candidateClass = "";
                stableFrames = 0;

            } else {
                // Count consecutive frames for the same class.
                if (best.className === candidateClass) {
                    stableFrames++;
                } else {
                    candidateClass = best.className;
                    stableFrames = 1;
                }

                if (
                    stableFrames >= REQUIRED_STABLE_FRAMES &&
                    best.className !== lastAnnouncedClass
                ) {
                    // Announce only the class name.
                    speakClassName(best.className);

                    lastAnnouncedClass = best.className;

                    statusText.textContent =
                        `Announced: ${best.className}. ` +
                        "Waiting for a different qualifying class.";
                }
            }
        }

    } catch (error) {
        console.error("FloraLens prediction error:", error);

        statusText.textContent =
            "Prediction failed. Try restarting the scanner.";
    }

    if (scanning) {
        scanningLoop = requestAnimationFrame(scanFrame);
    }
}

/* ==========================================
   STOP SCANNER
   ========================================== */

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

    candidateClass = "";
    stableFrames = 0;

    // Start a fresh announcement sequence next time.
    lastAnnouncedClass = "";
}

/* ==========================================
   BUTTON EVENTS
   ========================================== */

startBtn.addEventListener("click", startScanner);

stopBtn.addEventListener("click", stopScanner);

voiceBtn.addEventListener("click", () => {
    voiceEnabled = !voiceEnabled;

    voiceBtn.textContent =
        `Voice: ${voiceEnabled ? "ON" : "OFF"}`;

    if (
        !voiceEnabled &&
        "speechSynthesis" in window
    ) {
        window.speechSynthesis.cancel();
    }

    statusText.textContent = voiceEnabled
        ? "Voice enabled."
        : "Voice disabled.";
});

window.addEventListener("pagehide", stopScanner);
