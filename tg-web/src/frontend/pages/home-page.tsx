import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, FileText, Search, Settings, Sparkles } from 'lucide-react';

import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Progress } from '../components/ui/progress';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import { createResearch, getMarketSnapshot, listResearch } from '../lib/research';

type Job = Record<string, unknown>;

export function HomePage() {
  const [ticker, setTicker] = useState('');
  const queryClient = useQueryClient();
  const jobs = useQuery({ queryKey: ['analyses'], queryFn: () => listResearch(), refetchInterval: (query) => query.state.data?.data.some((job) => job.status === 'queued' || job.status === 'running') ? 5_000 : false });
  const snapshot = useQuery({ queryKey: ['snapshot', ticker], queryFn: () => getMarketSnapshot(ticker), enabled: Boolean(ticker) });
  const create = useMutation({ mutationFn: (input: Parameters<typeof createResearch>[0]) => createResearch(input), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['analyses'] }) });
  const active = jobs.data?.data.find((job) => job.status === 'queued' || job.status === 'running');
  const rows = jobs.data?.data ?? [];
  const quote = snapshot.data?.data;

  return <main className="min-h-screen bg-background text-foreground"><aside className="fixed inset-y-0 hidden w-60 border-r bg-card p-5 lg:block"><div className="flex items-center gap-2 font-semibold"><Sparkles /> TradingAgents</div><nav className="mt-10 flex flex-col gap-1"><Button variant="secondary" className="justify-start"><Activity data-icon="inline-start" />Research</Button><Button variant="ghost" className="justify-start"><FileText data-icon="inline-start" />Reports</Button><Button variant="ghost" className="justify-start"><Settings data-icon="inline-start" />Settings</Button></nav></aside><section className="mx-auto max-w-7xl p-5 lg:ml-60 lg:p-8"><header className="mb-8 flex justify-between"><div><p className="text-sm text-muted-foreground">TradingAgents workspace</p><h1 className="text-2xl font-semibold">Research command</h1></div><Button variant="outline" size="icon" aria-label="Search"><Search /></Button></header><Card><CardHeader><CardTitle>Start a new research run</CardTitle><CardDescription>Configure a focused, multi-agent research process.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4 md:flex-row"><Input aria-label="Ticker" value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} placeholder="AAPL"/><ToggleGroup type="multiple" defaultValue={['market','fundamentals','news','social']}><ToggleGroupItem value="market">Market</ToggleGroupItem><ToggleGroupItem value="fundamentals">Fundamentals</ToggleGroupItem><ToggleGroupItem value="news">News</ToggleGroupItem><ToggleGroupItem value="social">Sentiment</ToggleGroupItem></ToggleGroup><Button disabled={!ticker || create.isPending} onClick={() => create.mutate({ ticker, tradeDate: new Date().toISOString().slice(0, 10), analysts: ['market', 'fundamentals', 'news', 'social'] })}><Activity data-icon="inline-start" />Run research</Button></CardContent></Card><div className="mt-6 grid gap-6 xl:grid-cols-[1fr_320px]"><Card><CardHeader><CardTitle>Sequential research pipeline</CardTitle><CardDescription>{active ? String(active.current_step ?? 'Queued') : 'No active research run.'}</CardDescription></CardHeader><CardContent>{active ? <><Progress value={Number(active.progress_percent ?? 0)} /><p className="mt-4 text-sm text-muted-foreground">{String(active.ticker)} is {String(active.status)}.</p></> : null}</CardContent></Card><Card><CardHeader><CardTitle>Live market snapshot</CardTitle><CardDescription>Data source: {quote ? String(quote.source) : 'TradingView'}</CardDescription></CardHeader><CardContent>{snapshot.isLoading ? 'Loading market snapshot...' : quote ? <><div className="text-3xl font-semibold">{String(quote.ticker)} {String(quote.last_price)}</div><Badge className="mt-2" variant="secondary">{Number(quote.change_percent).toFixed(2)}%</Badge></> : <p className="text-sm text-muted-foreground">Enter a ticker to load the latest verified snapshot.</p>}</CardContent></Card></div><Card className="mt-6"><CardHeader><CardTitle>Recent research</CardTitle></CardHeader><CardContent>{jobs.isLoading ? 'Loading research history...' : jobs.isError ? 'Research history is unavailable.' : <table className="w-full text-left text-sm"><thead><tr><th>Ticker</th><th>Status</th><th>Conclusion</th><th>Cost</th></tr></thead><tbody>{rows.map((job: Job) => <tr key={String(job.id)} className="border-t"><td className="py-3">{String(job.ticker)}</td><td><Badge variant="outline">{String(job.status)}</Badge></td><td>{String(job.decision ?? '—')}</td><td>{String(job.cost_usd ?? '—')}</td></tr>)}</tbody></table>}</CardContent></Card></section></main>;
}
