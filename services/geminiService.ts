
import { ChatMessage, MockQuestion } from '../types';

export const getTutorResponse = async (history: ChatMessage[], message: string, systemInstruction: string): Promise<string> => {
    try {
        const response = await fetch('/api/gemini-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ history, message, systemInstruction }),
        });

        const responseBody = await response.text();

        if (!response.ok) {
            // Try to parse as JSON for a structured message, otherwise use the text itself.
            try {
                const errorJson = JSON.parse(responseBody);
                throw new Error(errorJson.message || `Request failed with status ${response.status}`);
            } catch (e) {
                // The body wasn't JSON, throw the raw text which is likely HTML or a simple string.
                throw new Error(responseBody || `Request failed with status ${response.status}`);
            }
        }
        
        // Response is OK, so body should be JSON.
        const data = JSON.parse(responseBody);
        return data.text;

    } catch (error) {
        console.error("Error getting tutor response:", error);
        return "Sorry, I encountered an error. Please check your connection or try again later.";
    }
};


export const generateMockTest = async (subject: string, numberOfQuestions: number): Promise<MockQuestion[]> => {
    try {
        const response = await fetch('/api/generate-test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject, numberOfQuestions }),
        });
        
        const responseBody = await response.text();

        if (!response.ok) {
            // Try to parse as JSON for a structured message, otherwise use the text itself.
            try {
                const errorJson = JSON.parse(responseBody);
                throw new Error(errorJson.message || `Request failed with status ${response.status}`);
            } catch (e) {
                 // The body wasn't JSON, throw the raw text.
                throw new Error(responseBody || `Request failed with status ${response.status}`);
            }
        }

        if (!responseBody) {
            throw new Error("Received empty response from the server.");
        }
        
        const data: MockQuestion[] = JSON.parse(responseBody);

        if (Array.isArray(data) && data.length > 0 && data[0].question && data[0].options) {
            return data;
        }
        throw new Error("Invalid test structure received from AI.");

    } catch (error) {
        console.error("Failed to generate or parse mock test:", error);
        // Re-throw the error to be caught by the UI component
        if (error instanceof SyntaxError && error.message.includes("JSON")) {
            throw new Error(`The AI returned an invalid response. Please try again. The response was not valid JSON.`);
        }
        throw error;
    }
};
