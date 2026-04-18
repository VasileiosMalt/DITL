const OpenAI = require('openai');

// Attempt to repair common JSON issues from LLM output
function repairJSON(text) {
  // Remove trailing commas before } or ]
  let s = text.replace(/,\s*([}\]])/g, '$1');
  // Fix unescaped newlines inside strings: scan char-by-char
  let out = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { out += c; esc = false; continue; }
    if (c === '\\') { out += c; esc = true; continue; }
    if (c === '"') { inStr = !inStr; out += c; continue; }
    if (inStr && c === '\n') { out += '\\n'; continue; }
    if (inStr && c === '\r') { out += '\\r'; continue; }
    if (inStr && c === '\t') { out += '\\t'; continue; }
    out += c;
  }
  s = out;
  // If truncated, close open brackets/braces
  let openBr = 0, openBk = 0;
  inStr = false; esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') openBr++;
    else if (c === '}') openBr--;
    else if (c === '[') openBk++;
    else if (c === ']') openBk--;
  }
  // If we're inside a string (odd quotes), close it
  if (inStr) s += '"';
  // Remove any trailing comma
  s = s.replace(/,\s*$/, '');
  for (let i = 0; i < openBr; i++) s += '}';
  for (let i = 0; i < openBk; i++) s += ']';
  return s;
}

const SYSTEM_PROMPT = `You are an expert code analyst. Your job is to find ALL tunable parameters in a codebase that a human would want to adjust for experimentation, optimization, or A/B testing.

For EACH parameter found, return a JSON object with these fields:
- "id": unique slug (e.g. "llm_temperature_main")
- "name": human-readable name
- "description": what it controls and why someone would tune it
- "file": relative file path
- "line": line number (1-based)
- "currentValue": the current value as a string (for prompts, include the FULL prompt text)
- "type": one of "number", "string", "boolean", "select", "text" (text = multiline like prompts)
- "category": one of "LLM", "ML/AI", "Algorithm", "UI/UX", "Performance", "Network", "Database", "Config", "Prompt", "Other"
- "min": (for numbers) suggested minimum
- "max": (for numbers) suggested maximum  
- "step": (for numbers) suggested step increment
- "options": (for select) array of valid options
- "searchPattern": exact string in source to find this value for replacement
- "replaceTemplate": template string where {{value}} is the placeholder for the new value
- "risk": "low" | "medium" | "high" - how risky changing this is
- "tags": array of descriptive tags

CRITICAL - PROMPTS ARE A TOP PRIORITY:
Every string that acts as an instruction to an LLM MUST be captured. This includes:
- System prompts (any string assigned to role:"system" or used as a system message)
- User prompt templates (strings used as role:"user" content, especially with placeholders)
- Few-shot examples embedded in prompt strings
- Any template literal or string variable whose content is sent to an AI/LLM API
- Prompt fragments that are concatenated or interpolated to build a final prompt
For every prompt found: set "type":"text", "category":"Prompt", and include the FULL text in "currentValue".
The searchPattern must match the exact string delimiter and content so it can be replaced in source.

Also look for:
1. LLM parameters: temperature, top_p, top_k, max_tokens, frequency_penalty, presence_penalty, seed, stop sequences
2. ML parameters: learning_rate, epochs, batch_size, n_clusters, n_estimators, max_depth, dropout, regularization
3. Algorithm params: thresholds, timeouts, retry counts, cache TTLs, pool sizes, chunk sizes
4. API config: base URLs, rate limits, concurrency limits
5. Feature flags and toggles
6. Any hardcoded magic numbers that affect behavior

Return ONLY a JSON array. No markdown, no explanation.`;

function buildClient(settings) {
  const { provider, apiKey, model, openrouterModel, ollamaUrl, ollamaModel } = settings;
  let baseURL, modelId;

  switch (provider) {
    case 'anthropic':
      baseURL = 'https://api.anthropic.com/v1/';
      modelId = model || 'claude-sonnet-4-20250514';
      break;
    case 'openrouter':
      baseURL = 'https://openrouter.ai/api/v1';
      modelId = openrouterModel || 'anthropic/claude-sonnet-4';
      break;
    case 'ollama': {
      const base = (ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '');
      baseURL = `${base}/v1`;
      modelId = ollamaModel || 'llama3';
      break;
    }
    default: // openai
      baseURL = 'https://api.openai.com/v1';
      modelId = model || 'gpt-4o-mini';
      break;
  }

  const headers = {};
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/user/ditl';
    headers['X-Title'] = 'DITL';
  }

  const client = new OpenAI({
    apiKey: provider === 'ollama' ? 'ollama' : apiKey,
    baseURL,
    defaultHeaders: headers,
  });

  return { client, modelId };
}

