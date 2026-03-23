
import { GoogleGenAI, Type } from "@google/genai";
import { WordEntry, QuizQuestion } from "./types";

// Always initialize GoogleGenAI using a named parameter with process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getWordDetails = async (word: string, targetLang: string): Promise<Partial<WordEntry & { morphology: string }>> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Explain the word "${word}" for a language learner. Provide:
1. A direct translation to ${targetLang}.
2. A simple English definition.
3. One short example sentence.
4. A very brief etymology or linguistic root (max 10 words).`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          translation: { type: Type.STRING },
          definition: { type: Type.STRING },
          example: { type: Type.STRING },
          morphology: { type: Type.STRING }
        },
        required: ["translation", "definition", "example", "morphology"]
      }
    }
  });

  try {
    const jsonStr = (response.text || "").trim();
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return {};
  }
};

export const generateQuiz = async (words: WordEntry[]): Promise<QuizQuestion[]> => {
  if (words.length === 0) return [];
  
  const wordList = words.map(w => w.word).join(", ");
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate a 5-question multiple choice quiz for these words: ${wordList}. Make it fun and focused on context.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctAnswer: { type: Type.STRING },
            explanation: { type: Type.STRING }
          },
          required: ["question", "options", "correctAnswer", "explanation"]
        }
      }
    }
  });

  try {
    const jsonStr = (response.text || "").trim();
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("Failed to parse Quiz response", e);
    return [];
  }
};
