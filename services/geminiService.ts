import { GoogleGenAI } from "@google/genai";

// Initialize the client. The API_KEY is injected by the environment.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const summarizeNote = async (content: string): Promise<string> => {
  if (!content || content.length < 10) return "Content too short to summarize.";

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Please provide a concise, one-sentence summary (max 20 words) of the following note content. Return ONLY the summary text, nothing else. Content: ${content}`,
      config: {
        thinkingConfig: { thinkingBudget: 0 } // Disable thinking for simple tasks for speed
      }
    });
    
    return response.text || "Could not generate summary.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Error generating summary.";
  }
};

export const continueWriting = async (currentContent: string, instructions: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `You are a helpful writing assistant. 
      
      Current Note Content:
      "${currentContent}"
      
      User Instructions:
      "${instructions}"
      
      Please generate the next paragraph or section for this note based on the instructions.`,
      config: {
        // Use a bit of thinking for creative writing
        thinkingConfig: { thinkingBudget: 1024 } 
      }
    });
    return response.text || "";
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
