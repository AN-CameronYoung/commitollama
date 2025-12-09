import * as vscode from 'vscode'
import { summaryCache } from './cache'
import { summarizeFileDiff } from './summarizer'
import { getGitExtension, getSummaryUriDiff } from './utils'
import { config } from './config'

export class BackgroundScanner {
	private intervalId: NodeJS.Timeout | undefined
	private disposables: vscode.Disposable[] = []

	constructor() {
		this.start()
	}

	public start() {
		if (this.disposables.length > 0) {
			return
		}

		// Watch for file saves
		this.disposables.push(
			vscode.workspace.onDidSaveTextDocument(async (doc) => {
				const { background } = config.inference
				if (background.enabled && background.onSave) {
					await this.processFile(doc.uri)
				}
			}),
		)

		// Start interval
		this.restartInterval()

		// Listen for config changes to restart/stop
		this.disposables.push(
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration('commitollama.background')) {
					this.restartInterval()
				}
			}),
		)
	}

	private restartInterval() {
		if (this.intervalId) {
			clearInterval(this.intervalId)
			this.intervalId = undefined
		}

		const { background } = config.inference
		if (background.enabled && background.interval > 0) {
			this.intervalId = setInterval(() => {
				this.scanOpenRepositories()
			}, background.interval * 1000)
		}
	}

	public stop() {
		if (this.intervalId) {
			clearInterval(this.intervalId)
			this.intervalId = undefined
		}
		this.disposables.forEach((d) => d.dispose())
		this.disposables = []
	}

	private async scanOpenRepositories() {
		const git = getGitExtension()
		if (!git) return

		for (const repo of git.repositories) {
			const changes = await repo.diffIndexWithHEAD()
			for (const change of changes) {
				await this.processFile(change.uri)
			}
		}
	}

	private async processFile(uri: vscode.Uri) {
		try {
			const git = getGitExtension()
			const repo = git?.repositories.find(
				(r) => r.rootUri.toString() === uri.fsPath || uri.fsPath.startsWith(r.rootUri.fsPath),
			)
			// Better repository matching logic might be needed, but this is a start (or reverse: find repo for uri)
			
            // Actually, we can just find the repo that contains this URI
            const foundRepo = git?.repositories.find(r => uri.fsPath.startsWith(r.rootUri.fsPath));
            if (!foundRepo) return;

			// Check if file is staged or modified? 
            // The user wants summary of "changes". Usually that means working tree vs HEAD.
            // But if they stage it, they might want summary of staged?
            // Let's stick to what `getSummaryUriDiff` does (which is diffIndexWithHEAD(uri)). 
            // Wait, `diffIndexWithHEAD` compares Index (Staged) vs HEAD.
            // If the user JUST saved the file, it is in Working Tree, not Index.
            // We probably want to summarize Working Tree changes too if we want to be proactive?
            // However, the commit is generated from STAGED changes.
            // So if I save a file but don't stage it, summarizing it for the commit message is premature?
            // BUT, the prompt says "concise summary of changes on save... and then when staging... use those".
            // If I only analyze Staged, then "On Save" doesn't help much unless auto-stage is on.
            // Let's assume we want to summarize what WILL be committed. So we should probably look at Staged changes?
            // Or maybe the user wants to summarize the file state vs HEAD regardless of staging?
            // The Utils `getSummaryUriDiff` calls `repo.diffIndexWithHEAD(uri)`.
            // Let's check `utils.ts` again.

			const diff = await getSummaryUriDiff(foundRepo, uri.fsPath) 
            // Note: `diffIndexWithHEAD` usually means Staged vs HEAD. 
            // If the user hasn't staged the file, this provides no output or old output?
            // Actually in VSCode Git API:
            // diffIndexWithHEAD: Staged vs HEAD.
            // diffWithHEAD: Working Tree vs HEAD.
            
            // If the goal is "faster commit generation", we only care about what IS staged.
            // But if the user workflow is: Modify -> Save -> Stage -> Commit.
            // If we only look at Staged, "On Save" won't do anything because it's not staged yet.
            // So we should probably look at "Working Tree vs HEAD" to pre-calculate, 
            // assuming the user will stage exactly that.
            // BUT, if they stage partial lines, our summary is wrong.
            // "getSummaryUriDiff" uses `diffIndexWithHEAD` which is Staged.
            // So currently the extension ONLY looks at staged files.
            // So for "On Save" to work, the user must treat "Save" as "I'm done with this file".
            // If they haven't staged it, `diffIndexWithHEAD` returns nothing for that file if it wasn't already staged?
            // Let's modify `utils.ts` later to be flexible.
            // For now, I will use `diffWithHEAD` (Working vs HEAD) for the background scan?
            // No, if the final commit ONLY uses Staged, we must cache Staged.
            // If I save the file, I haven't staged it yet.
            // So `diffIndexWithHEAD` is empty.
            // So "On Save" background scan is useless unless I Stage.
            
            // Wait, if I use `diffWithHEAD` (Working Tree Changes), I can generate a summary.
            // If the user then Stages the file (fully), the Staged diff is identical to the Working diff I just summarized.
            // So I can key the cache by the Hash of the Diff Content.
            // So:
            // 1. On Save: Get Working Tree Diff. Hash it. Summary it. Cache {Hash -> Summary}.
            // 2. On Commit: Get Staged Diff. Hash it. Look up Hash in Cache.
            // If the user staged everything, Hash matches -> Hit.
            // If partial stage, Hash misses -> Re-generate.
            // This works perfectly!
            
            // I need to import a way to get Working Tree Diff. 
            // `repo.diffWithHEAD(path)` gives working tree vs HEAD.
            // `repo.diffIndexWithHEAD(path)` gives Index vs HEAD.
            
            // I will use `diffWithHEAD` here for the proactive scan.

            const workingDiff = await foundRepo.diffWithHEAD(uri.fsPath);
            if (!workingDiff) return;

			const hash = summaryCache.computeHash(workingDiff)
			if (summaryCache.has(uri.fsPath)) {
				const cached = summaryCache.get(uri.fsPath)
				if (cached?.diffHash === hash) {
					return // Already cached and fresh
				}
			}

            // Generate
			const summary = await summarizeFileDiff(workingDiff)
			summaryCache.set(uri.fsPath, hash, summary)
            // We cache it keyed by Path, but we VALIDATE it by Hash.
            // Actually, if we want to retrieve it by Path later, we simply check if the CURRENT Staged Diff Hash matches the Cached Hash.
            // The cache stores { diffHash, summary }.
            // So:
            // Cache: Map<FilePath, { diffHash, summary }>
            // On Commit(FilePath):
            //   StagedDiff = ...
            //   StagedHash = hash(StagedDiff)
            //   Entry = Cache.get(FilePath)
            //   if (Entry && Entry.diffHash == StagedHash) return Entry.summary
            //   else Generate...

		} catch (error) {
			console.error('Background scan failed for', uri.fsPath, error)
		}
	}
}
