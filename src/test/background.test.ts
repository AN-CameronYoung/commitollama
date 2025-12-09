import * as assert from 'node:assert'
import * as sinon from 'sinon'
import { Ollama } from 'ollama'
import { SummaryCache } from '../cache'
import { summarizeFileDiff } from '../summarizer'

suite('Background Scanning Tests', () => {
	suite('SummaryCache', () => {
		test('should compute consistent hash for same content', () => {
			const cache = new SummaryCache()
			const content = 'diff --git a/file.ts b/file.ts\n+console.log("hello")'
			const hash1 = cache.computeHash(content)
			const hash2 = cache.computeHash(content)
			assert.strictEqual(hash1, hash2)
		})

		test('should return different hash for different content', () => {
			const cache = new SummaryCache()
			const hash1 = cache.computeHash('content A')
			const hash2 = cache.computeHash('content B')
			assert.notStrictEqual(hash1, hash2)
		})

		test('should store and retrieve cache entries', () => {
			const cache = new SummaryCache()
			const path = '/path/to/file.ts'
			const diff = 'some diff'
			const summary = 'Fixed a bug'
			const hash = cache.computeHash(diff)

			cache.set(path, hash, summary)

			const entry = cache.get(path)
			assert.ok(entry)
			assert.strictEqual(entry?.diffHash, hash)
			assert.strictEqual(entry?.summary, summary)
		})
	})

	suite('Summarizer', () => {
		let ollamaGenerateStub: sinon.SinonStub

		setup(() => {
			ollamaGenerateStub = sinon.stub(Ollama.prototype, 'generate')
		})

		teardown(() => {
			ollamaGenerateStub.restore()
		})

		test('should call Ollama to summarize diff', async () => {
			const summary = 'Added new function'
			ollamaGenerateStub.resolves({
				response: summary,
			})

			const diff = 'diff content'
			const result = await summarizeFileDiff(diff)

			assert.strictEqual(result, summary)
			assert(ollamaGenerateStub.calledOnce)
            const args = ollamaGenerateStub.firstCall.args[0];
            assert.ok(args.prompt.includes(diff))
		})

        test('should throw error if prediction fails', async () => {
            const error = new Error('Ollama failed')
            ollamaGenerateStub.rejects(error)

            try {
                await summarizeFileDiff('diff')
                assert.fail('Should have thrown')
            } catch (e) {
                assert.strictEqual(e, error)
            }
        })
	})
})
