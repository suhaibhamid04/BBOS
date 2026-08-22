import { GoogleGenAI } from '@google/genai';

let client: GoogleGenAI | null = null;

export function getAiClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY is not set in environment. AI calls will use fallback intelligence.');
    }
    client = new GoogleGenAI(apiKey ? { apiKey } : undefined);
  }
  return client;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}