// Chunk files to fit context windows (~80k chars per chunk, ~20k tokens)
function chunkFiles(contents, maxChars = 80000) {
  const chunks = [];
  let current = '';
  let currentFiles = [];

  for (const [filePath, content] of Object.entries(contents)) {
    const block = `\n===== FILE: ${filePath} =====\n${content}\n`;
    if (current.length + block.length > maxChars && current.length > 0) {
      chunks.push({ text: current, files: [...currentFiles] });
      current = '';
      currentFiles = [];
    }
    current += block;
    currentFiles.push(filePath);
  }
  if (current) chunks.push({ text: current, files: currentFiles });
  return chunks;
}

async function analyzeWithAI(projectPath, scanResult, settings) {
  if (!settings.apiKey && settings.provider !== 'ollama') throw new Error('No API key configured. Go to Settings to add one.');

  const { client, modelId } = buildClient(settings);
  const contents = scanResult.contents || {};
  const maxChars = settings.provider === 'ollama' ? 24000 : 80000;
  const chunks = chunkFiles(contents, maxChars);
  const allParams = [];
  let lastError = null;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const userMsg = `Analyze these source files and find ALL tunable parameters:\n${chunk.text}`;

    // Retry loop with backoff for rate limits
    const MAX_RETRIES = 4;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        let response;
        if (settings.provider === 'anthropic') {
          const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': settings.apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: modelId,
              max_tokens: 16384,
              system: SYSTEM_PROMPT,
              messages: [{ role: 'user', content: userMsg }],
            }),
          });
          if (resp.status === 429) {
            throw Object.assign(new Error('Rate limited (429)'), { retryable: true });
          }
          const data = await resp.json();
          if (data.error) {
            const is429 = data.error.code === 429 || (data.error.message || '').includes('429');
            throw Object.assign(new Error(data.error.message), { retryable: is429 });
          }
          response = data.content?.[0]?.text || '[]';
        } else {
          try {
            const completion = await client.chat.completions.create({
              model: modelId,
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userMsg },
              ],
              max_tokens: 16384,
              temperature: 0.1,
            });
            if (!completion || !completion.choices || !completion.choices[0]) {
              throw Object.assign(new Error('Empty response from API'), { retryable: true });
            }
            response = completion.choices[0].message?.content || '[]';
          } catch (sdkErr) {
            const msg = sdkErr.message || '';
            const is429 = sdkErr.status === 429 || msg.includes('429') || msg.includes('rate');
            throw Object.assign(new Error(msg), { retryable: is429 });
          }
        }

        // Parse JSON from response (handle markdown code blocks, thinking tags, etc.)
      let text = response.trim();
      // Strip <think>...</think> blocks (some models like qwen add these)
      text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      // Try to extract JSON array if surrounded by other text
      const arrMatch = text.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        text = arrMatch[0];
      }
      let params;
      try {
        params = JSON.parse(text);
      } catch (_) {
        // Attempt to repair malformed JSON from LLM
        const repaired = repairJSON(text);
        params = JSON.parse(repaired);
      }
      if (Array.isArray(params)) {
        allParams.push(...params);
      }
      break; // success, exit retry loop
    } catch (err) {
      if (err.retryable && attempt < MAX_RETRIES) {
        const delay = Math.min(2000 * Math.pow(2, attempt), 30000);
        console.log(`Chunk ${i + 1}: 429 rate limited, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      lastError = err.message;
      console.error(`Chunk ${i + 1}/${chunks.length} analysis error:`, err.message);
      break; // non-retryable or retries exhausted
    }
    } // end retry loop
  } // end chunks loop

  if (allParams.length === 0 && lastError) {
    throw new Error('Analysis failed: ' + lastError);
  }

  // Deduplicate by id
  const seen = new Set();
  const unique = [];
  for (const p of allParams) {
    // Attempt to fix exact line number if possible
    if (p.file && contents[p.file] && p.searchPattern) {
      const fileContent = contents[p.file];
      const idx = fileContent.indexOf(p.searchPattern);
      if (idx !== -1) {
        const linesBefore = fileContent.substring(0, idx).split('\n');
        p.line = linesBefore.length;
      }
    }

    const key = p.id || `${p.file}:${p.line}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push({ ...p, originalValue: p.currentValue });
    }
  }

  return unique;
}

module.exports = { analyzeWithAI };
