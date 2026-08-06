#!/usr/bin/env node
import { createRequire } from 'node:module';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { VynixApiError, VynixClient } from './api.js';
import { assertConfigured, loadConfig } from './config.js';
import type { AnnotationScreenshot } from './types.js';

const STATUS_VALUES = [
  'open',
  'in_progress',
  'review',
  'completed',
  'rejected',
  'archived',
] as const;
const TYPE_VALUES = [
  'bug',
  'design',
  'enhancement',
  'content',
  'mobile',
  'accessibility',
  'performance',
  'seo',
] as const;
const PRIORITY_VALUES = ['critical', 'high', 'medium', 'low'] as const;
const TARGET_VALUES = ['claude', 'copilot', 'cursor', 'gemini', 'codex', 'generic'] as const;
const PROVIDER_VALUES = ['openai', 'anthropic', 'gemini', 'openrouter', 'mistral', 'groq'] as const;

type Content =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

type ToolResult = {
  content: Content[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function text(value: string): ToolResult {
  return { content: [{ type: 'text', text: value }] };
}

const SENSITIVE_KEYS = new Set([
  'ingest_key',
  'reporter_name',
  'reporter_email',
  'created_by',
  'author_id',
  'author_name',
  'user_id',
  'user_email',
  'invited_email',
  'actor',
  'meta',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'cookie',
  'set-cookie',
  'headers',
  'request_headers',
  'response_headers',
  'body',
  'request_body',
  'response_body',
  'query',
  'query_string',
  'trace',
  'stack',
]);

function shouldDropKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (SENSITIVE_KEYS.has(lower)) {
    return true;
  }
  return lower.includes('email') || lower.includes('password') || lower.includes('secret');
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (shouldDropKey(key)) {
        continue;
      }
      out[key] = sanitizeValue(child);
    }
    return out;
  }

  return value;
}

function sanitizeRecord<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return sanitizeValue(value) as Record<string, unknown>;
}

function toPublicProject(project: Record<string, unknown>): Record<string, unknown> {
  return sanitizeRecord({
    id: project.id,
    name: project.name,
    website_url: project.website_url,
    allowed_origins: project.allowed_origins,
    created_at: project.created_at,
  });
}

function toPublicAnnotation(annotation: Record<string, unknown>): Record<string, unknown> {
  return sanitizeRecord({
    id: annotation.id,
    project_id: annotation.project_id,
    title: annotation.title,
    description: annotation.description,
    priority: annotation.priority,
    type: annotation.type,
    status: annotation.status,
    page_url: annotation.page_url,
    page_title: annotation.page_title,
    selector: annotation.selector,
    element: annotation.element,
    page: annotation.page,
    dom: annotation.dom,
    created_at: annotation.created_at,
    updated_at: annotation.updated_at,
  });
}

function toPublicComment(comment: Record<string, unknown>): Record<string, unknown> {
  return sanitizeRecord({
    id: comment.id,
    annotation_id: comment.annotation_id,
    body: comment.body,
    created_at: comment.created_at,
  });
}

function toPublicIssue(issue: Record<string, unknown>): Record<string, unknown> {
  return sanitizeRecord({
    id: issue.id,
    annotation_id: issue.annotation_id,
    provider: issue.provider,
    repo: issue.repo,
    issue_number: issue.issue_number,
    issue_url: issue.issue_url,
    state: issue.state,
    phase: issue.phase,
    pr_url: issue.pr_url,
    created_at: issue.created_at,
  });
}

function toPublicIssueLink(issue: Record<string, unknown>): Record<string, unknown> {
  return sanitizeRecord({
    id: issue.id,
    annotation_id: issue.annotation_id,
    provider: issue.provider,
    repo: issue.repo,
    issue_number: issue.issue_number,
    issue_url: issue.issue_url,
    state: issue.state,
    created_at: issue.created_at,
  });
}

function toPublicMember(member: Record<string, unknown>): Record<string, unknown> {
  return sanitizeRecord({
    role: member.role,
    status: member.status,
    created_at: member.created_at,
  });
}

function toPublicActivity(activity: Record<string, unknown>): Record<string, unknown> {
  return sanitizeRecord({
    action: activity.action,
    annotation_id: activity.annotation_id,
    annotation_title: activity.annotation_title,
    created_at: activity.created_at,
  });
}

function toPublicShareLink(link: Record<string, unknown>): Record<string, unknown> {
  return sanitizeRecord({
    id: link.id,
    project_id: link.project_id,
    scope: link.scope,
    path: link.path,
    expires_at: link.expires_at,
    is_expired: link.is_expired,
    created_at: link.created_at,
  });
}

/**
 * Return a tool result that carries both a human-readable JSON text block and a machine
 * `structuredContent` object. When a tool declares an outputSchema the MCP SDK requires the
 * structured content and validates it against the schema, so the schemas below are permissive
 * (every field optional; complex or nullable fields typed as unknown) to accept real API data.
 */
function jsonOut(value: unknown, structuredContent: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent,
  };
}

function jsonResource(uri: string, value: unknown): { contents: Array<{ uri: string; mimeType: string; text: string }> } {
  return {
    contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(value, null, 2) }],
  };
}

function textResource(uri: string, value: string): { contents: Array<{ uri: string; mimeType: string; text: string }> } {
  return {
    contents: [{ uri, mimeType: 'text/markdown', text: value }],
  };
}

