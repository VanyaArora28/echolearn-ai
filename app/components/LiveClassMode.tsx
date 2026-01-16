"use client";
import React, { useState, useEffect, useRef } from "react";
import Webcam from "react-webcam";
import { FilesetResolver, GestureRecognizer } from "@mediapipe/tasks-vision";

// --- DATA: MAPPINGS ---
const signLanguageMap: Record<string, string> = {
  a: "https://upload.wikimedia.org/wikipedia/commons/2/27/Sign_language_A.svg",
  b: "https://upload.wikimedia.org/wikipedia/commons/1/18/Sign_language_B.svg",
  c: "https://upload.wikimedia.org/wikipedia/commons/e/e3/Sign_language_C.svg",
  d: "https://upload.wikimedia.org/wikipedia/commons/0/06/Sign_language_D.svg",
  e: "https://upload.wikimedia.org/wikipedia/commons/c/cd/Sign_language_E.svg",
};

// IMPROVED MAPPING: Real Classroom ASL Meanings
const gestureToTextMap: Record<string, string> = {
  Thumb_Up: "Yes, I understand.",
  Thumb_Down: "No, I am confused.",
  Open_Palm: "Hello! / Stop.",
  Victory: "May I go to the restroom?",
  Closed_Fist: "I am done writing.",
  Pointing_Up: "I have a question.",
  ILoveYou: "Thank you, Teacher!",
};

export default function LiveClassMode() {
  // --- TEACHER STATE ---
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState(
    "Press 'Start Class' and speak..."
  );
  const [words, setWords] = useState<string[]>([]);

  // --- STUDENT STATE ---
  const webcamRef = useRef<Webcam>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [studentMessage, setStudentMessage] = useState("Waiting for signs...");
  const [voiceGender, setVoiceGender] = useState<"female" | "male">("female"); // <-- NEW TOGGLE

  // REFS FOR LOGIC
  const gestureRecognizerRef = useRef<GestureRecognizer | null>(null);
  const lastSpokenGestureRef = useRef<string>("None");
  const gestureHoldCounterRef = useRef<number>(0);
  const currentPotentialGestureRef = useRef<string>("None");
  const [availableVoices, setAvailableVoices] = useState<
    SpeechSynthesisVoice[]
  >([]);

  // 1. LOAD VOICES
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
    };
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
  }, []);

  // 2. TEACHER SPEECH RECOGNITION
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

  // 3. STUDENT GESTURE LOGIC + SMART VOICE SELECTION
  const speakText = (text: string) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 1;

      // --- SMART VOICE HUNTER ---
      let chosenVoice = null;

      if (voiceGender === "female") {
        // Try to find high-quality female voices
        chosenVoice =
          availableVoices.find((v) => v.name.includes("Google US English")) ||
          availableVoices.find((v) => v.name.includes("Zira")) ||
          availableVoices.find((v) => v.name.includes("Samantha")) ||
          availableVoices.find((v) => v.name.toLowerCase().includes("female"));
      } else {
        // Try to find high-quality male voices
        chosenVoice =
          availableVoices.find((v) =>
            v.name.includes("Google UK English Male")
          ) ||
          availableVoices.find((v) => v.name.includes("David")) ||
          availableVoices.find((v) => v.name.includes("Daniel")) ||
          availableVoices.find((v) => v.name.toLowerCase().includes("male"));
      }

      if (chosenVoice) {
        utterance.voice = chosenVoice;
        console.log("Speaking with:", chosenVoice.name); // Debugging
      }

      window.speechSynthesis.speak(utterance);
    }
  };

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

        if (results.gestures.length > 0 && results.gestures[0][0].score > 0.6) {
          const rawGesture = results.gestures[0][0].categoryName;

          if (rawGesture === currentPotentialGestureRef.current) {
            gestureHoldCounterRef.current += 1;
          } else {
            currentPotentialGestureRef.current = rawGesture;
            gestureHoldCounterRef.current = 0;
          }

          if (gestureHoldCounterRef.current > 20) {
            // Slight increase for stability
            if (
              rawGesture !== lastSpokenGestureRef.current &&
              gestureToTextMap[rawGesture]
            ) {
              const message = gestureToTextMap[rawGesture];
              setStudentMessage(message);
              speakText(message);

              lastSpokenGestureRef.current = rawGesture;
            }
          }
        } else {
          lastSpokenGestureRef.current = "None";
          gestureHoldCounterRef.current = 0;
          currentPotentialGestureRef.current = "None";
        }
      }
      animationFrameId = requestAnimationFrame(predictWebcam);
    };
    if (cameraReady) predictWebcam();
    return () => cancelAnimationFrame(animationFrameId);
  }, [cameraReady, availableVoices, voiceGender]); // Re-run if voice settings change

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl">
      {/* TEACHER VIEW */}
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
        <div className="bg-black/30 p-4 rounded min-h-[50px] border border-slate-600 mb-4">
          <p className="text-lg text-white font-mono">{transcript}</p>
        </div>
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

      {/* STUDENT VIEW */}
      <div className="bg-slate-800 p-6 rounded-xl border border-green-500 shadow-xl flex gap-6">
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

        <div className="w-1/2 flex flex-col justify-center gap-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-green-400">🎓 Student</h2>

            {/* VOICE TOGGLE SWITCH */}
            <div className="bg-slate-700 p-1 rounded-full flex gap-1">
              <button
                onClick={() => setVoiceGender("female")}
                className={`px-3 py-1 rounded-full text-sm font-bold transition-all ${
                  voiceGender === "female"
                    ? "bg-pink-500 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                👩 Female
              </button>
              <button
                onClick={() => setVoiceGender("male")}
                className={`px-3 py-1 rounded-full text-sm font-bold transition-all ${
                  voiceGender === "male"
                    ? "bg-blue-500 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                👨 Male
              </button>
            </div>
          </div>

          <p className="text-slate-400 text-sm">
            Sign to speak to the teacher.
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 mb-2">
            <span>👍 = Yes</span>
            <span>👎 = No</span>
            <span>☝️ = Question</span>
            <span>✌️ = Restroom</span>
            <span>✊ = Done</span>
            <span>🤟 = Thanks</span>
          </div>

          <div className="bg-black/40 p-6 rounded-xl border-l-4 border-green-500 min-h-[100px] flex items-center justify-center relative">
            <span className="absolute top-2 right-2 text-2xl">🔊</span>
            <p className="text-2xl font-bold text-white text-center animate-bounce-short">
              {studentMessage}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
