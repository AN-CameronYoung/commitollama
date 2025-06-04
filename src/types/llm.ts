export const Models = {
	Llama: 'llama3.2:latest',
	Codegemma: 'codegemma:latest',
	Codellama: 'codellama',
	Mistral: 'mistral:latest',
	Gemma: 'gemma3:latest',
	Qwen: 'qwen3:latest',
	Custom: 'custom',
} as const
export type Model = keyof typeof Models

export const Languages = {
	Arabic: 'arabic',
	Chinese: 'chinese',
	English: 'english',
	French: 'french',
	German: 'german',
	Italian: 'italian',
	Japanese: 'japanese',
	Korean: 'korean',
	Portuguese: 'portuguese',
	Russian: 'russian',
	Spanish: 'spanish',
	Custom: 'custom',
} as const
export type Language = keyof typeof Languages

export type EmojisMap = {
	feat: string
	fix: string
	docs: string
	style: string
	refactor: string
	test: string
	chore: string
	revert: string
}
