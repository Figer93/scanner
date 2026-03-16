/* eslint-disable no-console */
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');

const execFileAsync = promisify(execFile);

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

function resolveRepoRoot(explicitRepoRoot) {
  const repoRoot = explicitRepoRoot?.trim() || process.env.GIT_MCP_REPO_ROOT?.trim() || process.cwd();
  return path.resolve(repoRoot);
}

async function runGit(args, { repoRoot }) {
  const { stdout, stderr } = await execFileAsync('git', ['--no-pager', ...args], {
    cwd: repoRoot,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_PAGER: 'cat',
      PAGER: 'cat',
    },
  });
  return { stdout: stdout ?? '', stderr: stderr ?? '' };
}

function coerceText({ stdout, stderr }) {
  const out = String(stdout || '');
  const err = String(stderr || '');
  return err && out ? `${out}\n${err}` : (out || err || '');
}

function toolTextResponse(text) {
  return { content: [{ type: 'text', text: text || '' }] };
}

async function main() {
  const server = new McpServer({ name: 'git-mcp', version: '0.1.0' });

  server.tool(
    'git_status',
    'Show git status (porcelain by default).',
    {
      repoRoot: z.string().optional().describe('Optional repo root path'),
      porcelain: z.boolean().optional().default(true),
      untracked: z.enum(['normal', 'no', 'all']).optional().default('normal'),
    },
    async ({ repoRoot, porcelain, untracked }) => {
      const root = resolveRepoRoot(repoRoot);
      const args = ['status'];
      if (porcelain) args.push('--porcelain=v1', '--branch');
      if (untracked === 'no') args.push('--untracked-files=no');
      if (untracked === 'all') args.push('--untracked-files=all');
      const res = await runGit(args, { repoRoot: root });
      return toolTextResponse(coerceText(res));
    }
  );

  server.tool(
    'git_diff',
    'Show git diff.',
    {
      repoRoot: z.string().optional().describe('Optional repo root path'),
      staged: z.boolean().optional().default(false),
      pathspec: z.array(z.string()).optional().describe('Optional list of pathspecs'),
      contextLines: z.number().int().min(0).max(50).optional().default(3),
    },
    async ({ repoRoot, staged, pathspec, contextLines }) => {
      const root = resolveRepoRoot(repoRoot);
      const args = ['diff', `-U${contextLines}`];
      if (staged) args.push('--staged');
      if (pathspec?.length) args.push('--', ...pathspec);
      const res = await runGit(args, { repoRoot: root });
      return toolTextResponse(coerceText(res));
    }
  );

  server.tool(
    'git_log',
    'Show git log.',
    {
      repoRoot: z.string().optional().describe('Optional repo root path'),
      maxCount: z.number().int().min(1).max(200).optional().default(20),
      format: z.enum(['oneline', 'medium']).optional().default('oneline'),
    },
    async ({ repoRoot, maxCount, format }) => {
      const root = resolveRepoRoot(repoRoot);
      const args = ['log', `-n${maxCount}`];
      if (format === 'oneline') args.push('--oneline', '--decorate=short');
      const res = await runGit(args, { repoRoot: root });
      return toolTextResponse(coerceText(res));
    }
  );

  server.tool(
    'git_current_branch',
    'Get current branch name.',
    { repoRoot: z.string().optional().describe('Optional repo root path') },
    async ({ repoRoot }) => {
      const root = resolveRepoRoot(repoRoot);
      const res = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { repoRoot: root });
      return toolTextResponse(coerceText(res).trim());
    }
  );

  server.tool(
    'git_branch_list',
    'List local branches.',
    { repoRoot: z.string().optional().describe('Optional repo root path') },
    async ({ repoRoot }) => {
      const root = resolveRepoRoot(repoRoot);
      const res = await runGit(['branch', '--list', '--no-color'], { repoRoot: root });
      return toolTextResponse(coerceText(res));
    }
  );

  server.tool(
    'git_show',
    'Show a commit or object.',
    {
      repoRoot: z.string().optional().describe('Optional repo root path'),
      rev: z.string().optional().default('HEAD'),
      nameOnly: z.boolean().optional().default(false),
    },
    async ({ repoRoot, rev, nameOnly }) => {
      const root = resolveRepoRoot(repoRoot);
      const args = ['show', '--no-color', rev];
      if (nameOnly) args.push('--name-only', '--pretty=medium');
      const res = await runGit(args, { repoRoot: root });
      return toolTextResponse(coerceText(res));
    }
  );

  // Mutating tools (kept explicit and minimal)
  server.tool(
    'git_add',
    'Stage files (git add).',
    {
      repoRoot: z.string().optional().describe('Optional repo root path'),
      pathspec: z.array(z.string()).min(1).describe('Pathspec(s) to add; use [\".\"] to add all'),
    },
    async ({ repoRoot, pathspec }) => {
      const root = resolveRepoRoot(repoRoot);
      const res = await runGit(['add', '--', ...pathspec], { repoRoot: root });
      return toolTextResponse(coerceText(res) || 'OK');
    }
  );

  server.tool(
    'git_commit',
    'Create a commit (git commit -m).',
    {
      repoRoot: z.string().optional().describe('Optional repo root path'),
      message: z.string().min(1).describe('Commit message'),
      all: z.boolean().optional().default(false).describe('Stage modified/deleted files before commit (git commit -am)'),
    },
    async ({ repoRoot, message, all }) => {
      const root = resolveRepoRoot(repoRoot);
      const args = ['commit'];
      if (all) args.push('-a');
      args.push('-m', message);
      const res = await runGit(args, { repoRoot: root });
      return toolTextResponse(coerceText(res));
    }
  );

  server.tool(
    'git_push',
    'Push current branch to its remote.',
    {
      repoRoot: z.string().optional().describe('Optional repo root path'),
      remote: z.string().optional().default('origin'),
      branch: z.string().optional().describe('Branch name; default is current HEAD branch'),
      setUpstream: z.boolean().optional().default(false),
    },
    async ({ repoRoot, remote, branch, setUpstream }) => {
      const root = resolveRepoRoot(repoRoot);
      const args = ['push', remote];
      if (setUpstream) args.push('-u');
      if (branch) args.push(branch);
      const res = await runGit(args, { repoRoot: root });
      return toolTextResponse(coerceText(res));
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

