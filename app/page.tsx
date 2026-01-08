"use client";
import React, { useState } from "react";
import LiveClassMode from "./components/LiveClassMode";
import QuizMode from "./components/QuizMode";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"class" | "quiz">("class");

  return (
    <main className="flex min-h-screen flex-col items-center bg-slate-900 text-white font-sans">
      {/* HEADER / NAVBAR */}
      <nav className="w-full bg-slate-800 p-4 border-b border-blue-500 shadow-lg mb-8">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-400">EchoLearn AI</h1>
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab("class")}
              className={`px-4 py-2 rounded-lg font-bold transition-all ${
                activeTab === "class"
                  ? "bg-blue-600 text-white scale-105"
                  : "text-slate-400 hover:bg-slate-700"
              }`}
            >
              👨‍🏫 Live Class
            </button>
            <button
              onClick={() => setActiveTab("quiz")}
              className={`px-4 py-2 rounded-lg font-bold transition-all ${
                activeTab === "quiz"
                  ? "bg-blue-600 text-white scale-105"
                  : "text-slate-400 hover:bg-slate-700"
              }`}
            >
              📝 Gesture Quiz
            </button>
          </div>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <div className="w-full flex justify-center pb-20">
        {activeTab === "class" ? <LiveClassMode /> : <QuizMode />}
      </div>
    </main>
  );
}
