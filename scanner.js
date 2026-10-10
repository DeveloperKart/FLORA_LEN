
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

// Normalize labels returned by Teachable Machine.
function normaliseLabel(label) {
    return String(label || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

// Match model labels to the information database.
function getClassInfo(label) {
    const name = normaliseLabel(label);

    const aliases = {
        "tulsi": "tulsi",
        "bryophyllum pinnatum": "bryophyllum pinnatum",
        "brophyllum pinnatum": "bryophyllum pinnatum",
        "aloe vera": "aloe vera",
        "crabgrass": "crabgrass",
        "background/noise": "background / noise",
        "background noise": "background / noise",
        "background": "background / noise"
    };

    return classInfo[aliases[name] || name] || null;
}

// This function was missing from your pasted code.
function setStatus(message) {
    if (statusText) {
        statusText.textContent = message;
    }
}

function resetDetection() {
    previousLabel = "";
    stableFrames = 0;
}

function showWaitingMessage(message) {
    resultText.textContent = message;
    detailsText.textContent = "";
    confidenceInfo.textContent = "";
}

// Display the correct information for each class.
function displayResult(label, confidence) {
    const info = getClassInfo(label);

    resultText.textContent = label;
    confidenceInfo.textContent =
        `Confidence: ${(confidence * 100).toFixed(1)}%`;

    detailsText.style.whiteSpace = "pre-line";

    if (!info) {
        detailsText.textContent =
            "This class is not configured in FloraLens. Check the model's exact class label.";
        return;
    }

    if (info.type === "medicinal") {
        detailsText.textContent = info.benefits.join("\n\n");
    } else {
        // Crabgrass gets weed information.
        // Background / Noise gets only its designated message.
        detailsText.textContent = info.information;
    }
}

// Voice announces the complete sentence, never the benefits.
function announceClassName(label) {
    if (!voiceEnabled || !("speechSynthesis" in window)) {
        return;
    }

    if (
        normaliseLabel(label) ===
        normaliseLabel(lastAnnouncedLabel)
    ) {
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

// Draw a confidence poll for every class.
function displayPredictions(predictions) {
    predictionsText.replaceChildren();

    predictions.forEach(prediction => {
        const percentage = Math.max(
            0,
            Math.min(100, prediction.probability * 100)
        );

        const row = document.createElement("div");
        row.style.marginBottom = "12px";

        const heading = document.createElement("div");
        heading.style.display = "flex";
        heading.style.justifyContent = "space-between";
        heading.style.gap = "10px";
        heading.style.marginBottom = "4px";

        const name = document.createElement("span");
        name.textContent = prediction.className;

        const value = document.createElement("span");
        value.textContent = `${percentage.toFixed(1)}%`;

        heading.append(name, value);

        const track = document.createElement("div");
        track.style.width = "100%";
        track.style.height = "10px";
        track.style.backgroundColor = "#e5e7eb";
        track.style.borderRadius = "6px";
        track.style.overflow = "hidden";

        const bar = document.createElement("div");
        bar.style.width = `${percentage}%`;
        bar.style.height = "100%";
        bar.style.backgroundColor = "#16a34a";
        bar.style.borderRadius = "6px";
        bar.style.transition = "width 0.2s ease";

        track.appendChild(bar);
        row.append(heading, track);
        predictionsText.appendChild(row);
    });
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

        camera.replaceChildren();
        camera.appendChild(webcam.canvas);

        isRunning = true;
        resetDetection();
        confirmedLabel = "";

        setStatus("Scanner running. Point the camera at a plant.");
        showWaitingMessage("Looking for a supported class...");

        stopBtn.disabled = false;
        animationId = requestAnimationFrame(scanLoop);

    } catch (error) {
        console.error("FloraLens scanner error:", error);

        if (webcam) {
            try {
                webcam.stop();
            } catch (_) {}
            webcam = null;
        }

        setStatus(
            "Could not start the scanner. Check camera permission, internet connection, and browser console."
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
                normaliseLabel(label) ===
                normaliseLabel(previousLabel)
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
        setStatus("Prediction error. Check the browser console.");
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

    camera.replaceChildren();
    resetDetection();
    confirmedLabel = "";
    lastAnnouncedLabel = "";

    setStatus("Scanner stopped.");
    showWaitingMessage("Press Start Scanner to begin.");

    predictionsText.replaceChildren();

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

    // Do not repeat the already-confirmed class when voice is enabled.
    lastAnnouncedLabel = confirmedLabel;
}

startBtn.addEventListener("click", startScanner);
stopBtn.addEventListener("click", stopScanner);
voiceBtn.addEventListener("click", toggleVoice);

stopBtn.disabled = true;
voiceBtn.textContent = "Voice: OFF";

setStatus("Ready to scan.");
showWaitingMessage("Press Start Scanner to begin.");
