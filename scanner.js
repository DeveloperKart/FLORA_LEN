
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

const classInfo = {
    "tulsi": {
        type: "medicinal",
        benefits: [
            "Benefit 1: Tulsi leaves are traditionally used in herbal preparations for coughs and colds, although evidence for treating these conditions is limited.",
            "Benefit 2: Tulsi contains plant compounds with antioxidant activity demonstrated in laboratory studies."
        ]
    },

    "bryophyllum pinnatum": {
        type: "medicinal",
        benefits: [
            "Benefit 1: It is grown as an ornamental succulent and can be propagated using plantlets along its leaf margins.",
            "Benefit 2: It is studied by researchers for potentially useful plant compounds, including antioxidant activity; its medicinal effectiveness in humans is not well established."
        ]
    },

    "aloe vera": {
        type: "medicinal",
        benefits: [
            "Benefit 1: Aloe vera gel can help soothe and moisturize dry skin.",
            "Benefit 2: Certain aloe vera gel products may help soothe minor skin irritation and burns, although evidence varies by use and product."
        ]
    },

    "crabgrass": {
        type: "weed",
        information:
            "Crabgrass is a common grass weed that grows in lawns, gardens, fields, and along roadsides. It grows quickly and can compete with nearby plants for nutrients, water, light, and space."
    },

    "background / noise": {
        type: "background",
        information:
            "Benefits will appear here if any medicinal plant is recognized."
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

function normaliseLabel(label) {
    return String(label || "").trim().toLowerCase();
}

function getClassInfo(label) {
    return classInfo[normaliseLabel(label)] || null;
}

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

function displayResult(label, confidence) {
    const info = getClassInfo(label);

    resultText.textContent = label;
    confidenceInfo.textContent =
        `Confidence: ${(confidence * 100).toFixed(1)}%`;

    detailsText.style.whiteSpace = "pre-line";

    if (!info) {
        detailsText.textContent =
            "This class is not configured in FloraLens.";
        return;
    }

    if (info.type === "medicinal") {
        detailsText.textContent = info.benefits.join("\n\n");
        return;
    }

    // Crabgrass and Background / Noise display information,
    // but neither is treated as a medicinal plant.
    detailsText.textContent = info.information;
}

function announceClassName(label) {
    if (!voiceEnabled || !("speechSynthesis" in window)) {
        return;
    }

    const normalised = normaliseLabel(label);

    if (normalised === normaliseLabel(lastAnnouncedLabel)) {
        return;
    }

    window.speechSynthesis.cancel();

    const message = `FloraLens has identified it as ${label}.`;
    const utterance = new SpeechSynthesisUtterance(message);

    utterance.lang = "en-IN";
    utterance.rate = 0.9;

    window.speechSynthesis.speak(utterance);
    lastAnnouncedLabel = label;
}

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
        startBtn.disabled = true;
        setStatus("Loading FloraLens AI model...");

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

        stopBtn.disabled = false;
        animationId = requestAnimationFrame(scanLoop);

    } catch (error) {
        console.error("FloraLens scanner error:", error);

        setStatus(
            "Could not start the scanner. Check camera permission and internet connection."
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
            if (
                normaliseLabel(label) === normaliseLabel(previousLabel)
            ) {
                stableFrames++;
            } else {
                previousLabel = label;
                stableFrames = 1;
            }

            if (stableFrames >= REQUIRED_STABLE_FRAMES) {
                const isNewClass =
                    normaliseLabel(label) !==
                    normaliseLabel(confirmedLabel);

                confirmedLabel = label;

                displayResult(label, confidence);

                if (isNewClass) {
                    announceClassName(label);
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

    // Enabling voice does not repeat the class already announced.
    lastAnnouncedLabel = confirmedLabel;
}

startBtn.addEventListener("click", startScanner);
stopBtn.addEventListener("click", stopScanner);
voiceBtn.addEventListener("click", toggleVoice);

stopBtn.disabled = true;
voiceBtn.textContent = "Voice: OFF";

setStatus("Ready to scan.");
showWaitingMessage("Press Start Scanner to begin.");
