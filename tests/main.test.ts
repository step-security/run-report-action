import * as core from '@actions/core';
import * as github from '@actions/github';
import { sortReport } from '@moonrepo/report';
import { buildReportMarkdown } from '../src/main';
import {
	durationsReport,
	errorsReport,
	estimateReport,
	flakinessReport,
	standardReport,
	touchedFilesReport,
} from './fixtures';

jest.mock('@actions/github', () => ({
	context: { payload: {}, serverUrl: 'https://github.com' },
}));

const opts = {
	limit: 20,
	rootDir: '',
	slowLimit: 60,
};

describe('buildReportMarkdown()', () => {
	it('builds markdown for a standard run', () => {
		const result = buildReportMarkdown(standardReport, opts);

		expect(result).toContain('<!-- moon-run-report: unknown -->');
		expect(result).toContain('## Run report');
		expect(result).toContain('`SetupNodeToolchain`');
		expect(result).toContain('Skipped');
		expect(result).toContain('Cached');
		expect(result).not.toContain('Total time');
	});

	it('adds touched files collapsible when context has files', () => {
		const result = buildReportMarkdown(touchedFilesReport, opts);

		expect(result).toContain('Touched files');
		expect(result).toContain('apps/web/src/index.tsx');
		expect(result).toContain('packages/example/src/index.ts');
	});

	it('renders duration header and marks slow actions', () => {
		const result = buildReportMarkdown(durationsReport, opts);

		expect(result).toContain('Total time: 371ms');
		expect(result).toContain('**SLOW**');
	});

	it('shows each attempt row for flaky actions', () => {
		const result = buildReportMarkdown(flakinessReport, opts);
		const rows = result
			.split('\n')
			.filter((line) => line.includes('RunTarget(runtime:typecheck)'));

		expect(rows).toHaveLength(3);
		expect(result).toContain('Failed');
		expect(result).toContain('Passed');
	});

	it('displays failed status for errored actions', () => {
		const result = buildReportMarkdown(errorsReport, opts);

		expect(result).toContain('Failed');
		expect(result).toContain('RunTarget(types:build)');
		expect(result).toContain('**SLOW**');
	});

	it('appends savings estimate when comparison data is present', () => {
		const result = buildReportMarkdown(estimateReport, opts);

		expect(result).toContain('Total time');
		expect(result).toContain('Estimated savings');
		expect(result).toContain('10.0% faster');
	});

	it('embeds commit sha link in report heading', () => {
		Object.assign(github.context, {
			payload: { pull_request: { number: '123' } },
			repo: { owner: 'step-security', repo: 'run-report-action' },
			sha: '59719f967ddcf585da9bc7ba8730dcd2865cbdfa',
		});

		const result = buildReportMarkdown(standardReport, opts);

		expect(result).toContain('Run report for [59719f96]');
		expect(result).toContain(
			'https://github.com/step-security/run-report-action/commit/59719f967ddcf585da9bc7ba8730dcd2865cbdfa',
		);

		// @ts-expect-error Allow override
		delete github.context.sha;
	});

	it('includes matrix values in environment collapsible', () => {
		const spy = jest
			.spyOn(core, 'getInput')
			.mockImplementation(() => JSON.stringify({ 'node-version': 16, os: 'ubuntu-latest' }));

		const result = buildReportMarkdown(standardReport, opts);

		expect(result).toContain('(16, ubuntu-latest)');
		expect(result).toContain('Environment');
		expect(result).toContain('ubuntu-latest');

		spy.mockRestore();
	});

	it('hides overflow rows behind expanded section when limit is exceeded', () => {
		const result = buildReportMarkdown(durationsReport, { ...opts, limit: 3 });

		expect(result).toContain('And 1 more...');
		expect(result).toContain('Expanded report');
	});
});

describe('report sort order', () => {
	it('places longest action first when sorted by time desc', () => {
		const report = structuredClone(standardReport);
		sortReport(report, 'time', 'desc');

		const result = buildReportMarkdown(report, opts);

		expect(result.indexOf('RunTarget(website:typecheck)')).toBeLessThan(
			result.indexOf('RunTarget(runtime:typecheck)'),
		);
	});

	it('places earliest label first when sorted by label asc', () => {
		const report = structuredClone(standardReport);
		sortReport(report, 'label', 'asc');

		const result = buildReportMarkdown(report, opts);

		expect(result.indexOf('InstallNodeDeps')).toBeLessThan(
			result.indexOf('SetupNodeToolchain'),
		);
	});
});
