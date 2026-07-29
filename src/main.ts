import fs from 'fs';
import path from 'path';
import axios, { isAxiosError } from 'axios';
import * as core from '@actions/core';
import * as github from '@actions/github';
import {
	formatDuration,
	prepareReportActions,
	sortReport,
} from '@moonrepo/report';
import type { ActionContext, ActionStatus, Duration, RunReport } from '@moonrepo/types';

export interface RenderOptions {
	limit: number;
	rootDir: string;
	slowLimit: number;
}

export function buildCommentMarker(): string {
	const matrixKey = core.getInput('matrix') || 'unknown';
	return `<!-- moon-run-report: ${matrixKey} -->`;
}

export function resolveCommitRef(): { sha: string; url: string } | null {
	const { repo, serverUrl, sha: baseSha } = github.context;

	 
	const sha = github.context.payload.pull_request?.head?.sha ?? baseSha;

	if (!sha || !repo) return null;

	const commitSha = String(sha);
	return {
		sha: commitSha,
		url: `${serverUrl}/${repo.owner}/${repo.repo}/commit/${commitSha}`,
	};
}

export function collectEnvContext(): Record<string, string> | null {
	const env: Record<string, string> = {};

	for (const [key, value] of Object.entries(process.env)) {
		if (
			(key.startsWith('MOON_') || key.startsWith('PROTO_')) &&
			value &&
			process.env.NODE_ENV !== 'test'
		) {
			env[key] = value;
		}
	}

	return Object.keys(env).length === 0 ? null : env;
}

export function computeSavingsPct(projected: Duration, savings: Duration): number {
	const toMs = ({ secs, nanos }: Duration) => secs * 1000 + nanos / 1_000_000;
	return Math.round((toMs(savings) / toMs(projected)) * 100);
}

export function buildCodeFence(map: Record<string, unknown> | string[]): string[] {
	const lines = ['```'];

	if (Array.isArray(map)) {
		lines.push(...map);
	} else {
		for (const [key, value] of Object.entries(map)) {
			lines.push(`${key} = ${String(value)}`);
		}
	}

	lines.push('```');

	return lines;
}

export function buildCollapsibleSection(title: string, body: string[]): string[] {
	const openTag = `<details><summary><strong>${title}</strong></summary><div>`;
	return ['', openTag, '', ...body, '', '</div></details>'];
}

export function renderDurationSummary({ duration, comparisonEstimate }: RunReport): string {
	const segments = [`Total time: ${formatDuration(duration)}`];

	if (comparisonEstimate) {
		segments.push(`Comparison time: ${formatDuration(comparisonEstimate.duration)}`);

		const { gain, loss, percent } = comparisonEstimate;
		if (percent > 0 && gain) {
			segments.push(`Estimated savings: ${formatDuration(gain)} (${percent.toFixed(1)}% faster)`);
		} else if (percent < 0 && loss) {
			segments.push(`Estimated loss: ${formatDuration(loss)} (${Math.abs(percent).toFixed(1)}% slower)`);
		}
	}

	return segments.join(' | ');
}

function labelForStatus(status: ActionStatus): string {
	const labels: Partial<Record<ActionStatus, string>> = {
		aborted: 'Aborted',
		cached: 'Cached',
		'cached-from-remote': 'Cached',
		failed: 'Failed',
		invalid: 'Invalid',
		passed: 'Passed',
		running: 'Running',
		skipped: 'Skipped',
		'timed-out': 'Timed out',
	};
	return labels[status] ?? 'Unknown';
}

function buildActionsTable(
	report: RunReport,
	limit: number,
	slowLimit: number,
): { header: string[]; mainRows: string[]; overflowRows: string[] } {
	const header = [
		'|     | Action | Time | Status | Info |',
		'| :-: | :----- | ---: | :----- | :--- |',
	];
	const mainRows: string[] = [];
	const overflowRows: string[] = [];

	prepareReportActions(report, slowLimit).forEach((action, index) => {
		const row = `| ${action.icon} | \`${action.label}\` | ${action.time} | ${labelForStatus(
			action.status,
		)} | ${action.comments.join(', ')} |`;

		if (index < limit) {
			mainRows.push(row);
		} else {
			overflowRows.push(row);
		}
	});

	return { header, mainRows, overflowRows };
}

