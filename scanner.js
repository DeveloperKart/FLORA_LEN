
const MODEL_URL = "https://teachablemachine.withgoogle.com/models/mIiK1Xitk/";
const CONFIDENCE_THRESHOLD = 0.85;
const REQUIRED_STABLE_FRAMES = 5;

const camera = document.getElementById("camera");
const statusText = document.getElementById("status");
const resultText = document.getElementById("result");
const detailsText = document.getElementById("details");
const predictionsText = document.getElementById("predictions");
const confidenceInfo = document.getElementById("confidenceInfo");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const voiceBtn = document.getElementById("voiceBtn");

// Information displayed for each supported class.
// Voice output will NEVER read these descriptions aloud.
const classInfo = {
    "tulsi": {
        type: "plant",
        benefits: [
            "Traditionally used in herbal preparations for coughs and colds.",
            "Tulsi contains plant compounds that have shown antioxidant activity in laboratory studies."
        ],
        fact: "Tulsi is also known as holy basil and is commonly grown in Indian homes."
    },

    "bryophyllum pinnatum": {
        type: "plant",
        benefits: [
            "Traditionally used in some communities in herbal preparations; reliable evidence for many claimed medicinal effects is limited.",
            "Its leaves contain plant compounds being studied for their biological properties."
        ],
        fact: "Its leaves can develop small plantlets along their edges."
    },

    "aloe vera": {
        type: "plant",
        benefits: [
            "Aloe vera gel is commonly used to moisturize dry skin.",
            "Some aloe vera gel products may help soothe minor skin irritation; evidence varies by use and product."
        ],
        fact: "Aloe vera is a succulent that stores water in its fleshy leaves."
    },

    "crabgrass": {
        type: "weed",
        benefits: [
            "It often spreads close to the ground and can grow in lawns, gardens and disturbed soil.",
            "Many crabgrass species have seed heads with several finger-like spikes."
        ],
        fact: "Crabgrass commonly refers to grasses in the genus Digitaria. Similar-looking grasses can be difficult to distinguish."
    },

    "background / noise": {
        type: "background"
    }
};

let model = null;
let webcam = null;
let animationId = null;
let isRunning = false;
let voiceEnabled = false;

let previousLabel = "";
let stableFrames = 0;
let confirmedLabel = "";
let lastAnnouncedLabel = "";

// Makes label matching more reliable.
function normaliseLabel(label) {
    return String(label || "").trim().toLowerCase();
}

function getClassInfo(label) {
    return classInfo[normaliseLabel(label)] || null;
}

function isBackground(label) {
    return normaliseLabel(label) === "background / noise";
}

function setStatus(message) {
    statusText.textContent = message;
}

// Reset the stable-detection sequence.
function resetDetection() {
    previousLabel = "";
    stableFrames = 0;
    confirmedLabel = "";
}

function showWaitingMessage(message) {
    resultText.textContent = message;
    detailsText.textContent = "";
    confidenceInfo.textContent = "";
}

// Display the information appropriate to the detected class.
function displayResult(label, confidence) {
    const info = getClassInfo(label);

    resultText.textContent = label;
    confidenceInfo.textContent =
        `Confidence: ${(confidence * 100).toFixed(1)}%`;

    if (!info) {
        detailsText.textContent =
            "This class is not configured in FloraLens.";
        return;
    }

    if (info.type === "background") {
        detailsText.textContent =
            "No supported plant detected.";
        return;
    }

    if (info.type === "weed") {
        detailsText.textContent =
            `Weed information:\n` +
            `1. ${info.benefits[0]}\n` +
            `2. ${info.benefits[1]}\n\n` +
            `Interesting fact: ${info.fact}`;
        return;
    }

    detailsText.textContent =
        `Medicinal benefits:\n` +
        `1. ${info.benefits[0]}\n` +
        `2. ${info.benefits[1]}\n\n` +
        `Interesting fact: ${info.fact}`;
}

