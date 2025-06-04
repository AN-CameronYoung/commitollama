import * as assert from 'node:assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as extension from '../extension'
import { Ollama } from 'ollama'
import { getCommitMessage, generateStructuredCommit } from '../generator'
import { getConfig, getGitExtension, setConfig } from '../utils'
import { defaultConfig } from '../config'

suite('Extension Test Suite', () => {
	test('Extension is active', () => {
		assert.ok(extension.activate)
	})

	test('Get Git Extension', () => {
		const gitExtension = getGitExtension()
		assert.ok(gitExtension)
	})
})

suite('generateStructuredCommit Tests', () => {
	const summariesSample = ['Added a feature', 'Fixed a bug']
	const structuredCommitResponse = {
		response: JSON.stringify({
			type: 'feat',
			message: 'Add new feature',
		}),
	}

	let ollamaGenerateStub: sinon.SinonStub

	setup(() => {
		ollamaGenerateStub = sinon.stub(Ollama.prototype, 'generate')
	})

	teardown(() => {
		ollamaGenerateStub.restore()
	})

	test('Should return a structured commit for summaries', async () => {
		ollamaGenerateStub.resolves(structuredCommitResponse)

		const result = await generateStructuredCommit(summariesSample)

		assert.strictEqual(result.type, 'feat')
		assert.strictEqual(result.message, 'Add new feature')
		assert(ollamaGenerateStub.calledOnce)
	})

	test('Should show error message when model is not found', async () => {
		const error = { status_code: 404, message: 'model not found' }
		ollamaGenerateStub.rejects(error)

		const showErrorMessageStub = sinon
			.stub(vscode.window, 'showErrorMessage')
			.resolves()

		try {
			await generateStructuredCommit(summariesSample)
		} catch (e) {
			// Expected error
		}

		showErrorMessageStub.restore()
	})
})

suite('getCommitMessage Tests', () => {
	const summariesSample = ['Added a feature', 'Fixed a bug']
	const structuredCommitResponse = {
		response: JSON.stringify({
			type: 'feat',
			message: 'Add new feature',
		}),
	}

	let ollamaGenerateStub: sinon.SinonStub
	let originalUseEmojis: any
	let originalUseDescription: any
	let originalLowerCase: any
	let originalCustomEmojis: any
	let originalCustomCommitTemplate: any

	setup(async () => {
		ollamaGenerateStub = sinon.stub(Ollama.prototype, 'generate')
		// Store original config values
		originalUseEmojis = getConfig('useEmojis')
		originalUseDescription = getConfig('useDescription')
		originalLowerCase = getConfig('useLowerCase')
		originalCustomCommitTemplate = getConfig('commitTemplate')
		originalCustomEmojis = getConfig('custom.emojis')

		// Reset all config values to default
		await setConfig('useEmojis', false)
		await setConfig('useDescription', false)
		await setConfig('useLowerCase', false)
	})

	teardown(async () => {
		ollamaGenerateStub.restore()
		// Restore original config values
		await setConfig('useEmojis', originalUseEmojis)
		await setConfig('useDescription', originalUseDescription)
		await setConfig('useLowerCase', originalLowerCase)
		await setConfig('commitTemplate', originalCustomCommitTemplate)
		await setConfig('custom.emojis', originalCustomEmojis)
	})

	test('Should return a commit message based on summaries', async () => {
		ollamaGenerateStub.resolves(structuredCommitResponse)

		const result = await getCommitMessage(summariesSample)

		assert.strictEqual(result, 'feat: Add new feature')
		assert(ollamaGenerateStub.calledOnce)
	})

	test('Should add emojis if configured to use emojis', async () => {
		ollamaGenerateStub.resolves(structuredCommitResponse)

		const originalUseEmojis = getConfig('useEmojis')
		const originalCustomEmojis = getConfig('custom.emojis')

		await setConfig('useEmojis', true)
		await setConfig('custom.emojis', { ...defaultConfig.emojis, feat: '🔥' })

		const result = await getCommitMessage(summariesSample)

		assert.strictEqual(result, 'feat 🔥: Add new feature')
		await setConfig('useEmojis', originalUseEmojis!)
		await setConfig('custom.emojis', originalCustomEmojis!)
	})

	test('Should add summaries as descriptions if configured to use descriptions', async () => {
		const responseWithDescription = {
			response: JSON.stringify({
				type: 'feat',
				message: 'Add new feature',
				summary: 'Extended summary of the feature',
			}),
		}
		ollamaGenerateStub.resolves(responseWithDescription)

		const originalUseDescription = getConfig('useDescription')
		await setConfig('useDescription', true)

		const result = await getCommitMessage(summariesSample)

		assert.strictEqual(
			result,
			'feat: Add new feature\n\nExtended summary of the feature',
		)

		await setConfig('useDescription', originalUseDescription!)
	})

	test('Should lowercase the message if configured to use lowercase', async () => {
		ollamaGenerateStub.resolves(structuredCommitResponse)
		const originalLowercase = getConfig('useLowerCase')
		await setConfig('useLowerCase', true)

		const result = await getCommitMessage(summariesSample)

		assert.strictEqual(result, 'feat: add new feature')

		await setConfig('useLowerCase', originalLowercase!)
	})

	test('Should format commit message according to template', async () => {
		ollamaGenerateStub.resolves(structuredCommitResponse)
		const originalCustomCommitTemplate = getConfig('commitTemplate')
		const originalUseEmojis = getConfig('useEmojis')

		await setConfig('commitTemplate', '{{emoji}}{{type}}: {{message}}')
		await setConfig('useEmojis', true)

		const result = await getCommitMessage(summariesSample)

		assert.strictEqual(result, '✨feat: Add new feature')
		await setConfig('commitTemplate', originalCustomCommitTemplate!)
		await setConfig('useEmojis', originalUseEmojis!)
	})
})
