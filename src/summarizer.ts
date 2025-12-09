import { Ollama } from 'ollama'
import { config } from './config'

export async function summarizeFileDiff(diff: string): Promise<string> {
	const { endpoint, model, promptTemperature, requestHeaders } = config.inference
	const ollama = new Ollama({ host: endpoint, headers: requestHeaders })

	const summarizerPrompt = `You are a helpful assistant.
Summarize the following code changes for a single file in one concise sentence.
Do not start with "The code changes..." or "This file...". Start directly with the action (e.g., "Add new function...", "Fix bug in...").
Keep it under 20 words.
Changes:
${diff}`

	try {
		const response = await ollama.generate({
			model,
			prompt: summarizerPrompt,
			stream: false,
			options: {
				temperature: promptTemperature,
			},
		})

		return response.response.trim()
	} catch (error) {
		console.error('Error generating summary:', error)
		throw error
	}
}