// Speak ONLY the class name.
// Never pass the details or benefits to speech synthesis.
function announceClassName(label) {
    if (!voiceEnabled || !("speechSynthesis" in window)) {
        return;
    }

    if (label === lastAnnouncedLabel) {
        return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(label);
    utterance.lang = "en-IN";
    utterance.rate = 0.9;

    window.speechSynthesis.speak(utterance);
    lastAnnouncedLabel = label;
}

// Display the model's current predictions for debugging and feedback.
function displayPredictions(predictions) {
    predictionsText.textContent = predictions
        .map(prediction =>
            `${prediction.className}: ${(prediction.probability * 100).toFixed(1)}%`
        )
        .join("\n");
}

async function startScanner() {
    if (isRunning) return;

    try {
        setStatus("Loading FloraLens AI model...");
        startBtn.disabled = true;

        if (!model) {
            model = await tmImage.load(
                MODEL_URL + "model.json",
                MODEL_URL + "metadata.json"
            );
        }

        setStatus("Requesting camera permission...");

        webcam = new tmImage.Webcam(320, 320, true);
        await webcam.setup();
        await webcam.play();

        camera.innerHTML = "";
        camera.appendChild(webcam.canvas);

        isRunning = true;
        resetDetection();

        setStatus("Scanner running. Point the camera at a plant.");
        showWaitingMessage("Looking for a supported class...");

        startBtn.disabled = true;
        stopBtn.disabled = false;

        animationId = requestAnimationFrame(scanLoop);
    } catch (error) {
        console.error("FloraLens scanner error:", error);

        setStatus(
            "Could not start the scanner. Check camera permission and your internet connection."
        );

        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
}

async function scanLoop() {
    if (!isRunning || !webcam || !model) return;

    try {
        webcam.update();

        const predictions = await model.predict(webcam.canvas);
        displayPredictions(predictions);

        const topPrediction = predictions.reduce((best, current) =>
            current.probability > best.probability ? current : best
        );

        const label = topPrediction.className;
        const confidence = topPrediction.probability;

        if (confidence > CONFIDENCE_THRESHOLD) {
            if (normaliseLabel(label) === normaliseLabel(previousLabel)) {
                stableFrames++;
            } else {
                previousLabel = label;
                stableFrames = 1;
            }

            if (stableFrames >= REQUIRED_STABLE_FRAMES) {
                const normalised = normaliseLabel(label);

                if (normalised !== normaliseLabel(confirmedLabel)) {
                    confirmedLabel = label;
                    displayResult(label, confidence);
                    announceClassName(label);
                } else {
                    // Keep the displayed confidence up to date
                    // without repeatedly announcing the same class.
                    displayResult(label, confidence);
                }

                setStatus(`Detected: ${label}`);
            } else {
                setStatus(
                    `Checking detection stability... ${stableFrames}/${REQUIRED_STABLE_FRAMES}`
                );
            }
        } else {
            resetDetection();
            showWaitingMessage(
                "Not confident enough yet. Move the camera closer or try another angle."
            );
            setStatus("Searching for a supported class...");
        }
    } catch (error) {
        console.error("Prediction error:", error);
        setStatus("Prediction error. Please restart the scanner.");
    }

    if (isRunning) {
        animationId = requestAnimationFrame(scanLoop);
    }
}

function stopScanner() {
    isRunning = false;

    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    if (webcam) {
        webcam.stop();
        webcam = null;
    }

    if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }

    camera.innerHTML = "";
    resetDetection();

    setStatus("Scanner stopped.");
    showWaitingMessage("Press Start Scanner to begin.");

    startBtn.disabled = false;
    stopBtn.disabled = true;
}

function toggleVoice() {
    voiceEnabled = !voiceEnabled;

    voiceBtn.textContent = voiceEnabled
        ? "Voice: ON"
        : "Voice: OFF";

    if (!voiceEnabled && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }

    // Do not announce an old detection just because voice was enabled.
    // The next newly confirmed class can be announced.
    lastAnnouncedLabel = confirmedLabel;
}

startBtn.addEventListener("click", startScanner);
stopBtn.addEventListener("click", stopScanner);
voiceBtn.addEventListener("click", toggleVoice);

// Initial button states.
stopBtn.disabled = true;
voiceBtn.textContent = "Voice: OFF";
setStatus("Ready to scan.");
showWaitingMessage("Press Start Scanner to begin.");
