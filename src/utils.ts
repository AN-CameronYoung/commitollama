import * as vscode from 'vscode'
import type { GitExtension, Repository } from './types/git'
import { getCommitMessage } from './generator'
import type { ExtensionConfig } from './types/config'
import { summaryCache } from './cache'
import { summarizeFileDiff } from './summarizer'

export function getConfig<K extends keyof ExtensionConfig>(key: K) {
	return vscode.workspace
		.getConfiguration('commitollama')
		.get<ExtensionConfig[K]>(key)
}

export function setConfig<K extends keyof ExtensionConfig>(
	key: K,
	value: ExtensionConfig[K],
) {
	return vscode.workspace
		.getConfiguration('commitollama')
		.update(key, value, vscode.ConfigurationTarget.Workspace)
}

export async function getSummaryUriDiff(repo: Repository, uri: string) {
	const diff = await repo.diffIndexWithHEAD(uri)
	return diff
}

export async function createCommitMessage(repo: Repository) {
	vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.SourceControl,
			cancellable: false,
			title: 'Loading commit message',
		},
		async () => {
			vscode.commands.executeCommand('workbench.view.scm')
			try {
				// Clean the current message:
				repo.inputBox.value = ''

				const ind = await repo.diffIndexWithHEAD()

				if (ind.length === 0) {
					throw new Error(
						'No changes to commit. Please stage your changes first.',
					)
				}

				const summaries: string[] = []
				for (const change of ind) {
					const diff = await getSummaryUriDiff(repo, change.uri.fsPath)
					if (!diff || diff.trim() === '') continue

					const hash = summaryCache.computeHash(diff)
					const cached = summaryCache.get(change.uri.fsPath)

					if (cached && cached.diffHash === hash) {
						summaries.push(cached.summary)
					} else {
						// Cache miss - retrieve summary and cache it
						const summary = await summarizeFileDiff(diff)
						summaryCache.set(change.uri.fsPath, hash, summary)
						summaries.push(summary)
					}
				}
				
				const commitMessage = await getCommitMessage(summaries)
				repo.inputBox.value = commitMessage
			} catch (error: any) {
				vscode.window.showErrorMessage(
					error?.message || 'Unable to create commit message.',
				)
			}
		},
	)
}

export function getGitExtension() {
	const vscodeGit = vscode.extensions.getExtension<GitExtension>('vscode.git')
	const gitExtension = vscodeGit?.exports
	return gitExtension?.getAPI(1)
}
