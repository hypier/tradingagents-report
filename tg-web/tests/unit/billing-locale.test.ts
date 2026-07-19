import { describe, expect, it, vi } from 'vitest';

import i18n from '../../src/frontend/i18n';
import {
  createBillingPortal,
  createCheckout,
} from '../../src/frontend/lib/billing';

describe('billing locale', () => {
  it('sends the active interface language to Checkout and Customer Portal', async () => {
    await i18n.changeLanguage('zh');
    const fetchImplementation = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { url: 'https://stripe.test' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await createCheckout('price_test123', fetchImplementation);
    await createBillingPortal(fetchImplementation);

    expect(requestBody(fetchImplementation.mock.calls[0]?.[1])).toMatchObject({
      priceId: 'price_test123',
      locale: 'zh',
    });
    expect(requestBody(fetchImplementation.mock.calls[1]?.[1])).toEqual({
      locale: 'zh',
    });
  });
});

function requestBody(init: RequestInit | undefined) {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}
