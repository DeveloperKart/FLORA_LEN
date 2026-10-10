
const MODEL_URL =
    "https://teachablemachine.withgoogle.com/models/mIiK1Xitk/";

const CONFIDENCE_THRESHOLD = 0.70;

let model = null;
let webcam = null;
let scanning = false;
let voiceEnabled = true;
let scanningLoop = null;
let lastSpokenLabel = "";
let lastSpokenTime = 0;
let lastStableLabel = "";
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

const plantInfo = {
    "tulsi": {
        title: "Tulsi",
        description:
            "Aromatic medicinal herb also known as holy basil."
    },

    "bryophyllum pinnatum": {
        title: "Bryophyllum pinnatum",
        description:
            "A succulent plant known for plantlets that can grow along its leaf margins."
    },

    "kalanchoe pinnata": {
        title: "Bryophyllum pinnatum",
        description:
            "A succulent plant known for plantlets that can grow along its leaf margins."
    },

    "aloe vera": {
        title: "Aloe Vera",
        description:
            "A succulent plant with thick leaves containing a clear inner gel."
    },

    "crabgrass": {
        title: "Crabgrass",
        description:
            "A common grass weed. Exact species identification may require closer examination."
    }
};

function normaliseLabel(label) {
    return label.trim().toLowerCase();
}

function getPlantInfo(label) {
    return plantInfo[normaliseLabel(label)] || {
        title: label,
        description:
            "This is a label from your trained AI model. " +
            "Confirm the plant identity before relying on this result."
    };
}

function speak(text) {
    if (!voiceEnabled || !("speechSynthesis" in window)) {
        return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = 0.95;

    window.speechSynthesis.speak(utterance);
}

async function loadModel() {
    if (model) {
        return;
    }

    statusText.textContent = "Loading your FloraLens AI model...";

    model = await tmImage.load(
        MODEL_URL + "model.json",
        MODEL_URL + "metadata.json"
    );

    statusText.textContent =
        "AI model loaded. Your camera is ready.";
}

async function startScanner() {
    if (scanning) {
        return;
    }

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
        startBtn.disabled = true;
        stopBtn.disabled = false;

        statusText.textContent =
            "Scanning. Place one plant clearly in view.";

        scanningLoop = requestAnimationFrame(scanFrame);
    } catch (error) {
        console.error("FloraLens scanner error:", error);

        statusText.textContent =
            "Could not start the scanner. Check your internet, " +
            "camera permission, and model URL.";

        if (webcam) {
            try {
                webcam.stop();
            } catch (stopError) {
                console.warn(stopError);
            }
            webcam = null;
        }

        scanning = false;
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
}

async function scanFrame() {
    if (!scanning || !webcam || !model) {
        return;
    }

    try {
        webcam.update();

        const predictions = await model.predict(webcam.canvas);

        if (!scanning) {
            return;
        }

        predictions.sort(
            (a, b) => b.probability - a.probability
        );

        const best = predictions[0];

        renderPredictions(predictions);

        if (best.probability < CONFIDENCE_THRESHOLD) {
            resultText.textContent = "Not sure yet";
            detailsText.textContent =
                "Try better lighting, a clearer view, or another angle.";

            confidenceInfo.textContent =
                "No prediction has reached the confidence threshold.";

            lastStableLabel = "";
            stableFrames = 0;
        } else {
            const info = getPlantInfo(best.className);

            resultText.textContent = info.title;
            detailsText.textContent = info.description;

            confidenceInfo.textContent =
                "Top prediction confidence: " +
                (best.probability * 100).toFixed(1) + "%.";

            if (best.className === lastStableLabel) {
                stableFrames++;
            } else {
                lastStableLabel = best.className;
                stableFrames = 1;
            }

            const now = Date.now();

            // Speak only after a prediction remains stable.
            // Avoid repeating the same announcement every frame.
            if (
                stableFrames >= 5 &&
                (
                    lastSpokenLabel !== best.className ||
                    now - lastSpokenTime > 8000
                )
            ) {
                speak(
                    "FloraLens identifies " + info.title +
                    ". Confidence " +
                    Math.round(best.probability * 100) +
                    " percent."
                );

                lastSpokenLabel = best.className;
                lastSpokenTime = now;
            }
        }

        statusText.textContent = "Scanner is running.";
    } catch (error) {
        console.error("Prediction error:", error);
        statusText.textContent =
            "Prediction failed. Stop and restart the scanner.";
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
            prediction.className + " — " +
            percent.toFixed(1) + "%";

        const bar = document.createElement("div");
        bar.className = "bar";

        const fill = document.createElement("div");
        fill.className = "fill";
        fill.style.width = percent + "%";

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

    statusText.textContent = "Scanner stopped.";
    resultText.textContent = "Waiting for a plant...";
    detailsText.textContent =
        "Start the scanner to identify a plant.";

    confidenceInfo.textContent =
        "Start scanning to see confidence scores.";

    predictionsBox.replaceChildren();

    lastSpokenLabel = "";
    lastSpokenTime = 0;
    lastStableLabel = "";
    stableFrames = 0;
}

startBtn.addEventListener("click", startScanner);
stopBtn.addEventListener("click", stopScanner);

voiceBtn.addEventListener("click", () => {
    voiceEnabled = !voiceEnabled;

    voiceBtn.textContent =
        "Voice: " + (voiceEnabled ? "ON" : "OFF");

    if (!voiceEnabled && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }

    statusText.textContent = voiceEnabled
        ? "Voice output enabled."
        : "Voice output disabled.";
});

window.addEventListener("pagehide", stopScanner);
