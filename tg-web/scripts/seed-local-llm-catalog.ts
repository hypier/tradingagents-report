/**
 * One-off local seed: openai_compatible provider + quick/deep models from .env.
 * Usage (from tg-web): pnpm exec tsx scripts/seed-local-llm-catalog.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createNodeDatabase } from '../src/backend/database/client';
import { createLlmProviderSecrets } from '../src/backend/llm/provider-secrets';
import { syncModelFromUpstream } from '../src/backend/llm/model-sync';

function loadEnvFile(path: string) {
  try {
    const text = readFileSync(path, 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env) || !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // optional file
  }
}

loadEnvFile(resolve(process.cwd(), '.env'));
loadEnvFile(resolve(process.cwd(), '../tg-core/.env'));

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const masterKey = process.env.BILLING_CONFIG_ENCRYPTION_KEY;
  const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY;
  const backendUrl =
    process.env.TRADINGAGENTS_LLM_BACKEND_URL || 'https://www.nbapi.xyz/v1';
  const deepModel = process.env.TRADINGAGENTS_DEEP_THINK_LLM || 'gpt-5.6-sol';
  const quickModel = process.env.TRADINGAGENTS_QUICK_THINK_LLM || 'gpt-5.5';

  if (!databaseUrl) throw new Error('DATABASE_URL missing');
  if (!masterKey) throw new Error('BILLING_CONFIG_ENCRYPTION_KEY missing');
  if (!apiKey) throw new Error('OPENAI_COMPATIBLE_API_KEY missing');

  const db = createNodeDatabase(databaseUrl);
  const secrets = createLlmProviderSecrets(masterKey);
  const encrypted = await secrets.encrypt(apiKey);

  await db.llmCatalog.upsertProvider({
    id: 'openai_compatible',
    displayName: 'NBAPI (OpenAI Compatible)',
    enabled: true,
    backendUrl,
    updateApiKey: true,
    apiKeyCiphertext: encrypted.ciphertext,
    apiKeyHint: encrypted.hint,
    sortOrder: 0,
    notes: 'Seeded from local .env TRADINGAGENTS_* settings',
  });

  async function upsertModel(
    model: string,
    role: 'quick' | 'deep' | 'both',
    displayName: string,
  ) {
    const existing = (
      await db.llmCatalog.listModels({ providerId: 'openai_compatible' })
    ).find((row) => row.model === model);
    const sync = await syncModelFromUpstream({
      providerId: 'openai_compatible',
      model,
      apiKey,
      backendUrl,
    });
    const fields = sync.ok ? sync.fields : {};
    if (!sync.ok) {
      console.log(`sync skipped/failed for ${model}: ${sync.error}`);
    }
    if (existing) {
      return db.llmCatalog.updateModel(existing.id, {
        displayName: fields.displayName || displayName,
        role,
        enabled: true,
        inputPrice: fields.inputPrice ?? existing.inputPrice,
        outputPrice: fields.outputPrice ?? existing.outputPrice,
        cachedInputPrice: fields.cachedInputPrice ?? existing.cachedInputPrice,
        cacheWritePrice: fields.cacheWritePrice ?? existing.cacheWritePrice,
        contextWindow: fields.contextWindow ?? existing.contextWindow,
        maxOutputTokens: fields.maxOutputTokens ?? existing.maxOutputTokens,
        params: fields.params ?? existing.params,
        capabilities: fields.capabilities ?? existing.capabilities,
        syncedAt: sync.ok ? new Date() : existing.syncedAt,
        syncError: sync.ok ? null : sync.error,
      });
    }
    return db.llmCatalog.createModel({
      providerId: 'openai_compatible',
      model,
      displayName: fields.displayName || displayName,
      role,
      enabled: true,
      inputPrice: fields.inputPrice ?? null,
      outputPrice: fields.outputPrice ?? null,
      cachedInputPrice: fields.cachedInputPrice ?? null,
      cacheWritePrice: fields.cacheWritePrice ?? null,
      contextWindow: fields.contextWindow ?? null,
      maxOutputTokens: fields.maxOutputTokens ?? null,
      params: fields.params ?? {},
      capabilities: fields.capabilities ?? {},
      syncedAt: sync.ok ? new Date() : null,
      syncError: sync.ok ? null : sync.error,
    });
  }

  const quick = await upsertModel(quickModel, 'quick', quickModel);
  const deep = await upsertModel(deepModel, 'deep', deepModel);
  if (!quick || !deep) throw new Error('failed to upsert models');

  await db.settings.set(
    'llm',
    {
      defaultQuickModelId: quick.id,
      defaultDeepModelId: deep.id,
    },
    'local-setup',
  );

  console.log(
    JSON.stringify(
      {
        provider: 'openai_compatible',
        backendUrl,
        apiKeyHint: encrypted.hint,
        quick: {
          id: quick.id,
          model: quick.model,
          enabled: quick.enabled,
          inputPrice: quick.inputPrice,
          outputPrice: quick.outputPrice,
        },
        deep: {
          id: deep.id,
          model: deep.model,
          enabled: deep.enabled,
          inputPrice: deep.inputPrice,
          outputPrice: deep.outputPrice,
        },
        defaults: { quick: quick.id, deep: deep.id },
      },
      null,
      2,
    ),
  );

  await db.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
