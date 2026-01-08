"use client";
import React, { useRef, useState, useEffect } from "react";
import Webcam from "react-webcam";
import { FilesetResolver, GestureRecognizer } from "@mediapipe/tasks-vision";

// Initial Default Questions
const defaultQuestions = [
  {
    id: 1,
    text: "What is the capital of France?",
    optionA: "Berlin",
    optionB: "Paris",
    correct: "B",
  },
  {
    id: 2,
    text: "Is C++ an Object Oriented Language?",
    optionA: "Yes",
    optionB: "No",
    correct: "A",
  },
];

export default function QuizMode() {
  // --- STATE ---
  const [role, setRole] = useState<"teacher" | "student">("student");
  const [questions, setQuestions] = useState(defaultQuestions);

  // Teacher Form State
  const [newQ, setNewQ] = useState({
    text: "",
    optionA: "",
    optionB: "",
    correct: "A",
  });

  // Student Game State
  const webcamRef = useRef<Webcam>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [gestureOutput, setGestureOutput] = useState("None");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<"A" | "B" | null>(null);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Refs for AI Loop
  const selectedOptionRef = useRef<"A" | "B" | null>(null);
  const isSubmittedRef = useRef(false);
  const questionIndexRef = useRef(0);
  const lastGestureTimeRef = useRef(0);
  const gestureRecognizerRef = useRef<GestureRecognizer | null>(null);

  // --- AI SETUP (Only runs once) ---
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

  // --- GAME LOOP ---
  useEffect(() => {
    if (role === "teacher") return; // Don't run AI in teacher mode

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
          const gesture = results.gestures[0][0].categoryName;
          setGestureOutput(gesture);
          handleGameLogic(gesture);
        } else {
          setGestureOutput("None");
        }
      }
      animationFrameId = requestAnimationFrame(predictWebcam);
    };

    if (cameraReady) predictWebcam();
    return () => cancelAnimationFrame(animationFrameId);
  }, [cameraReady, role]); // Re-run if role changes

  const handleGameLogic = (gesture: string) => {
    const now = Date.now();
    if (now - lastGestureTimeRef.current < 500) return;

    if (isSubmittedRef.current) {
      if (gesture === "Open_Palm") {
        nextQuestion();
        lastGestureTimeRef.current = now;
      }
      return;
    }

    if (gesture === "Pointing_Up") {
      if (selectedOptionRef.current !== "A") {
        selectedOptionRef.current = "A";
        setSelectedOption("A");
      }
    } else if (gesture === "Victory") {
      if (selectedOptionRef.current !== "B") {
        selectedOptionRef.current = "B";
        setSelectedOption("B");
      }
    } else if (gesture === "Closed_Fist") {
      if (selectedOptionRef.current) {
        submitAnswer();
        lastGestureTimeRef.current = now;
      }
    }
  };

  const submitAnswer = () => {
    const currentQ = questions[questionIndexRef.current];
    const choice = selectedOptionRef.current;
    isSubmittedRef.current = true;
    setIsSubmitted(true);

    if (choice === currentQ.correct) {
      setScore((prev) => prev + 1);
      setFeedback("✅ Correct! (Show Palm ✋ for Next)");
    } else {
      setFeedback("❌ Wrong! (Show Palm ✋ for Next)");
    }
  };

  const nextQuestion = () => {
    if (questionIndexRef.current < questions.length - 1) {
      questionIndexRef.current += 1;
      setCurrentQuestionIndex((prev) => prev + 1);
      selectedOptionRef.current = null;
      setSelectedOption(null);
      isSubmittedRef.current = false;
      setIsSubmitted(false);
      setFeedback("");
    } else {
      setFeedback("🎉 Quiz Completed!");
    }
  };

  // --- TEACHER FUNCTIONS ---
  const addQuestion = () => {
    if (!newQ.text || !newQ.optionA || !newQ.optionB) return;
    setQuestions([...questions, { ...newQ, id: Date.now() }]);
    setNewQ({ text: "", optionA: "", optionB: "", correct: "A" }); // Reset form
  };

  const currentQ = questions[currentQuestionIndex];

  return (
    <div className="flex flex-col items-center w-full">
      {/* ROLE TOGGLE */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setRole("student")}
          className={`px-6 py-2 rounded-full font-bold transition-all ${
            role === "student"
              ? "bg-green-500 text-white"
              : "bg-slate-700 text-slate-300"
          }`}
        >
          🎓 Student View
        </button>
        <button
          onClick={() => setRole("teacher")}
          className={`px-6 py-2 rounded-full font-bold transition-all ${
            role === "teacher"
              ? "bg-orange-500 text-white"
              : "bg-slate-700 text-slate-300"
          }`}
        >
          👨‍🏫 Teacher Editor
        </button>
      </div>

      {/* ----------- TEACHER MODE ----------- */}
      {role === "teacher" && (
        <div className="w-full max-w-2xl bg-slate-800 p-6 rounded-xl border border-orange-500">
          <h2 className="text-2xl font-bold mb-4 text-orange-400">
            Add New Question
          </h2>
          <div className="flex flex-col gap-4">
            <input
              type="text"
              placeholder="Question Text (e.g., What is 5+5?)"
              className="p-3 rounded bg-slate-900 border border-slate-600 text-white"
              value={newQ.text}
              onChange={(e) => setNewQ({ ...newQ, text: e.target.value })}
            />
            <div className="flex gap-4">
              <input
                type="text"
                placeholder="Option A (☝️)"
                className="flex-1 p-3 rounded bg-slate-900 border border-slate-600 text-white"
                value={newQ.optionA}
                onChange={(e) => setNewQ({ ...newQ, optionA: e.target.value })}
              />
              <input
                type="text"
                placeholder="Option B (✌️)"
                className="flex-1 p-3 rounded bg-slate-900 border border-slate-600 text-white"
                value={newQ.optionB}
                onChange={(e) => setNewQ({ ...newQ, optionB: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-4">
              <label>Correct Answer:</label>
              <select
                className="p-2 rounded bg-slate-900 border border-slate-600"
                value={newQ.correct}
                onChange={(e) => setNewQ({ ...newQ, correct: e.target.value })}
              >
                <option value="A">Option A</option>
                <option value="B">Option B</option>
              </select>
            </div>
            <button
              onClick={addQuestion}
              className="bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 rounded-lg mt-2"
            >
              Add Question ➕
            </button>
          </div>

          <div className="mt-8 border-t border-slate-600 pt-4">
            <h3 className="font-bold text-slate-400 mb-2">
              Current Question List ({questions.length})
            </h3>
            <ul className="list-disc pl-5 text-sm text-slate-300">
              {questions.map((q, i) => (
                <li key={i}>{q.text}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ----------- STUDENT MODE ----------- */}
      {role === "student" && (
        <>
          <div className="w-[640px] bg-slate-800 p-4 rounded-t-xl border-x-4 border-t-4 border-green-500 z-10">
            <div className="flex justify-between text-xl font-bold mb-4">
              <span>
                Question {currentQuestionIndex + 1}/{questions.length}
              </span>
              <span className="text-yellow-400">Score: {score}</span>
            </div>
            <h2 className="text-2xl mb-6">
              {currentQ?.text || "No questions loaded!"}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div
                className={`p-4 border-2 rounded-lg transition-all ${
                  selectedOption === "A"
                    ? "bg-green-600 border-white scale-105"
                    : "border-slate-600"
                }`}
              >
                <span className="text-3xl block mb-2">☝️</span>
                <span className="font-bold text-xl">
                  A: {currentQ?.optionA}
                </span>
              </div>
              <div
                className={`p-4 border-2 rounded-lg transition-all ${
                  selectedOption === "B"
                    ? "bg-green-600 border-white scale-105"
                    : "border-slate-600"
                }`}
              >
                <span className="text-3xl block mb-2">✌️</span>
                <span className="font-bold text-xl">
                  B: {currentQ?.optionB}
                </span>
              </div>
            </div>
            <div className="mt-4 h-8 text-center text-xl font-bold text-white animate-pulse">
              {feedback}
            </div>
          </div>

          <div className="relative border-x-4 border-b-4 border-green-500 rounded-b-lg overflow-hidden shadow-2xl">
            <Webcam
              ref={webcamRef}
              audio={false}
              videoConstraints={{ width: 640, height: 480 }}
              className="w-[640px] h-[480px] object-cover transform scale-x-[-1]"
              onUserMedia={() => setCameraReady(true)}
            />
            <div className="absolute bottom-2 left-0 right-0 text-center bg-black/60 py-2">
              <p className="text-white font-mono">
                Detected:{" "}
                <span className="text-yellow-400 font-bold">
                  {gestureOutput}
                </span>
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
