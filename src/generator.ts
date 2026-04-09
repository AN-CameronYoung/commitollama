import { config } from './config'
import { Ollama } from 'ollama'
import type { EmojisMap } from './types/llm'
import * as vscode from 'vscode'
import { OLLAMA_URL } from './constants'

interface CommitStructure {
	type: string
	message: string
	summary?: string
}

export async function generateStructuredCommit(
	summaries: string[],
): Promise<CommitStructure> {
	const {
		endpoint,
		promptTemperature,
		model,
		language,
		useDescription,
		customPrompt,
		customTypeRules,
		customCommitMessageRules,
		customDescriptionPrompt,
		requestHeaders,
		numPredict,
	} = config.inference
	const ollama = new Ollama({ host: endpoint, headers: requestHeaders })

	const typeRules =
		customTypeRules ||
`- feat: Only when adding a new feature
- fix: When fixing a bug
- docs: When updating documentation
- style: When changing elements styles or design and/or making changes to the code style (formatting, missing semicolons, etc.) without changing the code logic
- test: When adding or updating tests
- chore: When making changes to the build process or auxiliary tools and libraries
- revert: When undoing a previous commit
- refactor: When restructuring code without changing its external behavior`

	const commitMessageRules =
		customCommitMessageRules ||
`- Single line, imperative mood, under 72 characters
- Do NOT include the commit type or any prefix in the message
- Capture the 1-2 most important changes
- If two distinct changes, join with a semicolon: "fix broken thing; add new thing"`

	const descriptionPrompt =
		customDescriptionPrompt ||
		`Provide a 'summary' as a bullet list (- item) of 3-6 items covering every significant change. Each bullet is a short imperative phrase — what changed, not why. No sentences, no prose, no file or variable names, no "this commit" phrasing.`

	const structuredPrompt =
		customPrompt ||
`You are an expert software engineer writing a git commit message. Your response must be JSON with a 'type', 'message'${useDescription ? ", and 'summary'" : ''} field.

Rules for commit type:
${typeRules}

Rules for 'message':
${commitMessageRules}
- Write the message in ${language}

${useDescription ? descriptionPrompt : ''}
Respond using JSON only.`

	const format = {
		type: 'object',
		properties: {
			type: {
				type: 'string',
				description:
					'The commit type. Must be exactly one of: feat, fix, docs, style, test, chore, revert, refactor',
			},
			message: {
				type: 'string',
				description: `A short commit message in ${language}. Do not include the type prefix.`,
			},
			...(useDescription && {
				summary: {
					type: 'string',
					description: `1-2 plain sentences describing the changes in ${language}. No bullet points, no markdown.`,
				},
			}),
		},
		required: useDescription
			? ['type', 'message', 'summary']
			: ['type', 'message'],
	}

	try {
		const response = await ollama.generate({
			model,
			prompt: `${structuredPrompt}\n\nChanges summaries: ${summaries.join(', ')}`,
			stream: false,
			format: format,
        	think: false,
			options: {
				temperature: promptTemperature,
				num_predict: numPredict,
			},
		})

		return JSON.parse(response.response)
	} catch (error: any) {
		if (error?.status_code === 404) {
			const errorMessage =
				error?.message.charAt(0).toUpperCase() + error?.message.slice(1)

			vscode.window
				.showErrorMessage(errorMessage, 'Go to ollama website', 'Pull model')
				.then((action) => {
					if (action === 'Go to ollama website') {
						vscode.env.openExternal(vscode.Uri.parse(OLLAMA_URL))
					}
					if (action === 'Pull model') {
						vscode.commands.executeCommand('commitollama.runOllamaPull', model)
					}
				})

			throw new Error()
		}

		throw new Error(
			'Unable to connect to ollama. Please, check that ollama is running.',
		)
	}
}

export async function getCommitMessage(summaries: string[]) {
	const {
		useDescription,
		useEmojis,
		commitEmojis,
		useLowerCase,
		commitTemplate,
	} = config.inference

	try {
		const structuredCommit = await generateStructuredCommit(summaries)

		const { type, message, summary } = structuredCommit

		// Handle lower and upper case commit messages
		const commitMessage = useLowerCase
			? message.charAt(0).toLowerCase() + message.slice(1)
			: message.charAt(0).toUpperCase() + message.slice(1)

		// Handle emojis
		const emoji = useEmojis ? commitEmojis?.[type as keyof EmojisMap] : ''

		// Build final commit with template
		let commit = commitTemplate
			.replace('{{type}}', type)
			.replace('{{message}}', commitMessage)
			.replace('{{emoji}}', emoji)
			.replace(/\s+/g, ' ') // Replace multiple spaces with single space
			.replace(/\s+:/g, ':') // Remove space before colon

		// Add extended summary as description if useDescription is activated
		if (useDescription && summary) {
			commit = `${commit}\n\n${summary}`
		}

		return commit.trim()
	} catch (error) {
		throw new Error('Unable to generate commit.')
	}
}