function templateVarAsString(value: string | string[] | undefined, name: string): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }
  throw new Error(`Missing resource template variable: ${name}`);
}

// --- Output schema shapes (permissive; documented field names) --------------
const oStr = z.string().optional();
const oStrNull = z.string().nullable().optional();
const oNum = z.number().optional();
const oNumNull = z.number().nullable().optional();
const oBool = z.boolean().optional();
const oAny = z.unknown().optional();
const oArr = z.array(z.unknown()).optional();

const projectShape = {
  id: oStr,
  name: oStr,
  website_url: oStrNull,
  allowed_origins: z.array(z.string()).optional(),
  created_at: oStr,
};
const annotationShape = {
  id: oStr,
  project_id: oStr,
  title: oStr,
  description: oStrNull,
  priority: oStr,
  type: oStr,
  status: oStr,
  page_url: oStr,
  page_title: oStrNull,
  selector: oStrNull,
  element: oAny,
  page: oAny,
  dom: oAny,
  created_at: oStr,
  updated_at: oStr,
};
const commentShape = {
  id: oStr,
  annotation_id: oStr,
  body: oStr,
  created_at: oStr,
};
const memberShape = {
  role: oStr,
  status: oStr,
  created_at: oStr,
};
const activityShape = {
  annotation_id: oStrNull,
  annotation_title: oStrNull,
  action: oStr,
  created_at: oStr,
};
const issueShape = {
  id: oStr,
  annotation_id: oStr,
  provider: oStr,
  repo: oStrNull,
  issue_number: oNumNull,
  issue_url: oStrNull,
  assignee: oStrNull,
  agent: oBool,
  state: oStrNull,
  phase: oStr,
  pr_url: oStrNull,
  created_at: oStr,
};
const issueLinkShape = {
  id: oStr,
  annotation_id: oStr,
  provider: oStr,
  repo: oStr,
  issue_number: oNumNull,
  issue_url: oStrNull,
  state: oStr,
  created_at: oStr,
};
const aiAnalysisShape = {
  id: oStr,
  annotation_id: oStr,
  status: oStr,
  provider: oStrNull,
  model: oStrNull,
  summary: oStrNull,
  root_causes: oArr,
  confidence: oNumNull,
  suggested_fix: oStrNull,
  suggested_files: oArr,
  created_at: oStr,
  updated_at: oStr,
};
const shareLinkShape = {
  id: oStr,
  project_id: oStr,
  scope: oStr,
  path: oStr,
  expires_at: oStrNull,
  is_expired: oBool,
  created_at: oStr,
};
const screenshotMetaShape = {
  id: oStr,
  annotation_id: oStr,
  mime: oStr,
  width: oNumNull,
  height: oNumNull,
  byte_size: oNum,
  created_at: oStr,
};

// Passthrough object schemas: allow the extra fields the API includes beyond those documented
// above, so client-side output-schema validation (additionalProperties) never rejects a result.
const zProject = z.object(projectShape).passthrough();
const zAnnotation = z.object(annotationShape).passthrough();
const zComment = z.object(commentShape).passthrough();
const zMember = z.object(memberShape).passthrough();
const zActivity = z.object(activityShape).passthrough();
const zIssue = z.object(issueShape).passthrough();
const zIssueLink = z.object(issueLinkShape).passthrough();
const zAiAnalysis = z.object(aiAnalysisShape).passthrough();
const zShareLink = z.object(shareLinkShape).passthrough();
const zScreenshotMeta = z.object(screenshotMetaShape).passthrough();

