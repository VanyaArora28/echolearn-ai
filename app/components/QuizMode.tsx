"use client";
import React, { useRef, useState, useEffect } from "react";
import Webcam from "react-webcam";
import { FilesetResolver, GestureRecognizer } from "@mediapipe/tasks-vision";

// --- TYPES ---
type Question = {
  id: number;
  text: string;
  optionA: string;
  optionB: string;
  correct: "A" | "B";
};

// --- DEFAULT QUESTIONS ---
const defaultQuestions: Question[] = [
  {
    id: 1,
    text: "Which hand gesture means 'Yes'?",
    optionA: "👍 Thumb Up",
    optionB: "👎 Thumb Down",
    correct: "A",
  },
  {
    id: 2,
    text: "What is the capital of India?",
    optionA: "Mumbai",
    optionB: "New Delhi",
    correct: "B",
  },
  {
    id: 3,
    text: "Is Next.js a React Framework?",
    optionA: "Yes",
    optionB: "No",
    correct: "A",
  },
];

export default function QuizMode() {
  // --- STATE ---
  const [view, setView] = useState<"menu" | "game" | "teacher" | "results">(
    "menu"
  );
  const [questions, setQuestions] = useState<Question[]>(defaultQuestions);

  // Game State
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30); // 30 seconds per question
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);

  // Teacher State
  const [newQ, setNewQ] = useState({
    text: "",
    optionA: "",
    optionB: "",
    correct: "A",
  });

  // AI & Camera Refs
  const webcamRef = useRef<Webcam>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [gestureOutput, setGestureOutput] = useState("None");
  const gestureRecognizerRef = useRef<GestureRecognizer | null>(null);

  // Logic Refs (to avoid loop closure issues)
  const currentQIndexRef = useRef(0);
  const isProcessingRef = useRef(false);
  const selectedOptionRef = useRef<"A" | "B" | null>(null);
  const gestureHoldCounterRef = useRef(0);
  const currentPotentialGestureRef = useRef("None");

  // ----------------------------------------------------------------
  // 1. INIT & STORAGE
  // ----------------------------------------------------------------
  useEffect(() => {
    // Load questions from local storage if available
    const savedQs = localStorage.getItem("echoLearn_questions");
    if (savedQs) {
      setQuestions(JSON.parse(savedQs));
    }

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

  // ----------------------------------------------------------------
  // 2. TEACHER ACTIONS
  // ----------------------------------------------------------------
  const addQuestion = () => {
    if (!newQ.text || !newQ.optionA || !newQ.optionB) return;
    const updatedQs = [
      ...questions,
      { ...newQ, id: Date.now(), correct: newQ.correct as "A" | "B" },
    ];
    setQuestions(updatedQs);
    localStorage.setItem("echoLearn_questions", JSON.stringify(updatedQs)); // Save to browser!
    setNewQ({ text: "", optionA: "", optionB: "", correct: "A" });
    alert("Question Added!");
  };

  const deleteQuestion = (id: number) => {
    const updatedQs = questions.filter((q) => q.id !== id);
    setQuestions(updatedQs);
    localStorage.setItem("echoLearn_questions", JSON.stringify(updatedQs));
  };

  // ----------------------------------------------------------------
  // 3. GAME LOGIC
  // ----------------------------------------------------------------
  const startGame = () => {
    setScore(0);
    setStreak(0);
    setCurrentQIndex(0);
    currentQIndexRef.current = 0;
    setTimeLeft(30);
    setFeedback(null);
    setView("game");
  };

  const handleAnswer = (choice: "A" | "B") => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    const currentQ = questions[currentQIndexRef.current];
    const isCorrect = choice === currentQ.correct;

    if (isCorrect) {
      setScore((prev) => prev + 10 + streak * 2); // Bonus for streaks
      setStreak((prev) => prev + 1);
      setFeedback("correct");
    } else {
      setStreak(0);
      setFeedback("wrong");
    }

    // Wait 2 seconds, then next question
    setTimeout(() => {
      if (currentQIndexRef.current < questions.length - 1) {
        currentQIndexRef.current += 1;
        setCurrentQIndex((prev) => prev + 1);
        setTimeLeft(30);
        setFeedback(null);
        selectedOptionRef.current = null;
        isProcessingRef.current = false;
      } else {
        setView("results");
        isProcessingRef.current = false;
      }
    }, 2000);
  };

  // Timer Effect
  useEffect(() => {
    if (view !== "game" || feedback) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleAnswer(selectedOptionRef.current === "A" ? "B" : "A"); // Force wrong if timeout
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [view, currentQIndex, feedback]);

  // ----------------------------------------------------------------
  // 4. AI LOOP (Gesture Recognition)
  // ----------------------------------------------------------------
  useEffect(() => {
    if (view !== "game") return;

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
          setGestureOutput(rawGesture);

          // STABILIZER LOGIC
          if (rawGesture === currentPotentialGestureRef.current) {
            gestureHoldCounterRef.current += 1;
          } else {
            currentPotentialGestureRef.current = rawGesture;
            gestureHoldCounterRef.current = 0;
          }

          // Trigger after holding for ~15 frames
          if (gestureHoldCounterRef.current > 15 && !isProcessingRef.current) {
            // MAPPING: Pointing_Up = A | Victory = B
            if (rawGesture === "Pointing_Up") {
              selectedOptionRef.current = "A"; // Highlight UI
              // Auto-submit after holding
              if (gestureHoldCounterRef.current > 40) handleAnswer("A");
            } else if (rawGesture === "Victory") {
              selectedOptionRef.current = "B"; // Highlight UI
              if (gestureHoldCounterRef.current > 40) handleAnswer("B");
            }
          }
        }
      }
      animationFrameId = requestAnimationFrame(predictWebcam);
    };
    if (cameraReady) predictWebcam();
    return () => cancelAnimationFrame(animationFrameId);
  }, [cameraReady, view]);

  // ----------------------------------------------------------------
  // UI RENDER
  // ----------------------------------------------------------------
  return (
    <div className="w-full max-w-5xl mx-auto p-4 flex flex-col items-center min-h-[600px]">
      {/* === 1. START MENU === */}
      {view === "menu" && (
        <div className="bg-slate-800 p-10 rounded-2xl border-2 border-blue-500 text-center shadow-2xl animate-fade-in">
          <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-6">
            Gesture Quiz Arena
          </h1>
          <p className="text-slate-300 text-lg mb-8">
            Use hand signs to answer! <br />
            ☝️ = Option A &nbsp; | &nbsp; ✌️ = Option B
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={startGame}
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-8 rounded-full text-xl transition-transform hover:scale-105 shadow-lg"
            >
              🚀 Start Quiz
            </button>
            <button
              onClick={() => setView("teacher")}
              className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-3 px-8 rounded-full text-xl transition-transform hover:scale-105 shadow-lg"
            >
              👨‍🏫 Teacher Mode
            </button>
          </div>
        </div>
      )}

      {/* === 2. TEACHER DASHBOARD === */}
      {view === "teacher" && (
        <div className="w-full bg-slate-800 p-6 rounded-xl border border-orange-500 animate-fade-in">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-3xl font-bold text-orange-400">
              Teacher Dashboard
            </h2>
            <button
              onClick={() => setView("menu")}
              className="text-slate-400 hover:text-white underline"
            >
              Back to Menu
            </button>
          </div>

          {/* Add Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 bg-slate-900 p-4 rounded-lg">
            <input
              className="p-3 rounded bg-slate-800 border border-slate-600 text-white col-span-2"
              placeholder="Enter Question Text..."
              value={newQ.text}
              onChange={(e) => setNewQ({ ...newQ, text: e.target.value })}
            />
            <input
              className="p-3 rounded bg-slate-800 border border-slate-600 text-white"
              placeholder="Option A (☝️)"
              value={newQ.optionA}
              onChange={(e) => setNewQ({ ...newQ, optionA: e.target.value })}
            />
            <input
              className="p-3 rounded bg-slate-800 border border-slate-600 text-white"
              placeholder="Option B (✌️)"
              value={newQ.optionB}
              onChange={(e) => setNewQ({ ...newQ, optionB: e.target.value })}
            />
            <div className="col-span-2 flex items-center gap-4">
              <span className="text-white font-bold">Correct Answer:</span>
              <select
                className="p-2 rounded bg-slate-800 text-white border border-slate-600"
                value={newQ.correct}
                onChange={(e) => setNewQ({ ...newQ, correct: e.target.value })}
              >
                <option value="A">Option A</option>
                <option value="B">Option B</option>
              </select>
              <button
                onClick={addQuestion}
                className="ml-auto bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg font-bold"
              >
                Add Question ➕
              </button>
            </div>
          </div>

          {/* Question List */}
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {questions.map((q, i) => (
              <div
                key={q.id}
                className="flex justify-between items-center bg-slate-700 p-3 rounded border-l-4 border-blue-500"
              >
                <div>
                  <span className="font-bold text-blue-300">Q{i + 1}: </span>
                  <span className="text-white">{q.text}</span>
                  <span className="text-xs text-slate-400 block ml-8">
                    Ans: {q.correct}
                  </span>
                </div>
                <button
                  onClick={() => deleteQuestion(q.id)}
                  className="text-red-400 hover:text-red-300 font-bold px-3"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === 3. GAME INTERFACE === */}
      {view === "game" && (
        <div className="w-full flex flex-col md:flex-row gap-6 animate-fade-in">
          {/* LEFT: QUIZ CARD */}
          <div className="flex-1 bg-slate-800 rounded-2xl p-6 border-4 border-blue-500 relative overflow-hidden">
            {/* Feedback Overlay */}
            {feedback && (
              <div
                className={`absolute inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-pulse`}
              >
                <h2
                  className={`text-6xl font-black ${
                    feedback === "correct" ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {feedback === "correct" ? "NAILED IT! 🎉" : "WRONG! ❌"}
                </h2>
              </div>
            )}

            {/* Header */}
            <div className="flex justify-between items-end mb-6 border-b border-slate-600 pb-4">
              <div>
                <span className="text-sm text-slate-400 uppercase tracking-widest">
                  Question {currentQIndex + 1}/{questions.length}
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-2xl">🔥</span>
                  <span className="text-xl font-bold text-orange-400">
                    Streak: {streak}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-4xl font-black text-white">
                  {timeLeft}s
                </span>
                <span className="text-xs text-slate-400 block">Time Left</span>
              </div>
            </div>

            {/* Question */}
            <h2 className="text-3xl font-bold text-white mb-8 min-h-[100px] flex items-center">
              {questions[currentQIndex].text}
            </h2>

            {/* Options */}
            <div className="grid grid-cols-2 gap-4">
              <div
                className={`p-6 rounded-xl border-2 transition-all duration-300 transform ${
                  selectedOptionRef.current === "A"
                    ? "bg-blue-600 border-white scale-105 shadow-xl"
                    : "bg-slate-700 border-slate-600 hover:bg-slate-600"
                }`}
              >
                <div className="text-4xl mb-2">☝️</div>
                <div className="text-2xl font-bold text-white">
                  {questions[currentQIndex].optionA}
                </div>
              </div>
              <div
                className={`p-6 rounded-xl border-2 transition-all duration-300 transform ${
                  selectedOptionRef.current === "B"
                    ? "bg-blue-600 border-white scale-105 shadow-xl"
                    : "bg-slate-700 border-slate-600 hover:bg-slate-600"
                }`}
              >
                <div className="text-4xl mb-2">✌️</div>
                <div className="text-2xl font-bold text-white">
                  {questions[currentQIndex].optionB}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: CAMERA */}
          <div className="w-[320px] flex flex-col gap-4">
            <div className="relative rounded-xl overflow-hidden border-4 border-slate-600 shadow-2xl">
              <Webcam
                ref={webcamRef}
                audio={false}
                videoConstraints={{ width: 320, height: 240 }}
                className="w-full object-cover transform scale-x-[-1]"
                onUserMedia={() => setCameraReady(true)}
              />
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2 text-center">
                <span className="text-xs text-slate-300 uppercase">
                  Detected Gesture
                </span>
                <p className="text-xl font-bold text-yellow-400">
                  {gestureOutput}
                </p>
              </div>
            </div>

            <div className="bg-slate-800 p-4 rounded-xl border border-slate-600">
              <h3 className="text-slate-400 text-sm mb-2 font-bold uppercase">
                Instructions
              </h3>
              <ul className="text-sm text-slate-300 space-y-2">
                <li className="flex items-center gap-2">
                  <span className="text-xl">☝️</span> Hold to select{" "}
                  <b>Option A</b>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-xl">✌️</span> Hold to select{" "}
                  <b>Option B</b>
                </li>
              </ul>
              <p className="mt-4 text-xs text-blue-400 text-center animate-pulse">
                Hold gesture for 2 seconds to confirm!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* === 4. RESULTS SCREEN === */}
      {view === "results" && (
        <div className="bg-slate-800 p-10 rounded-2xl border-2 border-green-500 text-center shadow-2xl animate-fade-in max-w-lg w-full">
          <div className="text-6xl mb-4">🏆</div>
          <h2 className="text-4xl font-extrabold text-white mb-2">
            Quiz Completed!
          </h2>
          <p className="text-slate-400 mb-8">
            Great job finishing the challenge.
          </p>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-slate-700 p-4 rounded-xl">
              <span className="block text-3xl font-bold text-green-400">
                {score}
              </span>
              <span className="text-xs text-slate-400 uppercase">
                Final Score
              </span>
            </div>
            <div className="bg-slate-700 p-4 rounded-xl">
              <span className="block text-3xl font-bold text-blue-400">
                {questions.length}
              </span>
              <span className="text-xs text-slate-400 uppercase">
                Questions
              </span>
            </div>
          </div>

          <button
            onClick={startGame}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg mb-4"
          >
            🔄 Play Again
          </button>
          <button
            onClick={() => setView("menu")}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl transition-all"
          >
            🏠 Back to Menu
          </button>
        </div>
      )}
    </div>
  );
}
