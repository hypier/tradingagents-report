import { Hono } from 'hono';
import { z } from 'zod';

import { apiSuccess } from '../../shared/contracts';
import type { AppDependencies, AppEnvironment } from '../app';
import { AppError } from '../errors/app-error';
import type { AnalysisJob } from '../database/repositories';
import type { RequestIdEnvironment } from '../logging/request-id';

const createShareSchema = z.object({
  expiresInDays: z.number().int().min(1).max(90).default(7),
  maxViews: z.number().int().min(1).max(10_000).nullable().optional(),
});

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

/** 无鉴权公开分享读取。 */
export function publicShareRoutes(dependencies: AppDependencies) {
  const app = new Hono<RequestIdEnvironment>();

  app.get('/shared/:token', async (context) => {
    const token = context.req.param('token');
    const link = await dependencies.database.shareLinks.consumeView(token);
    if (!link) {
      throw new AppError(
        'SHARE_UNAVAILABLE',
        404,
        'This share link is invalid, expired, or revoked',
      );
    }
    const job = await dependencies.database.analysisJobs.getById(
      link.analysisJobId,
    );
    if (!job || job.status !== 'succeeded') {
      throw new AppError(
        'SHARE_UNAVAILABLE',
        404,
        'This shared report is no longer available',
      );
    }
    let detail: Record<string, unknown> = {};
    try {
      const data = await dependencies.core.getAnalysis(link.analysisJobId);
      if (isRecord(data)) detail = data;
    } catch {
      detail = {};
    }
    return context.json(
      apiSuccess(
        toSharedReport(job, detail, link.expiresAt),
        context.get('requestId'),
      ),
    );
  });

  return app;
}

/** 登录用户对自己报告的分享 CRUD（挂在已鉴权的 analyses 路由下）。 */
export function analysisShareRoutes(dependencies: AppDependencies) {
  const app = new Hono<AppEnvironment>();

  app.get('/analyses/:id/share', async (context) => {
    const analysisJobId = context.req.param('id');
    const clerkUserId = context.get('auth').userId;
    await requireOwned(dependencies, clerkUserId, analysisJobId);
    const links = await dependencies.database.shareLinks.listForJob({
      analysisJobId,
      clerkUserId,
    });
    return context.json(
      apiSuccess(
        links.map((link) => toShareLinkPublic(link)),
        context.get('requestId'),
      ),
    );
  });

  app.post('/analyses/:id/share', async (context) => {
    const features = await dependencies.database.settings.get('features');
    if (features && features.shareLinks === false) {
      throw new AppError(
        'FEATURE_DISABLED',
        403,
        'Report sharing is currently disabled',
      );
    }
    const analysisJobId = context.req.param('id');
    const clerkUserId = context.get('auth').userId;
    await requireOwned(dependencies, clerkUserId, analysisJobId);
    const job = await dependencies.database.analysisJobs.getById(analysisJobId);
    if (!job || job.status !== 'succeeded') {
      throw new AppError(
        'SHARE_NOT_ALLOWED',
        409,
        'Only succeeded reports can be shared',
      );
    }
    const input = createShareSchema.safeParse(
      await context.req.json().catch(() => ({})),
    );
    if (!input.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid share payload');
    }
    const expiresAt = new Date(
      Date.now() + input.data.expiresInDays * 24 * 60 * 60 * 1000,
    );
    const link = await dependencies.database.shareLinks.create({
      token: randomToken(),
      analysisJobId,
      clerkUserId,
      expiresAt,
      maxViews: input.data.maxViews ?? null,
    });
    await dependencies.database.audit.record({
      actorClerkUserId: clerkUserId,
      action: 'report_share.create',
      targetType: 'analysis_job',
      targetId: analysisJobId,
      metadata: { shareId: link.id, expiresAt: expiresAt.toISOString() },
    });
    return context.json(
      apiSuccess(toShareLinkPublic(link), context.get('requestId')),
      201,
    );
  });

  app.delete('/analyses/:id/share/:shareId', async (context) => {
    const analysisJobId = context.req.param('id');
    const shareId = context.req.param('shareId');
    const clerkUserId = context.get('auth').userId;
    await requireOwned(dependencies, clerkUserId, analysisJobId);
    const revoked = await dependencies.database.shareLinks.revoke({
      id: shareId,
      clerkUserId,
    });
    if (!revoked || revoked.analysisJobId !== analysisJobId) {
      throw new AppError('NOT_FOUND', 404, 'Share link not found');
    }
    await dependencies.database.audit.record({
      actorClerkUserId: clerkUserId,
      action: 'report_share.revoke',
      targetType: 'analysis_job',
      targetId: analysisJobId,
      metadata: { shareId },
    });
    return context.json(
      apiSuccess(toShareLinkPublic(revoked), context.get('requestId')),
    );
  });

  return app;
}

async function requireOwned(
  dependencies: AppDependencies,
  clerkUserId: string,
  analysisJobId: string,
) {
  const owned = await dependencies.database.analysisJobs.ownsJob(
    clerkUserId,
    analysisJobId,
  );
  if (!owned) {
    throw new AppError('NOT_FOUND', 404, 'Analysis job not found');
  }
}

function toShareLinkPublic(link: {
  id: string;
  token: string;
  analysisJobId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  maxViews: number | null;
  viewCount: number;
  createdAt: Date;
}) {
  return {
    id: link.id,
    token: link.token,
    analysisJobId: link.analysisJobId,
    expiresAt: link.expiresAt,
    revokedAt: link.revokedAt,
    maxViews: link.maxViews,
    viewCount: link.viewCount,
    createdAt: link.createdAt,
    path: `/shared/${link.token}`,
  };
}

function toSharedReport(
  job: AnalysisJob,
  detail: Record<string, unknown>,
  expiresAt: Date,
) {
  const request = isRecord(job.request) ? job.request : {};
  const config = isRecord(job.config) ? job.config : {};
  const display = isRecord(job.display)
    ? job.display
    : isRecord(detail.display)
      ? detail.display
      : {};
  const reports = isRecord(detail.reports) ? detail.reports : {};
  return {
    id: job.id,
    ticker: (detail.ticker as string | undefined) ?? job.ticker,
    exchange: (detail.exchange as string | null | undefined) ?? job.exchange,
    trade_date:
      (detail.trade_date as string | undefined) ?? job.tradeDate,
    asset_type: job.assetType,
    analysts:
      (Array.isArray(detail.analysts) ? detail.analysts : null) ?? job.analysts,
    status: job.status,
    decision: (detail.decision as string | null | undefined) ?? job.decision,
    display,
    reports,
    output_language:
      (typeof detail.output_language === 'string'
        ? detail.output_language
        : null) ||
      (typeof request.output_language === 'string'
        ? request.output_language
        : null) ||
      (typeof config.output_language === 'string'
        ? config.output_language
        : null),
    created_at: job.createdAt,
    finished_at: job.finishedAt,
    share_expires_at: expiresAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
