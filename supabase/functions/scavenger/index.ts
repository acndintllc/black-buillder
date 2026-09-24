// SCAVENGER — reads PLANNER's spec, searches GitHub for reusable code per
// function_key, and records every candidate considered (accepted or
// rejected) as a `sources` row. See docs/agent-contracts.md #2 for the full
// contract (inputs/outputs/success criteria).
//
// Auth: internal service-to-service only, same pattern as planner/llm-proxy.
// Invoked by runner-callback right after PLANNER passes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const githubToken = Deno.env.get("GITHUB_TOKEN") ?? "";
const supabase = createClient(supabaseUrl, serviceRoleKey);

const AGENT = "scavenger";

type LogLine = string | { level: "info" | "warn" | "error"; message: string };

async function callback(
  run_id: string,
  status: "running" | "passed" | "failed" | "escalated",
  opts: { summary?: string; logs?: LogLine[] } = {},
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/runner-callback`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${serviceRoleKey}` },
    body: JSON.stringify({ run_id, agent: AGENT, status, ...opts }),
  });
  if (!res.ok) {
    console.error(`runner-callback failed for run ${run_id}: ${res.status} ${await res.text()}`);
  }
}

// Conservative default license policy: permissive OSS only. This fills the
// "license allow-list/policy" gap flagged as an open dependency in
// docs/agent-contracts.md — copyleft (GPL/AGPL/LGPL) and unlicensed code is
// rejected by default rather than silently accepted, per org doctrine
// ("do not silently accept a bad license"). Revisit as a config value if the
// org wants a different policy later.
const LICENSE_ALLOWLIST = new Set([
  "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD", "Unlicense", "CC0-1.0",
]);

type SpecFunction = { function_key: string; description: string; acceptance_signal: string };

type Candidate = {
  index: number;
  full_name: string; // owner/repo
  html_url: string;
  description: string;
  stars: number;
  license_spdx: string | null;
  commit_sha: string | null;
};

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "that", "this",
  "it", "is", "are", "be", "by", "as", "from", "into", "via", "using", "user", "users",
]);

function extractKeywords(text: string, max: number): string[] {
  return [...new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s_]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  )].slice(0, max);
}

function buildSearchQuery(fn: SpecFunction): string {
  const keyTerms = fn.function_key.split("_").filter((w) => w.length > 2);
  const descTerms = extractKeywords(fn.description, 6);
  return [...new Set([...keyTerms, ...descTerms])].slice(0, 8).join(" ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// GitHub's code search endpoint is capped at 10 req/min regardless of auth
// (see roadmap.md) - space calls out to stay safely under that.
let lastSearchAt = 0;
async function throttledSearch(query: string): Promise<{ ok: true; items: any[] } | { ok: false; status: number; body: string }> {
  const wait = lastSearchAt + 6500 - Date.now();
  if (wait > 0) await sleep(wait);
  lastSearchAt = Date.now();

  const res = await fetch(`https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=5`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${githubToken}`,
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!res.ok) {
    return { ok: false, status: res.status, body: await res.text() };
  }
  const data = await res.json();
  return { ok: true, items: data.items ?? [] };
}

async function fetchLicenseAndCommit(fullName: string): Promise<{ license_spdx: string | null; commit_sha: string | null }> {
  try {
    const repoRes = await fetch(`https://api.github.com/repos/${fullName}`, {
      headers: { accept: "application/vnd.github+json", authorization: `Bearer ${githubToken}` },
    });
    if (!repoRes.ok) return { license_spdx: null, commit_sha: null };
    const repo = await repoRes.json();
    const licenseSpdx: string | null = repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION" ? repo.license.spdx_id : null;
    const defaultBranch = repo.default_branch ?? "main";

    const branchRes = await fetch(`https://api.github.com/repos/${fullName}/branches/${defaultBranch}`, {
      headers: { accept: "application/vnd.github+json", authorization: `Bearer ${githubToken}` },
    });
    const commitSha = branchRes.ok ? (await branchRes.json()).commit?.sha ?? null : null;

    return { license_spdx: licenseSpdx, commit_sha: commitSha };
  } catch {
    return { license_spdx: null, commit_sha: null };
  }
}

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  return JSON.parse(candidate.trim());
}

type JudgeDecision = { function_key: string; decision: "accept" | "none"; accepted_index: number | null; reason: string };

