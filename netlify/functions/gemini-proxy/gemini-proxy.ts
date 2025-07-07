
import { GoogleGenAI, GenerateContentResponse, Part, Chat } from "@google/genai";
import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";

const apiKey = process.env.API_KEY;
if (!apiKey) {
    throw new Error("API_KEY is not defined in environment variables.");
}
const ai = new GoogleGenAI({ apiKey });
const textModel = "gemini-2.5-flash-preview-04-17";


// Main handler
const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { action, payload } = body;

        switch (action) {
            case 'getTutorResponseStream': {
                const { userMessage, systemPrompt, history, image } = payload;
                const geminiHistory = history.map((msg: any) => ({
                    role: msg.sender === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.text }],
                }));

                const chat: Chat = ai.chats.create({
                    model: textModel,
                    config: {
                        systemInstruction: systemPrompt,
                    },
                    history: geminiHistory,
                });

                const messageParts: Part[] = [];
                if (image) {
                    messageParts.push({ inlineData: { data: image.base64Data, mimeType: image.mimeType } });
                }
                if (userMessage) {
                    messageParts.push({ text: userMessage });
                }

                const resultStream = await chat.sendMessageStream({ message: messageParts });

                const readable = new ReadableStream({
                    async start(controller) {
                        const encoder = new TextEncoder();
                        try {
                            for await (const chunk of resultStream) {
                                const text = chunk.text;
                                if (text) {
                                    // SSE format: data: { "text": "..." }\n\n
                                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
                                }
                            }
                        } catch (error: any) {
                            console.error("Streaming error:", error);
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`));
                        } finally {
                            controller.close();
                        }
                    },
                });

                return {
                    statusCode: 200,
                    headers: {
                        "Content-Type": "text/event-stream",
                        "Cache-Control": "no-cache",
                        "Connection": "keep-alive",
                    },
                    body: readable,
                };
            }

            case 'getExplanationForQuestion': {
                const { question, userAnswer } = payload;
                let prompt = `Explain the answer to the following WASSCE/NECO style question:
Question: "${question.questionText}"
Options:
${question.options.map((opt: any, idx: number) => `${String.fromCharCode(97 + idx)}. ${opt.text}`).join('\n')}
The correct option is: ${question.options.find((opt: any) => opt.id === question.correctOptionId)?.text}.`;

                if (userAnswer) {
                    const selectedOption = question.options.find((opt: any) => opt.id === userAnswer);
                    if (selectedOption) {
                        prompt += `\nThe student selected: "${selectedOption.text}".`;
                        if (userAnswer !== question.correctOptionId) {
                            prompt += ` Explain why this student's answer is incorrect and why the correct answer is right.`;
                        } else {
                            prompt += ` Reinforce why this student's answer is correct.`;
                        }
                    }
                } else {
                    prompt += ` Provide a detailed step-by-step explanation for solving this problem and why the correct option is the right answer.`;
                }
                prompt += "\nKeep the explanation clear, concise, and suitable for a Nigerian secondary school student. Use Naira or local Nigerian references if relevant to the question context, but only if it makes sense for the specific question (e.g. math word problems, economics).";

                const response = await ai.models.generateContent({
                    model: textModel,
                    contents: prompt,
                    config: { systemInstruction: "You are an expert tutor specializing in Nigerian WASSCE/NECO exam questions. Provide clear, step-by-step explanations." }
                });

                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: response.text }),
                };
            }

            case 'generateMockTestQuestions': {
                const { subject, numberOfQuestions } = payload;
                const prompt = `Generate ${numberOfQuestions} unique multiple-choice questions suitable for the Nigerian WASSCE/NECO ${subject} exam.
For each question, provide:
1. The question text.
2. Four distinct options (A, B, C, D).
3. Clearly indicate the correct option (e.g., "Correct: C").
4. A brief explanation for the correct answer.

Format the output as a JSON array of objects. Each object should have keys: "questionText", "options" (an array of strings), "correctOptionLetter" (e.g., "A", "B", "C", or "D"), and "explanation".
Ensure questions are typical of Nigerian secondary school curriculum for ${subject}.
Example for one question object:
{
  "questionText": "What is the capital of Nigeria?",
  "options": ["Lagos", "Kano", "Abuja", "Ibadan"],
  "correctOptionLetter": "C",
  "explanation": "Abuja is the federal capital territory of Nigeria."
}
`;
                const response = await ai.models.generateContent({
                    model: textModel,
                    contents: prompt,
                    config: {
                        systemInstruction: "You are an AI that generates high-quality exam questions for Nigerian students based on the WASSCE/NECO syllabus. Output ONLY the JSON array.",
                        responseMimeType: "application/json",
                    }
                });

                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ json: response.text }),
                };
            }

            default:
                return { statusCode: 400, body: JSON.stringify({error: `Unknown action: ${action}`}) };
        }
    } catch (error: any) {
        console.error("Error in Gemini proxy:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message || 'An internal server error occurred.' }),
        };
    }
};

export { handler };
