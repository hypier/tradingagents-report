import { Link, useParams } from 'react-router-dom';

import { AppShell } from '@/frontend/components/app-shell';
import { Button } from '@/frontend/components/ui/button';

const documents = {
  'risk-disclaimer': {
    title: 'Risk disclaimer',
    paragraphs: [
      'TradingAgents produces automated research material for informational purposes. It does not provide investment advice, personalized recommendations, brokerage services, or trade execution.',
      'Market data, news, model output, estimates, and generated conclusions may be delayed, incomplete, or incorrect. Historical performance and simulated analysis do not guarantee future results.',
      'You remain solely responsible for evaluating any security, digital asset, or market decision and for obtaining independent professional advice where appropriate.',
    ],
  },
  terms: {
    title: 'Terms of service',
    paragraphs: [
      'You may use the service only for lawful research purposes and must not attempt to bypass access controls, quotas, provider terms, or security safeguards.',
      'Subscriptions renew according to the billing cycle shown at checkout until canceled. Plan changes, cancellation, payment methods, invoices, and billing history are managed through Stripe Customer Portal.',
      'Analysis credits are issued for the applicable billing period. A credit is reserved when a job is submitted, consumed when it succeeds, and released when it fails. Service availability is not guaranteed.',
    ],
  },
  privacy: {
    title: 'Privacy policy',
    paragraphs: [
      'Clerk processes authentication credentials and sessions. TradingAgents stores the Clerk user identifier, profile snapshot, product preferences, legal consent records, subscription association, and credit ledger. It does not store passwords or Clerk session credentials.',
      'Stripe processes payment methods and billing details. TradingAgents stores Stripe customer, subscription, invoice references, and signed webhook audit records, but does not store full card details.',
      'Operational data may include analysis requests, generated reports, usage, costs, timestamps, IP address and user agent captured with legal consent. Access is limited to providing, securing, and auditing the service.',
    ],
  },
} as const;

export function LegalPage({ publicView = false }: { publicView?: boolean }) {
  const { document = 'terms' } = useParams();
  const content =
    documents[document as keyof typeof documents] ?? documents.terms;
  const body = (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Effective July 18, 2026</p>
        <h1 className="text-2xl font-semibold">{content.title}</h1>
      </header>
      <div className="flex flex-col gap-4 text-sm leading-6">
        {content.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <Button asChild variant="outline" className="self-start">
        <Link to={publicView ? '/' : '/account'}>Back</Link>
      </Button>
    </main>
  );
  return publicView ? body : <AppShell title={content.title}>{body}</AppShell>;
}