function validateJudgeResponse(
  data: unknown,
  expectedKeys: string[],
  candidatesByKey: Map<string, Candidate[]>,
): { ok: true; decisions: JudgeDecision[] } | { ok: false; error: string } {
  if (typeof data !== "object" || data === null) return { ok: false, error: "response is not a JSON object" };
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.decisions)) return { ok: false, error: '"decisions" must be an array' };

  const seen = new Set<string>();
  const decisions: JudgeDecision[] = [];
  for (const [i, raw] of d.decisions.entries()) {
    if (typeof raw !== "object" || raw === null) return { ok: false, error: `decisions[${i}] is not an object` };
    const r = raw as Record<string, unknown>;
    if (typeof r.function_key !== "string" || !expectedKeys.includes(r.function_key)) {
      return { ok: false, error: `decisions[${i}].function_key is missing or not one of the expected keys` };
    }
    if (r.decision !== "accept" && r.decision !== "none") {
      return { ok: false, error: `decisions[${i}].decision must be "accept" or "none"` };
    }
    if (typeof r.reason !== "string" || !r.reason.trim()) {
      return { ok: false, error: `decisions[${i}].reason is missing or empty` };
    }
    if (r.decision === "accept") {
      const candidates = candidatesByKey.get(r.function_key) ?? [];
      if (typeof r.accepted_index !== "number" || !candidates.some((c) => c.index === r.accepted_index)) {
        return { ok: false, error: `decisions[${i}].accepted_index is missing or not a valid candidate index` };
      }
    }
    seen.add(r.function_key);
    decisions.push({
      function_key: r.function_key,
      decision: r.decision,
      accepted_index: r.decision === "accept" ? (r.accepted_index as number) : null,
      reason: r.reason,
    });
  }
  for (const key of expectedKeys) {
    if (!seen.has(key)) return { ok: false, error: `missing a decision for function_key "${key}"` };
  }
  return { ok: true, decisions };
}