function buildEnvironmentSection(matrixData: Record<string, unknown> | null): string[] {
	const envVars = collectEnvContext();

	if (!matrixData && !envVars) {
		return [];
	}

	const section = [
		`**OS:** ${process.env.NODE_ENV === 'test' ? 'Test' : process.env.RUNNER_OS ?? 'unknown'}`,
	];

	if (matrixData) {
		section.push('**Matrix:**', ...buildCodeFence(matrixData));
	}

	if (envVars) {
		section.push('**Variables:**', ...buildCodeFence(envVars));
	}

	return buildCollapsibleSection('Environment', section);
}

function buildChangedFilesSection(report: RunReport, rootDir: string): string[] {
	const lines: string[] = [];
	const { touchedFiles = [], changedFiles = [] } = report.context as ActionContext & {
		touchedFiles?: string[];
		changedFiles?: string[];
	};

	if (touchedFiles.length > 0) {
		lines.push(
			...buildCollapsibleSection(
				'Touched files',
				buildCodeFence(touchedFiles.map((f) => f.replace(rootDir, '')).sort()),
			),
		);
	}

	if (changedFiles.length > 0) {
		lines.push(
			...buildCollapsibleSection(
				'Changed files',
				buildCodeFence(changedFiles.map((f) => f.replace(rootDir, '')).sort()),
			),
		);
	}

	return lines;
}

export function buildReportMarkdown(
	report: RunReport,
	{ limit, slowLimit, rootDir }: RenderOptions,
): string {
	const commit = resolveCommitRef();
	const matrix = core.getInput('matrix');
	let matrixData: Record<string, unknown> | null = null;
	if (matrix) {
		try {
			matrixData = JSON.parse(matrix) as Record<string, unknown>;
		} catch {
			core.warning('matrix input is not valid JSON — skipping matrix display.');
		}
	}

	const lines = [
		buildCommentMarker(),
		'',
		commit ? `## Run report for [${commit.sha.slice(0, 8)}](${commit.url})` : '## Run report',
	];

	if (matrixData) {
		lines[2] += ` \`(${Object.values(matrixData).join(', ')})\``;
	}

	if (report.duration) {
		lines.push(renderDurationSummary(report));
	}

	const { header, mainRows, overflowRows } = buildActionsTable(report, limit, slowLimit);
	lines.push(...header, ...mainRows);

	if (overflowRows.length > 0) {
		lines.push(
			`| | And ${overflowRows.length} more... | | | |`,
			...buildCollapsibleSection('Expanded report', [...header, ...overflowRows]),
		);
	}

	lines.push(...buildEnvironmentSection(matrixData), ...buildChangedFilesSection(report, rootDir));

	return lines.join('\n');
}

