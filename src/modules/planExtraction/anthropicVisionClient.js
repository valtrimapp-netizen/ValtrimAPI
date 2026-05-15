import { env } from '../../config/env.js';
import { buildTileSystemPrompt, buildTileUserPrompt } from './promptBuilder.js';
import { normalizeVisionItems, parseJsonArrayResponse } from './detectionNormalizer.js';

const modelFallbacks = ['claude-3-5-sonnet-20241022', 'claude-3-5-sonnet-20240620', 'claude-opus-4-5'];

export async function extractItemsFromVisionTask(task, options = {}) {
  const {
    apiKey = env.anthropicApiKey,
    model = env.anthropicModel,
    catalogItems = [],
    enforceCatalogExact = false,
  } = options;

  const system = buildTileSystemPrompt({
    catalogItems,
    calibrationMode: Boolean(task.calibrationMode),
    focusCategories: task.focusCategories || [],
    extractionMode: task.extractionMode || 'element',
  });

  const userPrompt = buildTileUserPrompt(task.tile || task);
  const models = unique([model, ...modelFallbacks].filter(Boolean));
  let selectedModel = models[0];
  let lastError;

  for (const candidate of models) {
    try {
      const message = await createAnthropicMessage({
        apiKey,
        model: candidate,
        maxTokens: 4096,
        system,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: task.mediaType || 'image/png',
                  data: task.imageBase64,
                },
              },
              { type: 'text', text: userPrompt },
            ],
          },
        ],
      });
      selectedModel = candidate;
      return normalizeVisionResponse(message, {
        apiKey,
        model: selectedModel,
        catalogItems,
        enforceCatalogExact,
        extractionMode: task.extractionMode || 'element',
      });
    } catch (error) {
      lastError = error;
      if (!isMissingModelError(error)) break;
    }
  }

  throw lastError || new Error('Unable to resolve a valid Anthropic model for tile extraction');
}

async function normalizeVisionResponse(message, options) {
  const rawText = String(message?.content?.[0]?.text || '').trim();
  try {
    const parsed = parseJsonArrayResponse(rawText);
    return normalizeVisionItems(parsed, options);
  } catch {
    const repaired = await createAnthropicMessage({
      apiKey: options.apiKey,
      model: options.model,
      maxTokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Convert the following content into a strict valid JSON array only. Do not add commentary. Keep the same item meaning and quantities.\n\n${rawText}`,
            },
          ],
        },
      ],
    });
    const parsed = parseJsonArrayResponse(String(repaired?.content?.[0]?.text || '').trim());
    return normalizeVisionItems(parsed, options);
  }
}

async function createAnthropicMessage({ apiKey, model, maxTokens, system, messages }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || `Anthropic request failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function isMissingModelError(error) {
  return error?.status === 404 || /model/i.test(String(error?.message || ''));
}

function unique(values) {
  return [...new Set(values)];
}