function fail(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function describeError(error: unknown): string {
  if (error instanceof VynixApiError) {
    return `Vynix API error (${error.status} ${error.code}): ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred.';
}

function parseBearer(authorization: unknown): string | undefined {
  if (typeof authorization !== 'string') {
    return undefined;
  }

  const value = authorization.trim();
  if (!value.toLowerCase().startsWith('bearer ')) {
    return undefined;
  }

  const token = value.slice(7).trim();
  return token === '' ? undefined : token;
}

/** Wrap a tool body so every failure becomes a clean, readable tool error. */
function guarded(run: () => Promise<ToolResult>): Promise<ToolResult> {
  return run().catch((error: unknown) => fail(describeError(error)));
}

/** Turn an annotation's screenshots into MCP image content a multimodal agent can see. */
function screenshotContent(shots: AnnotationScreenshot[]): ToolResult {
  if (shots.length === 0) {
    return text('This annotation has no attached screenshots.');
  }

  const content: Content[] = [
    { type: 'text', text: `${shots.length} screenshot(s) attached to this annotation:` },
  ];
  for (const shot of shots) {
    const match = /^data:([^;]+);base64,(.*)$/s.exec(shot.data_url);
    if (match) {
      content.push({ type: 'image', mimeType: match[1], data: match[2] });
    }
  }
  return { content };
}

function readVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require('../package.json') as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Build a fully configured MCP server bound to a single API client.
 *
 * The client is captured by every tool closure, so each server instance is scoped to exactly
 * one caller's credentials. In hosted HTTP mode we build one server (and one client) per
 * request, which keeps concurrent callers isolated and prevents auth from leaking across them.
 */
function createServer(client: VynixClient): McpServer {
  const server = new McpServer(
    { name: 'vynix', version: readVersion() },
    {
      // Compliant MCP clients add this to the model's system prompt. It is what makes an
      // agent reach for Vynix (instead of guessing, scraping, or querying a database) when
      // the user asks about site feedback, bugs, or what needs fixing.
      instructions:
        'Vynix is the source of truth for website feedback and annotations. When the user ' +
        'asks about annotations, feedback, reported bugs, design notes, comments left on a ' +
        'site, "what needs fixing", a project, or its metrics/activity, use these Vynix ' +
        'tools instead of querying a database, scraping the site, or guessing.\n' +
        '\n' +
        'Typical flow:\n' +
        '1. Call list_projects to find the project (match by name or website_url, e.g. the ' +
        'user gives a domain like demo.example.com).\n' +
        '2. Call list_annotations with that project_id. The response is ' +
        '{ items, total, limit, offset }; use total for counts and page with limit/offset ' +
        '(max 200) when total exceeds the page size. Filter with status / type / priority.\n' +
        '3. Drill into one item with get_annotation, get_annotation_screenshots, and ' +
        'get_annotation_analysis for full captured context and any AI diagnosis.\n' +
        '4. To work an item: update_annotation_status, add_comment, generate_prompt, or ' +
        'diagnose_annotation. Use get_metrics / get_activity for project-wide overviews.\n' +
        '\n' +
        'Never fabricate annotation data. If no token or project is configured, say so.',
    },
  );

  // --- Resources ------------------------------------------------------------

  server.registerResource(
    'server_metadata',
    'vynix://meta/server',
    {
      title: 'Server metadata',
      description: 'Protocol-ready metadata describing this MCP server, auth, and transport modes.',
      mimeType: 'application/json',
    },
    async (uri) =>
      jsonResource(uri.toString(), {
        name: 'vynix',
        version: readVersion(),
        package: '@usevynix/mcp-server',
        transports: ['stdio', 'streamable-http'],
        auth: {
          token_env: 'VYNIX_API_TOKEN',
          credential_env: ['VYNIX_API_EMAIL', 'VYNIX_API_PASSWORD'],
          api_url_env: 'VYNIX_API_URL',
          default_api_url: 'https://www.vynix.in',
        },
      }),
  );

  server.registerResource(
    'tool_catalog',
    'vynix://reference/tools',
    {
      title: 'Tool catalog',
      description: 'Quick reference for every tool, grouped by read and write behavior.',
      mimeType: 'application/json',
    },
    async (uri) =>
      jsonResource(uri.toString(), {
        read_only: [
          'list_projects',
          'list_annotations',
          'get_annotation',
          'list_comments',
          'get_annotation_analysis',
          'get_annotation_screenshots',
          'list_annotation_issues',
          'list_project_issues',
          'generate_prompt',
          'get_metrics',
          'list_members',
          'get_activity',
        ],
        writes: [
          'update_annotation_status',
          'add_comment',
          'diagnose_annotation',
          'create_github_issue',
          'create_share_link',
        ],
      }),
  );

  server.registerResource(
    'prompt_catalog',
    'vynix://reference/prompts',
    {
      title: 'Prompt catalog',
      description: 'Prompt names and use cases for common Vynix workflows.',
      mimeType: 'application/json',
    },
    async (uri) =>
      jsonResource(uri.toString(), {
        prompts: [
          'fix_annotation',
          'critical_issues',
          'summarize_feedback',
          'jira_ready_tasks',
          'release_notes',
          'group_by_severity',
          'review_homepage',
          'qa_report',
          'accessibility_review',
          'client_comments_summary',
          'release_blockers',
          'sprint_report',
          'engineering_tasks',
          'regression_summary',
          'pm_briefing',
        ],
      }),
  );

  server.registerResource(
    'skill_catalog',
    'vynix://reference/skills',
    {
      title: 'Workflow skills',
      description: 'Opinionated, complete workflows to run with Vynix data.',
      mimeType: 'text/markdown',
    },
    async (uri) =>
      textResource(
        uri.toString(),
        '# Vynix workflow skills\n\n' +
          '- Review website: find high-impact defects using screenshots + diagnostics.\n' +
          '- Find critical issues: list and rank open critical/high annotations.\n' +
          '- Summarize feedback: create a stakeholder summary grouped by type.\n' +
          '- Generate sprint report: summarize done vs open issues and blockers.\n' +
          '- Generate engineering tasks: convert annotations into implementation tickets.\n' +
          '- Accessibility review: isolate accessibility-tagged findings and action items.\n' +
          '- UX review: cluster design/content feedback into usability themes.\n' +
          '- Release readiness: identify blockers and unresolved regressions.\n' +
          '- QA summary: summarize verification outcomes and untested areas.\n' +
          '- Regression summary: compare recent activity with currently open defects.\n' +
          '- Client approval summary: show what is complete and awaiting sign-off.\n' +
          '- Product manager briefing: group work by severity, impact, and ownership.\n',
      ),
  );

  server.registerResource(
    'workflow_examples',
    'vynix://examples/questions',
    {
      title: 'Conversation starters',
      description: 'Natural-language starter questions that map to production workflows.',
      mimeType: 'text/markdown',
    },
    async (uri) =>
      textResource(
        uri.toString(),
        '- What feedback is still open for this project?\n' +
          '- Which issues are blocking release this week?\n' +
          '- Summarize critical bugs from the homepage.\n' +
          '- Turn these open issues into Jira-ready tickets.\n' +
          '- Give me a PM briefing I can paste into standup.\n',
      ),
  );

  const projectSummaryTemplate = new ResourceTemplate('vynix://projects/{project_id}/summary', {
    list: undefined,
  });
  server.registerResource(
    'project_summary',
    projectSummaryTemplate,
    {
      title: 'Project summary',
      description: 'On-demand project snapshot with open issue counts and release blockers.',
      mimeType: 'application/json',
    },
    async (uri, vars) => {
      const projectId = templateVarAsString(vars.project_id, 'project_id');
      const [openAnnotations, criticalAnnotations, issues] = await Promise.all([
        client.listAnnotations(projectId, { status: 'open', limit: 200, offset: 0 }),
        client.listAnnotations(projectId, { status: 'open', priority: 'critical', limit: 200, offset: 0 }),
        client.listProjectIssues(projectId),
      ]);

      const summary = {
        project_id: projectId,
        open_annotations: openAnnotations.total,
        critical_open_annotations: criticalAnnotations.total,
        issue_summary: issues.summary,
        release_blockers: openAnnotations.items
          .filter((item) => item.priority === 'critical' || item.priority === 'high')
          .slice(0, 20)
          .map((item) => ({
            id: item.id,
            title: item.title,
            priority: item.priority,
            type: item.type,
            page_url: item.page_url,
          })),
      };

      return jsonResource(uri.toString(), sanitizeValue(summary));
    },
  );

  const annotationBriefTemplate = new ResourceTemplate('vynix://annotations/{annotation_id}/brief', {
    list: undefined,
  });
  server.registerResource(
    'annotation_brief',
    annotationBriefTemplate,
    {
      title: 'Annotation brief',
      description: 'One-annotation summary with diagnosis state and latest comments.',
      mimeType: 'application/json',
    },
    async (uri, vars) => {
      const annotationId = templateVarAsString(vars.annotation_id, 'annotation_id');
      const [annotation, analysis, comments] = await Promise.all([
        client.getAnnotation(annotationId),
        client.getAnalysis(annotationId),
        client.listComments(annotationId),
      ]);

      const brief = {
        annotation: toPublicAnnotation(annotation as unknown as Record<string, unknown>),
        diagnosis_enabled: analysis.diagnosis_enabled,
        has_analysis: Boolean(analysis.analysis),
        latest_comment: comments[0]
          ? toPublicComment(comments[0] as unknown as Record<string, unknown>)
          : null,
        comment_count: comments.length,
      };

      return jsonResource(uri.toString(), brief as Record<string, unknown>);
    },
  );

  // --- Read-only tools ------------------------------------------------------
  // readOnlyHint lets MCP clients auto-approve these without a per-call prompt.

  server.registerTool(
    'list_projects',
    {
      title: 'List projects',
      description: 'List the Vynix projects you own.',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      outputSchema: z.object({ projects: z.array(zProject) }).passthrough(),
    },
    () =>
      guarded(async () => {
        const projects = (await client.listProjects()).map((project) =>
          toPublicProject(project as unknown as Record<string, unknown>),
        );
        return jsonOut(projects, { projects });
      }),
  );

  server.registerTool(
    'list_annotations',
    {
      title: 'List annotations',
      description:
        'List a project\u2019s annotations, optionally filtered by status, type, or priority. ' +
        'Start here with status "open" to see what needs fixing.',
      inputSchema: {
        project_id: z.string().describe('The id of the project to list annotations for.'),
        status: z.enum(STATUS_VALUES).optional(),
        type: z.enum(TYPE_VALUES).optional(),
        priority: z.enum(PRIORITY_VALUES).optional(),
        limit: z.number().int().min(1).max(200).optional().describe('Page size, 1-200 (default 50).'),
        offset: z.number().int().min(0).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      outputSchema: z
        .object({ items: z.array(zAnnotation), total: oNum, limit: oNum, offset: oNum })
        .passthrough(),
    },
    (args) =>
      guarded(async () => {
        const result = await client.listAnnotations(args.project_id, {
          status: args.status,
          type: args.type,
          priority: args.priority,
          limit: args.limit,
          offset: args.offset,
        });
        const sanitized = {
          items: result.items.map((item) =>
            toPublicAnnotation(item as unknown as Record<string, unknown>),
          ),
          total: result.total,
          limit: result.limit,
          offset: result.offset,
        };
        return jsonOut(sanitized, sanitized);
      }),
  );

  server.registerTool(
    'get_annotation',
    {
      title: 'Get annotation',
      description:
        'Fetch one annotation with its full captured context: page, target element ' +
        '(selector, XPath, styles), surrounding DOM, and runtime diagnostics (console + network).',
      inputSchema: { annotation_id: z.string().describe('The id of the annotation to fetch.') },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      outputSchema: zAnnotation,
    },
    (args) =>
      guarded(async () => {
        const annotation = await client.getAnnotation(args.annotation_id);
        const sanitized = toPublicAnnotation(annotation as unknown as Record<string, unknown>);
        return jsonOut(sanitized, sanitized);
      }),
  );

  server.registerTool(
    'list_comments',
    {
      title: 'List comments',
      description: 'Read the discussion thread on an annotation.',
      inputSchema: { annotation_id: z.string() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      outputSchema: z.object({ comments: z.array(zComment) }).passthrough(),
    },
    (args) =>
      guarded(async () => {
        const comments = (await client.listComments(args.annotation_id)).map((comment) =>
          toPublicComment(comment as unknown as Record<string, unknown>),
        );
        return jsonOut(comments, { comments });
      }),
  );

  server.registerTool(
    'get_annotation_analysis',
    {
      title: 'Get AI diagnosis',
      description:
        'Read the latest stored AI diagnosis for an annotation (root causes, confidence, ' +
        'suggested fix, and likely source files). Returns null when none has been generated yet; ' +
        'run diagnose_annotation to create one.',
      inputSchema: { annotation_id: z.string() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      outputSchema: z
        .object({ analysis: zAiAnalysis.nullable().optional(), diagnosis_enabled: oBool })
        .passthrough(),
    },
    (args) =>
      guarded(async () => {
        const result = await client.getAnalysis(args.annotation_id);
        const sanitized = sanitizeRecord(result as unknown as Record<string, unknown>);
        return jsonOut(sanitized, sanitized);
      }),
  );

  server.registerTool(
    'get_annotation_screenshots',
    {
      title: 'Get screenshots',
      description:
        'Return the region screenshots attached to an annotation as viewable images, so you ' +
        'can see exactly what the reporter pointed at.',
      inputSchema: { annotation_id: z.string() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      outputSchema: z.object({ count: oNum, screenshots: z.array(zScreenshotMeta) }).passthrough(),
    },
    (args) =>
      guarded(async () => {
        const shots = await client.getScreenshots(args.annotation_id);
        const result = screenshotContent(shots);
        result.structuredContent = {
          count: shots.length,
          screenshots: shots.map((shot) => ({
            id: shot.id,
            annotation_id: shot.annotation_id,
            mime: shot.mime,
            width: shot.width,
            height: shot.height,
            byte_size: shot.byte_size,
            created_at: shot.created_at,
          })),
        };
        return result;
      }),
  );

  server.registerTool(
    'list_annotation_issues',
    {
      title: 'List annotation issues',
      description:
        'List the tracker (GitHub) issues opened from an annotation, with each issue\u2019s live ' +
        'state. Set refresh to reconcile against GitHub (open/closed + any linked pull request).',
      inputSchema: {
        annotation_id: z.string(),
        refresh: z.boolean().optional().describe('Reconcile live state from GitHub. Optional.'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      outputSchema: z.object({ issues: z.array(zIssue) }).passthrough(),
    },
    (args) =>
      guarded(async () => {
        const result = await client.listAnnotationIssues(args.annotation_id, args.refresh ?? false);
        const sanitized = {
          issues: result.issues.map((issue) =>
            toPublicIssue(issue as unknown as Record<string, unknown>),
          ),
        };
        return jsonOut(sanitized, sanitized);
      }),
  );

  server.registerTool(
    'list_project_issues',
    {
      title: 'List project issues',
      description: 'List every tracker issue across a project, with an open/closed/agent summary.',
      inputSchema: { project_id: z.string() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      outputSchema: z
        .object({
          summary: z.object({ total: oNum, open: oNum, closed: oNum, agent: oNum }).passthrough(),
          issues: z.array(zIssue),
        })
        .passthrough(),
    },
    (args) =>
      guarded(async () => {
        const result = await client.listProjectIssues(args.project_id);
        const sanitized = {
          summary: sanitizeRecord(result.summary as unknown as Record<string, unknown>),
          issues: result.issues.map((issue) =>
            toPublicIssue(issue as unknown as Record<string, unknown>),
          ),
        };
        return jsonOut(sanitized, sanitized);
      }),
  );

  server.registerTool(
    'generate_prompt',
    {
      title: 'Generate coding prompt',
      description:
        'Render a ready-to-paste coding prompt for an annotation, formatted for a target ' +
        'assistant. A deterministic template (no AI spend); for a deeper analysis use diagnose_annotation.',
      inputSchema: {
        annotation_id: z.string().describe('The id of the annotation to turn into a prompt.'),
        target: z
          .enum(TARGET_VALUES)
          .optional()
          .describe('Which assistant to format for. Defaults to generic.'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      outputSchema: z.object({ target: oStr, prompt: oStr }).passthrough(),
    },
    (args) =>
      guarded(async () => {
        const result = await client.generatePrompt(args.annotation_id, args.target ?? 'generic');
        return {
          content: [{ type: 'text', text: result.prompt }],
          structuredContent: { target: result.target, prompt: result.prompt },
        };
      }),
  );

  server.registerTool(
    'get_metrics',
    {
      title: 'Get metrics',
      description:
        'Overview of your projects: KPI counts, status breakdown, a daily time series, and recent activity.',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      outputSchema: z
        .object({ kpis: oAny, status_breakdown: oArr, timeseries: oArr, recent_activity: oArr })
        .passthrough(),
    },
    () =>
      guarded(async () => {
        const overview = await client.getOverview();
        const sanitized = {
          kpis: sanitizeValue(overview.kpis),
          status_breakdown: sanitizeValue(overview.status_breakdown),
          timeseries: sanitizeValue(overview.timeseries),
          recent_activity: overview.recent_activity.map((item) =>
            toPublicActivity(item as unknown as Record<string, unknown>),
          ),
        };
        return jsonOut(sanitized, sanitized as Record<string, unknown>);
      }),
  );

  server.registerTool(
    'list_members',
    {
      title: 'List members',
      description: 'List a project\u2019s team members, including role and status.',
      inputSchema: { project_id: z.string() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      outputSchema: z
        .object({ owner: zMember.nullable().optional(), members: z.array(zMember) })
        .passthrough(),
    },
    (args) =>
      guarded(async () => {
        const result = await client.listMembers(args.project_id);
        const sanitized = {
          owner: null,
          members: result.map((member) =>
            toPublicMember(member as unknown as Record<string, unknown>),
          ),
        };
        return jsonOut(sanitized, sanitized);
      }),
  );

  server.registerTool(
    'get_activity',
    {
      title: 'Get activity',
      description: 'Recent activity feed for a project (status changes, comments, issues, members).',
      inputSchema: { project_id: z.string() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      outputSchema: z.object({ activity: z.array(zActivity) }).passthrough(),
    },
    (args) =>
      guarded(async () => {
        const activity = (await client.listActivity(args.project_id)).map((item) =>
          toPublicActivity(item as unknown as Record<string, unknown>),
        );
        return jsonOut(activity, { activity });
      }),
  );

  // --- Write tools ----------------------------------------------------------
  // These mutate state; the hints tell clients to confirm before running.

  server.registerTool(
    'update_annotation_status',
    {
      title: 'Update status',
      description: 'Update an annotation\u2019s status, e.g. to mark it in_progress or completed.',
      inputSchema: { annotation_id: z.string(), status: z.enum(STATUS_VALUES) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      outputSchema: zAnnotation,
    },
    (args) =>
      guarded(async () => {
        const annotation = await client.updateStatus(args.annotation_id, args.status);
        const sanitized = toPublicAnnotation(annotation as unknown as Record<string, unknown>);
        return jsonOut(sanitized, sanitized);
      }),
  );

  server.registerTool(
    'add_comment',
    {
      title: 'Add comment',
      description:
        'Add a comment to an annotation\u2019s thread, e.g. to record what you changed. Notifies the team.',
      inputSchema: {
        annotation_id: z.string(),
        body: z.string().min(1).describe('The comment text.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      outputSchema: zComment,
    },
    (args) =>
      guarded(async () => {
        const comment = await client.addComment(args.annotation_id, args.body);
        const sanitized = toPublicComment(comment as unknown as Record<string, unknown>);
        return jsonOut(sanitized, sanitized);
      }),
  );

  server.registerTool(
    'diagnose_annotation',
    {
      title: 'Run AI diagnosis',
      description:
        'Run the AI Diagnosis Engine on an annotation: it analyses the captured page, element, ' +
        'DOM, and runtime errors to produce ranked root causes, a confidence score, a suggested ' +
        'fix, and the likely source files. Calls an AI provider (uses tokens / may cost money) and ' +
        'stores the result. Requires AI + diagnosis enabled by the workspace admin and a key set.',
      inputSchema: {
        annotation_id: z.string(),
        provider: z
          .enum(PROVIDER_VALUES)
          .optional()
          .describe('Override the AI provider. Defaults to the workspace default.'),
        model: z.string().optional().describe('Override the model. Optional.'),
      },
      // Not read-only (writes an analysis), not idempotent (re-runs cost tokens), and
      // open-world (reaches an external AI provider) so clients confirm before each run.
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      outputSchema: zAiAnalysis,
    },
    (args) =>
      guarded(async () => {
        const analysis = await client.diagnoseAnnotation(args.annotation_id, {
          provider: args.provider,
          model: args.model,
        });
        const sanitized = sanitizeRecord(analysis as unknown as Record<string, unknown>);
        return jsonOut(sanitized, sanitized);
      }),
  );

  server.registerTool(
    'create_github_issue',
    {
      title: 'Create GitHub issue',
      description:
        'Create a GitHub issue from an annotation. Uses the project\u2019s configured repo and ' +
        'assignee unless overridden. Embeds the generated AI prompt in the issue body.',
      inputSchema: {
        annotation_id: z.string().describe('The id of the annotation to file as an issue.'),
        repo: z.string().optional().describe('owner/repository to file the issue in. Optional.'),
        assignees: z.array(z.string()).optional().describe('GitHub usernames to assign. Optional.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      outputSchema: zIssueLink,
    },
    (args) =>
      guarded(async () => {
        const issue = await client.createIssue(args.annotation_id, {
          repo: args.repo,
          assignees: args.assignees,
        });
        const sanitized = toPublicIssueLink(issue as unknown as Record<string, unknown>);
        return jsonOut(sanitized, sanitized);
      }),
  );

  server.registerTool(
    'create_share_link',
    {
      title: 'Create share link',
      description:
        'Mint a read-only public review link for a project, so a stakeholder can review its ' +
        'annotations without an account. Reporter emails are hidden on shared views.',
      inputSchema: {
        project_id: z.string(),
        expires_in_days: z
          .number()
          .int()
          .min(0)
          .max(365)
          .optional()
          .describe('Days until the link expires. 0 or omitted means it never expires.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      outputSchema: zShareLink,
    },
    (args) =>
      guarded(async () => {
        const link = await client.createShareLink(args.project_id, args.expires_in_days);
        const sanitized = toPublicShareLink(link as unknown as Record<string, unknown>);
        return jsonOut(sanitized, sanitized);
      }),
  );

  // --- Prompt: a guided end-to-end fix loop ---------------------------------

  server.registerPrompt(
    'fix_annotation',
    {
      title: 'Fix a Vynix annotation',
      description:
        'A guided workflow to take one annotation from report to fix using the captured context ' +
        'and the AI diagnosis.',
      argsSchema: { annotation_id: z.string().describe('The annotation to fix.') },
    },
    (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Fix the Vynix annotation ${args.annotation_id}. Work through these steps:\n` +
              `1. Call get_annotation to read the full captured context (page, element, DOM, diagnostics).\n` +
              `2. Call get_annotation_screenshots to see what the reporter pointed at.\n` +
              `3. Call get_annotation_analysis for an existing AI diagnosis; if none, call ` +
              `diagnose_annotation to generate root causes, a suggested fix, and the likely files.\n` +
              `4. Make the minimal code change in the indicated files.\n` +
              `5. Call update_annotation_status to "in_progress" while working and "completed" when done.\n` +
              `6. Call add_comment to record what you changed.\n` +
              `Be precise and only touch the relevant component.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'critical_issues',
    {
      title: 'Find critical issues',
      description: 'Identify and rank critical or high-priority open issues for a project.',
      argsSchema: { project_id: z.string() },
    },
    (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Find critical issues for project ${args.project_id}.\n` +
              '1. Call list_annotations with status=open and priority=critical.\n' +
              '2. Call list_annotations with status=open and priority=high.\n' +
              '3. Rank results by user impact, reproduction clarity, and release risk.\n' +
              '4. Return a concise action plan with immediate next steps.',
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'summarize_feedback',
    {
      title: 'Summarize feedback',
      description: 'Generate a stakeholder-friendly summary of open feedback for a project.',
      argsSchema: { project_id: z.string() },
    },
    (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Summarize feedback for project ${args.project_id}.\n` +
              '1. Call list_annotations with status=open (paginate when needed).\n' +
              '2. Group findings by type and priority.\n' +
              '3. Highlight recurring themes and impacted pages.\n' +
              '4. Return an executive summary plus a technical appendix.',
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'jira_ready_tasks',
    {
      title: 'Create Jira-ready tasks',
      description: 'Convert selected open annotations into engineering-ready implementation tasks.',
      argsSchema: { project_id: z.string(), limit: z.number().int().min(1).max(50).optional() },
    },
    (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Create Jira-ready tasks for project ${args.project_id} (limit ${args.limit ?? 10}).\n` +
              '1. Call list_annotations with status=open and limit from args.\n' +
              '2. For each item, call get_annotation and get_annotation_analysis when available.\n' +
              '3. Produce tasks with title, problem statement, acceptance criteria, and test notes.\n' +
              '4. Keep scope minimal and implementation-focused.',
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'release_notes',
    {
      title: 'Prepare release notes',
      description: 'Build release notes from completed annotations and linked tracker issues.',
      argsSchema: { project_id: z.string() },
    },
    (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Prepare release notes for project ${args.project_id}.\n` +
              '1. Call list_annotations with status=completed.\n' +
              '2. Call list_project_issues to map issue links and states.\n' +
              '3. Summarize changes by category: bug fixes, UX, accessibility, performance.\n' +
              '4. Include residual known issues still open.',
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'group_by_severity',
    {
      title: 'Group issues by severity',
      description: 'Create a severity matrix from open annotations in a project.',
      argsSchema: { project_id: z.string() },
    },
    (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Group open annotations by severity for project ${args.project_id}.\n` +
              '1. Call list_annotations with status=open.\n' +
              '2. Group by priority and by type.\n' +
              '3. Provide counts, top examples, and recommended response SLA per group.',
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'review_homepage',
    {
      title: 'Review homepage feedback',
      description: 'Analyze homepage-related annotations and recommend a fix sequence.',
      argsSchema: { project_id: z.string(), homepage_url: z.string().optional() },
    },
    (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Review homepage feedback for project ${args.project_id}.\n` +
              `Homepage URL hint: ${args.homepage_url ?? 'not provided'}\n` +
              '1. Call list_annotations with status=open.\n' +
              '2. Keep only items where page_url matches the homepage hint or root page.\n' +
              '3. Inspect screenshots and diagnostics for top-impact items.\n' +
              '4. Return prioritized fixes with expected UX impact.',
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'qa_report',
    {
      title: 'Generate QA report',
      description: 'Generate a QA report from open, review, and completed annotations.',
      argsSchema: { project_id: z.string() },
    },
    (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Generate a QA report for project ${args.project_id}.\n` +
              '1. Call list_annotations for status=open, review, and completed.\n' +
              '2. Summarize pass/fail trends and unresolved risk areas.\n' +
              '3. Include regression hotspots and confidence for release.',
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'accessibility_review',
    {
      title: 'Accessibility review summary',
      description: 'Summarize accessibility findings and next actions for compliance readiness.',
      argsSchema: { project_id: z.string() },
    },
    (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Run an accessibility-focused review for project ${args.project_id}.\n` +
              '1. Call list_annotations with type=accessibility for all statuses.\n' +
              '2. Highlight open defects by severity and affected UI areas.\n' +
              '3. Propose fixes aligned to WCAG language where possible.',
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'client_comments_summary',
    {
      title: 'Summarize client comments',
      description: 'Summarize annotation comment threads into decisions and unresolved questions.',
      argsSchema: { annotation_id: z.string() },
    },
    (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Summarize client comments for annotation ${args.annotation_id}.\n` +
              '1. Call get_annotation and list_comments.\n' +
              '2. Extract explicit requests, decisions, and unresolved questions.\n' +
              '3. Return a concise decision log and next action list.',
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'release_blockers',
    {
      title: 'List release blockers',
      description: 'Identify unresolved issues likely to block release for a project.',
      argsSchema: { project_id: z.string() },
    },
    (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `List release blockers for project ${args.project_id}.\n` +
              '1. Call list_annotations with status=open and status=review.\n' +
              '2. Prioritize critical/high items and unresolved tracker issues.\n' +
              '3. Return blocker, impact, owner suggestion, and exit criteria for each.',
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'sprint_report',
    {
      title: 'Generate sprint report',
      description: 'Create a sprint status summary using annotation and issue activity.',
      argsSchema: { project_id: z.string() },
    },
    (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Generate a sprint report for project ${args.project_id}.\n` +
              '1. Call get_activity, list_project_issues, and list_annotations.\n' +
              '2. Summarize completed work, carry-over, and newly discovered issues.\n' +
              '3. Provide a short narrative for engineering and product stakeholders.',
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'engineering_tasks',
    {
      title: 'Generate engineering tasks',
      description: 'Generate implementation tasks with acceptance criteria and risk notes.',
      argsSchema: { project_id: z.string(), priority: z.enum(PRIORITY_VALUES).optional() },
    },
    (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Generate engineering tasks for project ${args.project_id}.\n` +
              `Priority filter: ${args.priority ?? 'all'}\n` +
              '1. Call list_annotations with status=open and optional priority.\n' +
              '2. Convert each annotation into an actionable task card.\n' +
              '3. Include implementation hints from AI analysis when present.',
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'regression_summary',
    {
      title: 'Regression summary',
      description: 'Summarize likely regressions and recently re-opened defects.',
      argsSchema: { project_id: z.string() },
    },
    (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Generate a regression summary for project ${args.project_id}.\n` +
              '1. Call get_activity and list_annotations with status=open/review.\n' +
              '2. Identify repeated issue themes or re-open patterns.\n' +
              '3. Recommend targeted regression tests.',
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'pm_briefing',
    {
      title: 'Product manager briefing',
      description: 'Create a PM-ready briefing on risk, progress, and decision points.',
      argsSchema: { project_id: z.string() },
    },
    (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Prepare a product manager briefing for project ${args.project_id}.\n` +
              '1. Call get_metrics, list_annotations (open/review/completed), and list_project_issues.\n' +
              '2. Summarize health, blockers, trend direction, and top decisions needed.\n' +
              '3. Keep output concise and stakeholder-friendly.',
          },
        },
      ],
    }),
  );

  return server;
}

async function main(): Promise<void> {
  const config = loadConfig();
  // Fail fast with an actionable message instead of erroring on the first tool call.
  assertConfigured(config);

  const mode = (process.env.VYNIX_MCP_MODE || 'stdio').toLowerCase();

  if (mode === 'http' || mode === 'streamable-http') {
    const host = process.env.VYNIX_MCP_HOST || '127.0.0.1';
    const port = Number(process.env.VYNIX_MCP_PORT || '8787');
    const path = process.env.VYNIX_MCP_PATH || '/mcp';

    const app = express();
    app.use(express.json({ limit: '2mb' }));

    // Stateless: build a fresh server + transport for every request so concurrent callers
    // never share a session, and bind each request to its own bearer-scoped client so one
    // caller's token can never leak into another caller's tool calls.
    app.post(path, async (req, res) => {
      const bearer = parseBearer(req.headers.authorization);
      const client = new VynixClient({ ...config, token: bearer ?? config.token });
      const server = createServer(client);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

      res.on('close', () => {
        void transport.close();
        void server.close();
      });

      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error.' },
            id: null,
          });
        }
      }
    });

    // Stateless mode has no long-lived SSE stream or resumable session, so GET/DELETE on the
    // MCP endpoint are not supported. Return the JSON-RPC "method not allowed" shape.
    const methodNotAllowed = (_req: express.Request, res: express.Response): void => {
      res.status(405).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed. Use POST for JSON-RPC requests.' },
        id: null,
      });
    };
    app.get(path, methodNotAllowed);
    app.delete(path, methodNotAllowed);

    app.get('/health', (_req, res) => {
      res.status(200).json({ ok: true, mode: 'http', version: readVersion() });
    });

    app.listen(port, host, () => {
      console.error(`Vynix MCP server v${readVersion()} is running on http://${host}:${port}${path}`);
    });
    return;
  }

  const client = new VynixClient(config);
  const server = createServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Diagnostics must go to stderr; stdout is reserved for the MCP protocol.
  console.error(`Vynix MCP server v${readVersion()} is running on stdio.`);
}

main().catch((error) => {
  console.error('Fatal error starting the Vynix MCP server:', error);
  process.exit(1);
});
