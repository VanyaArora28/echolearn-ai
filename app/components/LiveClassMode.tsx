"use client";
import React, { useState, useEffect, useRef } from "react";
import Webcam from "react-webcam";
import { FilesetResolver, GestureRecognizer } from "@mediapipe/tasks-vision";

// --- 1. DATA: MAPPINGS ---

// Teacher: Letter -> Image URL
const signLanguageMap: Record<string, string> = {
  a: "https://upload.wikimedia.org/wikipedia/commons/2/27/Sign_language_A.svg",
  b: "https://upload.wikimedia.org/wikipedia/commons/1/18/Sign_language_B.svg",
  c: "https://upload.wikimedia.org/wikipedia/commons/e/e3/Sign_language_C.svg",
  d: "https://upload.wikimedia.org/wikipedia/commons/0/06/Sign_language_D.svg",
  e: "https://upload.wikimedia.org/wikipedia/commons/c/cd/Sign_language_E.svg",
  // Add more as needed for demo...
};

// Student: Gesture -> Text Phrase
const gestureToTextMap: Record<string, string> = {
  Thumb_Up: "✅ I understand!",
  Thumb_Down: "❌ I am confused / I have a doubt.",
  Open_Palm: "✋ I have a question.",
  Victory: "✌️ May I go to the washroom?",
  Closed_Fist: "✍️ I am done writing.",
  Pointing_Up: "☝️ One minute please.",
};

export default function LiveClassMode() {
  // --- STATE: TEACHER (Speech to Sign) ---
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState(
    "Press 'Start Class' and speak..."
  );
  const [words, setWords] = useState<string[]>([]);

  // --- STATE: STUDENT (Sign to Text) ---
  const webcamRef = useRef<Webcam>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [studentMessage, setStudentMessage] = useState("Waiting for signs...");
  const [lastGesture, setLastGesture] = useState("None");
  const gestureRecognizerRef = useRef<GestureRecognizer | null>(null);

  // ----------------------------------------------------------------
  // 1. TEACHER LOGIC (Speech Recognition)
  // ----------------------------------------------------------------
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      !("webkitSpeechRecognition" in window)
    ) {
      setTranscript("Browser doesn't support speech recognition. Use Chrome.");
      return;
    }

    let recognition: any;
    if (isListening && typeof window !== "undefined") {
      // @ts-ignore
      recognition = new window.webkitSpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          finalTranscript += event.results[i][0].transcript;
        }
        setTranscript(finalTranscript);
        setWords(finalTranscript.toLowerCase().trim().split(" "));
      };
      recognition.start();
    }
    return () => {
      if (recognition) recognition.stop();
    };
  }, [isListening]);

  // ----------------------------------------------------------------
  // 2. STUDENT LOGIC (Gesture Recognition)
  // ----------------------------------------------------------------

  // Load AI Model
  useEffect(() => {
    const loadModel = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );
      gestureRecognizerRef.current = await GestureRecognizer.createFromOptions(
        vision,
        {
          baseOptions: {
            modelAssetPath: "/gesture_recognizer.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 1,
        }
      );
    };
    loadModel();
  }, []);

  // Predict Loop
  useEffect(() => {
    let animationFrameId: number;
    const predictWebcam = () => {
      if (
        gestureRecognizerRef.current &&
        webcamRef.current?.video?.readyState === 4
      ) {
        const results = gestureRecognizerRef.current.recognizeForVideo(
          webcamRef.current.video,
          Date.now()
        );

        if (results.gestures.length > 0 && results.gestures[0][0].score > 0.5) {
          const gestureName = results.gestures[0][0].categoryName;

          if (gestureName !== lastGesture && gestureToTextMap[gestureName]) {
            setLastGesture(gestureName);
            setStudentMessage(gestureToTextMap[gestureName]); // Update the text!
          }
        }
      }
      animationFrameId = requestAnimationFrame(predictWebcam);
    };
    if (cameraReady) predictWebcam();
    return () => cancelAnimationFrame(animationFrameId);
  }, [cameraReady, lastGesture]);

  // ----------------------------------------------------------------
  // UI RENDER
  // ----------------------------------------------------------------
  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl">
      {/* === SECTION 1: TEACHER VIEW (Speech -> Sign Images) === */}
      <div className="bg-slate-800 p-6 rounded-xl border border-blue-500 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-blue-400">
            👨‍🏫 Teacher: Speech-to-Sign
          </h2>
          <button
            onClick={() => setIsListening(!isListening)}
            className={`px-6 py-2 rounded-full font-bold transition-all ${
              isListening
                ? "bg-red-500 animate-pulse"
                : "bg-green-500 hover:bg-green-600"
            }`}
          >
            {isListening ? "Stop Class 🛑" : "Start Class 🎙️"}
          </button>
        </div>

        {/* Transcript Box */}
        <div className="bg-black/30 p-4 rounded min-h-[50px] border border-slate-600 mb-4">
          <p className="text-lg text-white font-mono">{transcript}</p>
        </div>

        {/* Sign Language Cards */}
        <div className="flex flex-wrap gap-2 justify-center bg-white/10 p-4 rounded-lg min-h-[120px]">
          {words.length > 0 ? (
            words.slice(-5).map((word, i) => (
              <div
                key={i}
                className="flex flex-col items-center bg-slate-100 p-2 rounded text-black"
              >
                <div className="flex gap-0.5">
                  {word.split("").map((char, index) =>
                    signLanguageMap[char] ? (
                      <img
                        key={index}
                        src={signLanguageMap[char]}
                        alt={char}
                        className="w-8 h-8"
                      />
                    ) : (
                      <span
                        key={index}
                        className="w-6 h-8 flex items-center justify-center font-bold bg-gray-300 rounded text-xs"
                      >
                        {char.toUpperCase()}
                      </span>
                    )
                  )}
                </div>
                <span className="text-xs font-bold mt-1 text-blue-700">
                  {word}
                </span>
              </div>
            ))
          ) : (
            <p className="text-slate-400 mt-8">
              Teacher signs will appear here...
            </p>
          )}
        </div>
      </div>

      {/* === SECTION 2: STUDENT VIEW (Sign -> Text) === */}
      <div className="bg-slate-800 p-6 rounded-xl border border-green-500 shadow-xl flex gap-6">
        {/* Webcam Area */}
        <div className="relative w-1/2 border-2 border-green-500 rounded-lg overflow-hidden bg-black">
          <Webcam
            ref={webcamRef}
            audio={false}
            videoConstraints={{ width: 480, height: 360 }}
            className="w-full h-full object-cover transform scale-x-[-1]"
            onUserMedia={() => setCameraReady(true)}
          />
          <div className="absolute bottom-2 left-2 bg-black/70 px-3 py-1 rounded text-green-400 font-mono text-sm">
            Student Camera Active
          </div>
        </div>

        {/* Translation Area */}
        <div className="w-1/2 flex flex-col justify-center gap-4">
          <h2 className="text-2xl font-bold text-green-400">
            🎓 Student: Sign-to-Text
          </h2>
          <p className="text-slate-400 text-sm">
            Make a gesture to speak to the teacher.
            <br />
            (Try: 👍 👎 ✋ ✌️ ✊)
          </p>

          <div className="bg-black/40 p-6 rounded-xl border-l-4 border-green-500 min-h-[150px] flex items-center justify-center">
            <p className="text-3xl font-bold text-white text-center animate-bounce-short">
              {studentMessage}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