async function checkSubscription(): Promise<void> {
	const eventPath = process.env.GITHUB_EVENT_PATH;
	let isPrivate: boolean | undefined;

	if (eventPath && fs.existsSync(eventPath)) {
		const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8')) as {
			repository?: { private?: boolean };
		};
		isPrivate = eventData?.repository?.private;
	}

	const upstream = 'moonrepo/run-report-action';
	const action = process.env.GITHUB_ACTION_REPOSITORY;
	const docsUrl = 'https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions';

	core.info('');
	core.info('\u001B[1;36mStepSecurity Maintained Action\u001B[0m');
	core.info(`Secure drop-in replacement for ${upstream}`);
	if (isPrivate === false) core.info('\u001B[32m✓ Free for public repositories\u001B[0m');
	core.info(`\u001B[36mLearn more:\u001B[0m ${docsUrl}`);
	core.info('');

	if (isPrivate === false) return;

	const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
	const body: Record<string, string> = { action: action || '' };
	if (serverUrl !== 'https://github.com') body.ghes_server = serverUrl;

	try {
		await axios.post(
			`https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
			body,
			{ timeout: 3000 },
		);
	} catch (error) {
		if (isAxiosError(error) && error.response?.status === 403) {
			core.error(
				`\u001B[1;31mThis action requires a StepSecurity subscription for private repositories.\u001B[0m`,
			);
			core.error(`\u001B[31mLearn how to enable a subscription: ${docsUrl}\u001B[0m`);
			// eslint-disable-next-line unicorn/no-process-exit
			process.exit(1);
		}
		core.info('Timeout or API not reachable. Continuing to next step.');
	}
}

function readMoonReport(rootDir: string): RunReport | null {
	for (const fileName of ['ciReport.json', 'runReport.json']) {
		const reportPath = path.join(rootDir, '.moon/cache', fileName);

		core.debug(`Searching for run report at ${reportPath}`);

		if (fs.existsSync(reportPath)) {
			core.debug('Report found.');
			return JSON.parse(fs.readFileSync(reportPath, 'utf8')) as RunReport;
		}
	}

	return null;
}

async function postPrComment(token: string, markdown: string): Promise<void> {
	const {
		payload: { pull_request: pr, issue },
		repo,
	} = github.context;

	let issueNum = pr?.number ?? issue?.number;
	const octokit = github.getOctokit(token);

	if (!issueNum) {
		core.debug('No pull request or issue in context, searching by commit');

		const { data: prs } = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
			...repo,
			commit_sha: github.context.sha,
		});

		issueNum = prs[0]?.number;
	}

	if (!issueNum) {
		core.warning('No pull request or issue found, skipping comment.');
		return;
	}

	const { data: comments } = await octokit.rest.issues.listComments({
		...repo,
		issue_number: issueNum,
	});

	const marker = buildCommentMarker();
	const existing = comments.find((c: { body?: null | string; id: number }) => c.body?.includes(marker));

	if (existing) {
		core.debug(`Updating existing comment #${existing.id}`);
		await octokit.rest.issues.updateComment({ ...repo, body: markdown, comment_id: existing.id });
	} else {
		core.debug('Creating a new comment');
		await octokit.rest.issues.createComment({ ...repo, body: markdown, issue_number: issueNum });
	}

	core.debug(`Comment body:\n\n${markdown}`);
}

async function writeJobSummary(markdown: string): Promise<void> {
	await core.summary.addRaw(markdown).write();
}

export async function execute(): Promise<void> {
	try {
		await checkSubscription();

		const token = core.getInput('access-token');
		const limit = Number(core.getInput('limit'));
		const omitComment = core.getBooleanInput('skip-comment');
		const slowLimit = Number(core.getInput('slow-threshold'));
		const rootDir =
			core.getInput('workspace-root') || process.env.GITHUB_WORKSPACE || process.cwd();

		core.debug(`Workspace root: ${rootDir}`);

		if (!token) {
			throw new Error('An `access-token` input is required.');
		}

		const report = readMoonReport(rootDir);

		if (!report) {
			core.warning('Run report not found. Has `moon ci` or `moon run` executed?');
			return;
		}

		const orderBy = core.getInput('sort-by');
		const orderDir = core.getInput('sort-dir') || 'desc';

		if (orderBy) {
			sortReport(report, orderBy as 'time', orderDir as 'desc');
		}

		const markdown = buildReportMarkdown(report, { limit, rootDir, slowLimit });
		core.setOutput('report', markdown);

		if (omitComment) {
			core.debug('Comment creation skipped');
		} else {
			try {
				await postPrComment(token, markdown);
			} catch (error: unknown) {
				core.warning(String(error));
				core.notice('\nFailed to post comment on pull request. Running from a fork?\n');
				core.info(markdown);
			}
		}

		await writeJobSummary(markdown);
		core.setOutput('comment-created', omitComment ? 'false' : 'true');
	} catch (error: unknown) {
		core.setOutput('comment-created', 'false');
		core.setFailed((error as Error).message);
	}
}