const JUDGE_SYSTEM_PROMPT = `You are SCAVENGER, stage 2 of the Black Builder app-building swarm.

You are shown, for a set of function_keys, a short list of candidate GitHub repositories that already passed a license check. Your only job: for each function_key, decide whether ONE of its candidates is actually a good functional match for the description/acceptance_signal, or whether none of them really fit and the function should be hand-built from scratch instead.

Rules:
- Judge functional fit only - license has already been filtered before you see these candidates.
- Pick the single best candidate only if it plausibly implements (or could be adapted to implement) the described function. Do not accept a loose thematic match.
- If no candidate is a real fit, say so ("decision": "none") rather than forcing a bad pick - scratch-building is a normal, expected outcome, not a failure.
- "reason" must be a concrete one-sentence justification referencing what the candidate actually does (or why none qualify).

Respond with nothing but a single JSON object, no markdown fences, no commentary:
{
  "decisions": [
    { "function_key": string, "decision": "accept" | "none", "accepted_index": number | null, "reason": string }
  ]
}
One entry per function_key you were shown, in any order.`;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const providedToken = authHeader.replace(/^Bearer\s+/i, "");
  if (!serviceRoleKey || providedToken !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Unauthorized: internal service calls only" }), { status: 401 });
  }

  let run_id: string;
  try {
    const body = await req.json();
    run_id = body.run_id;
    if (!run_id) throw new Error("run_id is required");
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 400 });
  }

  const { data: run, error: runErr } = await supabase
    .from("runs")
    .select("input_repo_url")
    .eq("id", run_id)
    .single();
  if (runErr || !run) {
    return new Response(JSON.stringify({ error: `run ${run_id} not found: ${runErr?.message}` }), { status: 404 });
  }

  const { data: specArtifact, error: specErr } = await supabase
    .from("artifacts")
    .select("storage_path")
    .eq("run_id", run_id)
    .eq("kind", "spec")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (specErr || !specArtifact) {
    const msg = `No spec artifact found for run ${run_id}: ${specErr?.message ?? "none exists"}`;
    await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }

  const { data: specBlob, error: downloadErr } = await supabase.storage.from("artifacts").download(specArtifact.storage_path);
  if (downloadErr || !specBlob) {
    const msg = `Failed to download spec artifact: ${downloadErr?.message}`;
    await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
  const spec: { functions: SpecFunction[] } = JSON.parse(await specBlob.text());

  await callback(run_id, "running");

  if (!githubToken) {
    const msg = "GITHUB_TOKEN is not configured - SCAVENGER cannot search GitHub. Add it in Supabase project secrets.";
    await callback(run_id, "escalated", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ run_id, status: "escalated", reason: msg }), { status: 200 });
  }

  const logs: LogLine[] = [];
  const sourceRows: {
    run_id: string;
    function_key: string;
    source_type: "base" | "registry" | "npm" | "repo" | "scratch";
    ref: string | null;
    commit_sha: string | null;
    license_spdx: string | null;
    decision: "accepted" | "rejected";
    reason: string;
  }[] = [];

  // `sources.function_key` is NOT NULL, so the base-repo row uses this
  // sentinel - it isn't one of the spec's function_keys, it's context BUILDER
  // needs about the existing repo the user asked to complete/modify.
  const BASE_REPO_FUNCTION_KEY = "__existing_repo__";
  if (run.input_repo_url) {
    let commitSha: string | null = null;
    const match = run.input_repo_url.match(/github\.com\/([^/]+\/[^/.]+)/);
    if (match) {
      const { commit_sha } = await fetchLicenseAndCommit(match[1]);
      commitSha = commit_sha;
    }
    sourceRows.push({
      run_id,
      function_key: BASE_REPO_FUNCTION_KEY,
      source_type: "base",
      ref: run.input_repo_url,
      commit_sha: commitSha,
      license_spdx: null,
      decision: "accepted",
      reason: "User-supplied existing repo to complete/modify.",
    });
    logs.push({ level: "info", message: `Recorded base repo: ${run.input_repo_url}` });
  }

  const candidatesByKey = new Map<string, Candidate[]>();
  const scratchKeys: string[] = [];
  const escalationKeys: { function_key: string; licenses: string[] }[] = [];
  let searchBlocked: string | null = null;

  for (const fn of spec.functions) {
    if (searchBlocked) break;
    const query = buildSearchQuery(fn);
    const result = await throttledSearch(query);

    if (!result.ok) {
      if (result.status === 401 || result.status === 403 || result.status === 429) {
        searchBlocked = `GitHub search returned ${result.status} (${result.body.slice(0, 200)}) - access appears blocked (auth/rate limit).`;
        break;
      }
      // Non-auth failure for this one query - treat as "no candidates found" rather than aborting the whole run.
      logs.push({ level: "warn", message: `Search failed for "${fn.function_key}" (${result.status}); treating as no candidates.` });
      scratchKeys.push(fn.function_key);
      continue;
    }

    const uniqueRepos = [...new Map(result.items.map((item: any) => [item.repository.full_name, item.repository])).values()].slice(0, 3);
    if (uniqueRepos.length === 0) {
      scratchKeys.push(fn.function_key);
      continue;
    }

    const candidates: Candidate[] = [];
    let idx = 0;
    for (const repo of uniqueRepos as any[]) {
      const { license_spdx, commit_sha } = await fetchLicenseAndCommit(repo.full_name);
      candidates.push({
        index: idx++,
        full_name: repo.full_name,
        html_url: repo.html_url,
        description: repo.description ?? "",
        stars: repo.stargazers_count ?? 0,
        license_spdx,
        commit_sha,
      });
    }

    const licenseOk = candidates.filter((c) => c.license_spdx && LICENSE_ALLOWLIST.has(c.license_spdx));
    const licenseBlocked = candidates.filter((c) => !(c.license_spdx && LICENSE_ALLOWLIST.has(c.license_spdx)));

    for (const c of licenseBlocked) {
      sourceRows.push({
        run_id,
        function_key: fn.function_key,
        source_type: "repo",
        ref: c.full_name,
        commit_sha: c.commit_sha,
        license_spdx: c.license_spdx,
        decision: "rejected",
        reason: c.license_spdx ? `License "${c.license_spdx}" is not on the allow-list.` : "No detectable/compatible license.",
      });
    }

    if (licenseOk.length === 0) {
      escalationKeys.push({ function_key: fn.function_key, licenses: licenseBlocked.map((c) => c.license_spdx ?? "none") });
      continue;
    }

    candidatesByKey.set(fn.function_key, licenseOk);
  }

  if (searchBlocked) {
    await callback(run_id, "escalated", { summary: searchBlocked, logs: [...logs, { level: "error", message: searchBlocked }] });
    return new Response(JSON.stringify({ run_id, status: "escalated", reason: searchBlocked }), { status: 200 });
  }

  // Judge functional fit for every function_key that has at least one
  // license-acceptable candidate, in a single batched LLM call.
  if (candidatesByKey.size > 0) {
    const judgeInput = [...candidatesByKey.entries()].map(([function_key, candidates]) => {
      const fn = spec.functions.find((f) => f.function_key === function_key)!;
      return {
        function_key,
        description: fn.description,
        acceptance_signal: fn.acceptance_signal,
        candidates: candidates.map((c) => ({
          index: c.index,
          repo: c.full_name,
          description: c.description,
          stars: c.stars,
          license: c.license_spdx,
        })),
      };
    });

    let llmResponse: Response;
    try {
      llmResponse = await fetch(`${supabaseUrl}/functions/v1/llm-proxy`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({
          role: "scavenger",
          run_id,
          system: JUDGE_SYSTEM_PROMPT,
          messages: [{ role: "user", content: JSON.stringify(judgeInput) }],
          max_tokens: 4096,
        }),
      });
    } catch (err) {
      const msg = `llm-proxy request failed: ${err instanceof Error ? err.message : String(err)}`;
      await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }] });
      return new Response(JSON.stringify({ error: msg }), { status: 502 });
    }

    if (!llmResponse.ok) {
      const bodyText = await llmResponse.text();
      const msg = llmResponse.status === 402
        ? `Run budget exceeded before SCAVENGER could complete: ${bodyText}`
        : `llm-proxy returned ${llmResponse.status}: ${bodyText}`;
      await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }] });
      return new Response(JSON.stringify({ error: msg }), { status: 502 });
    }

    const llmResult = await llmResponse.json();
    let parsed: unknown;
    try {
      parsed = extractJson(llmResult.content ?? "");
    } catch (err) {
      const msg = `SCAVENGER's judging response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`;
      await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }] });
      return new Response(JSON.stringify({ error: msg }), { status: 502 });
    }

    const validation = validateJudgeResponse(parsed, [...candidatesByKey.keys()], candidatesByKey);
    if (!validation.ok) {
      const msg = `SCAVENGER's judging response failed validation: ${validation.error}`;
      await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }] });
      return new Response(JSON.stringify({ error: msg }), { status: 502 });
    }

    for (const dec of validation.decisions) {
      const candidates = candidatesByKey.get(dec.function_key)!;
      if (dec.decision === "accept") {
        const accepted = candidates.find((c) => c.index === dec.accepted_index)!;
        sourceRows.push({
          run_id,
          function_key: dec.function_key,
          source_type: "repo",
          ref: accepted.full_name,
          commit_sha: accepted.commit_sha,
          license_spdx: accepted.license_spdx,
          decision: "accepted",
          reason: dec.reason,
        });
        for (const c of candidates) {
          if (c.index !== accepted.index) {
            sourceRows.push({
              run_id,
              function_key: dec.function_key,
              source_type: "repo",
              ref: c.full_name,
              commit_sha: c.commit_sha,
              license_spdx: c.license_spdx,
              decision: "rejected",
              reason: "Not selected: another candidate was a better functional fit.",
            });
          }
        }
      } else {
        for (const c of candidates) {
          sourceRows.push({
            run_id,
            function_key: dec.function_key,
            source_type: "repo",
            ref: c.full_name,
            commit_sha: c.commit_sha,
            license_spdx: c.license_spdx,
            decision: "rejected",
            reason: `Not a functional fit: ${dec.reason}`,
          });
        }
        scratchKeys.push(dec.function_key);
      }
    }
  }

  for (const key of scratchKeys) {
    sourceRows.push({
      run_id,
      function_key: key,
      source_type: "scratch",
      ref: null,
      commit_sha: null,
      license_spdx: null,
      decision: "accepted",
      reason: "No suitable existing match found; BUILDER should hand-build this function.",
    });
  }

  const { error: insertErr } = await supabase.from("sources").insert(sourceRows);
  if (insertErr) {
    const msg = `Failed to record sources rows: ${insertErr.message}`;
    await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }

  if (escalationKeys.length > 0) {
    const reason = `Only license-incompatible candidates exist for: ${escalationKeys
      .map((e) => `${e.function_key} (${e.licenses.join(", ")})`)
      .join("; ")}. Needs a human decision (override policy, or approve scratch-building instead) rather than a silent license downgrade.`;
    await callback(run_id, "escalated", { summary: reason, logs: [...logs, { level: "warn", message: reason }] });
    return new Response(JSON.stringify({ run_id, status: "escalated", reason }), { status: 200 });
  }

  const acceptedCount = sourceRows.filter((r) => r.decision === "accepted").length;
  const rejectedCount = sourceRows.filter((r) => r.decision === "rejected").length;
  const scratchCount = sourceRows.filter((r) => r.source_type === "scratch").length;
  const summary = `Resolved ${spec.functions.length} function${spec.functions.length === 1 ? "" : "s"}: ${
    acceptedCount - scratchCount
  } from existing repos, ${scratchCount} to hand-build, ${rejectedCount} candidates rejected (license/fit).`;

  await callback(run_id, "passed", { summary, logs });
  return new Response(JSON.stringify({ run_id, status: "passed", accepted: acceptedCount, rejected: rejectedCount }), { status: 200 });
});
