import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';

import type { AppDependencies } from '../app';

export const REFERRAL_COOKIE = 'tradingagents_referral';

const referralCodePattern = /^[a-f0-9]{32}$/;

export function referralRoutes(dependencies: AppDependencies) {
  const app = new Hono();

  app.get('/invite/:code', async (context) => {
    const code = context.req.param('code');
    const valid =
      referralCodePattern.test(code) &&
      (await dependencies.database.referrals.isValidCode(code));
    if (!valid) return context.redirect('/sign-up?invite=invalid');

    setCookie(context, REFERRAL_COOKIE, code, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
      sameSite: 'Lax',
      secure: new URL(context.req.url).protocol === 'https:',
    });
    return context.redirect('/sign-up');
  });

  return app;
}
