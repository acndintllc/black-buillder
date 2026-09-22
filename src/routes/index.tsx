import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ExternalLink,
  Loader2,
  LogOut,
  Monitor,
  Smartphone,
  TerminalSquare,
} from "lucide-react";
import { toast } from "sonner";
import {
  agents,
  stageStatusLabel,
  type AgentCatalogEntry,
  type AgentType,
  type StageStatus,
} from "@/lib/agents";
import { useSession } from "@/lib/use-session";
import { listRuns, createRun, getRun } from "@/lib/runs.functions";
import { supabase } from "@/integrations/supabase/client";
import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import brandAsset from "@/assets/black-builder-logo.jpg.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BLACK BUILDER — Seven-Agent App Builder Swarm" },
      {
        name: "description",
        content: "A repo-first seven-agent app builder workspace, backed by Supabase.",
      },
      { property: "og:title", content: "BLACK BUILDER — Seven-Agent App Builder Swarm" },
      {
        property: "og:description",
        content: "Build anything with a repo-first seven-agent swarm.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "https://blackappcompleter.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://blackappcompleter.lovable.app/" }],
  }),
  component: BlackBuilder,
});

type RunSummary = Awaited<ReturnType<typeof listRuns>>[number];
type RunDetail = Awaited<ReturnType<typeof getRun>>;

function runStatusLine(run: RunSummary): string {
  switch (run.status) {
    case "pending":
      return "Queued. The swarm will pick this up shortly.";
    case "running":
      return `Running — currently at ${run.current_stage ?? "…"}.`;
    case "passed":
      return "Build complete. Preview is ready.";
    case "failed":
      return "Build failed. Check FIXER logs for details.";
    default:
      return "Queued.";
  }
}

function StageStatusDot({ status }: { status: StageStatus }) {
  const cls =
    status === "passed"
      ? "bg-success"
      : status === "running"
        ? "animate-pulse bg-warning"
        : status === "failed" || status === "escalated"
          ? "bg-danger"
          : "bg-muted-foreground";
  return <span className={`h-1.5 w-1.5 rounded-full ${cls}`} />;
}

function StageCard({
  catalog,
  stage,
  logs,
  selected,
  onClick,
}: {
  catalog: AgentCatalogEntry;
  stage: RunDetail["stages"][number] | undefined;
  logs: RunDetail["logs"];
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = catalog.icon;
  const status: StageStatus = stage?.status ?? "pending";
  const [open, setOpen] = useState(status === "running");
  return (
    <article
      className={`relative border-b border-l-2 border-b-border ${catalog.border} transition-colors ${selected ? "bg-accent/60" : "bg-card hover:bg-accent/25"}`}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-start gap-3 p-3 text-left"
      >
        <span
          className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center border bg-background ${catalog.border} ${catalog.color}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <b className="font-mono text-[10px] tracking-normal">{catalog.name}</b>
            <span className="flex items-center gap-1 font-mono text-[9px] uppercase text-muted-foreground">
              <StageStatusDot status={status} />
              {stageStatusLabel(status)}
            </span>
          </span>
          <span className="mt-1 block text-xs font-semibold">{catalog.role}</span>
          {stage?.summary && (
            <span className={`mt-0.5 block truncate font-mono text-[9px] ${catalog.color}`}>
              {stage.summary}
            </span>
          )}
          {stage?.branch && (
            <span className="block truncate text-[10px] text-muted-foreground">{stage.branch}</span>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 border-t border-border/50 px-3 py-1.5 font-mono text-[9px] text-muted-foreground hover:text-foreground"
      >
        <TerminalSquare className="h-3 w-3" /> LOGS{" "}
        <ChevronDown
          className={`ml-auto h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="space-y-1 bg-background/60 px-3 py-2 font-mono text-[9px] text-muted-foreground">
          {logs.length === 0 ? (
            <p>No logs yet.</p>
          ) : (
            logs.map((log) => (
              <p key={log.id}>
                <span className={catalog.color}>›</span> {log.message}
              </p>
            ))
          )}
        </div>
      )}
    </article>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-8 w-12 overflow-hidden">
        <img
          src={brandAsset.url}
          alt="BLACK BUILDER pyramid-eye mark"
          className="h-full w-full object-cover object-center scale-[3.4]"
        />
      </div>
      <h1>
        <span className="block font-serif text-sm font-semibold leading-none text-primary">
          BLACK
        </span>
        <span className="mt-1 block font-mono text-[7px] tracking-[0.28em] text-muted-foreground">
          BUILDER
        </span>
      </h1>
    </div>
  );
}

function BlackBuilder() {
  const session = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedAgentIndex, setSelectedAgentIndex] = useState(0);
  const [view, setView] = useState<"desktop" | "mobile">("desktop");
  const [mobilePanel, setMobilePanel] = useState<"chat" | "agents" | "preview">("chat");

  useEffect(() => {
    if (session === null) navigate({ to: "/login" });
  }, [session, navigate]);

  const runsQuery = useQuery({
    queryKey: ["runs"],
    queryFn: () => listRuns(),
    enabled: !!session,
  });

  useEffect(() => {
    if (!selectedRunId && runsQuery.data && runsQuery.data.length > 0) {
      setSelectedRunId(runsQuery.data[0]!.id);
    }
  }, [runsQuery.data, selectedRunId]);

  const runQuery = useQuery({
    queryKey: ["run", selectedRunId],
    queryFn: () => getRun({ data: { runId: selectedRunId! } }),
    enabled: !!selectedRunId,
    refetchInterval: 5000,
  });

  const createRunMutation = useMutation({
    mutationFn: (prompt: string) => createRun({ data: { prompt } }),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      setSelectedRunId(run.id);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to start a new run.");
    },
  });

  const sendMessage = ({ text }: { text: string }) => {
    const value = text.trim();
    if (!value) return;
    createRunMutation.mutate(value);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const orderedRuns = useMemo(() => [...(runsQuery.data ?? [])].reverse(), [runsQuery.data]);

  const stagesByAgent = useMemo(() => {
    const map = new Map<AgentType, RunDetail["stages"][number]>();
    for (const stage of runQuery.data?.stages ?? []) map.set(stage.agent, stage);
    return map;
  }, [runQuery.data]);

  const logsByStage = useMemo(() => {
    const map = new Map<string, RunDetail["logs"]>();
    for (const log of runQuery.data?.logs ?? []) {
      if (!log.stage_id) continue;
      const list = map.get(log.stage_id) ?? [];
      list.push(log);
      map.set(log.stage_id, list);
    }
    return map;
  }, [runQuery.data]);

  const doneCount = [...stagesByAgent.values()].filter((stage) => stage.status === "passed").length;
  const selectedRun = runQuery.data?.run;

  if (session === undefined) {
    return (
      <main className="flex h-dvh items-center justify-center bg-background text-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </main>
    );
  }
  if (session === null) return null;

  return (
    <main className="flex h-dvh min-h-[620px] flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card px-3">
        <BrandMark />
        <div className="hidden h-4 w-px bg-border sm:block" />
        <div className="hidden min-w-0 flex-1 sm:block">
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {selectedRun ? selectedRun.prompt : "no active run"}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-1.5 font-mono text-[9px] text-success md:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> SUPABASE CONNECTED
          </span>
          <Button size="sm" variant="ghost" onClick={handleSignOut}>
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </Button>
        </div>
      </header>

      <nav className="grid h-10 shrink-0 grid-cols-3 border-b border-border lg:hidden">
        {(["chat", "agents", "preview"] as const).map((item) => (
          <Button
            key={item}
            variant="ghost"
            className={`h-10 rounded-none font-mono text-[9px] uppercase ${mobilePanel === item ? "border-b border-primary text-primary" : "text-muted-foreground"}`}
            onClick={() => setMobilePanel(item)}
          >
            {item}
          </Button>
        ))}
      </nav>

      <div className="relative min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(280px,22%)_minmax(310px,25%)_1fr]">
        <section
          className={`${mobilePanel === "chat" ? "flex" : "hidden"} h-full min-h-0 flex-col border-r border-border bg-panel lg:flex`}
        >
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
            <span className="font-mono text-[9px] font-semibold">RUNS</span>
            <span className="font-mono text-[8px] text-muted-foreground">
              {orderedRuns.length} TOTAL
            </span>
          </div>
          <Conversation className="min-h-0">
            <ConversationContent className="gap-4 p-3">
              {orderedRuns.length === 0 && (
                <Message from="assistant" className="max-w-full">
                  <div className="mb-1 font-mono text-[8px] uppercase text-muted-foreground">
                    black builder
                  </div>
                  <MessageContent className="text-xs leading-relaxed">
                    <MessageResponse>
                      Describe the app you want built. Submitting a prompt creates a run and queues
                      all seven agents — PLANNER through APP WRAPPER.
                    </MessageResponse>
                  </MessageContent>
                </Message>
              )}
              {orderedRuns.map((run) => (
                <div
                  key={run.id}
                  onClick={() => setSelectedRunId(run.id)}
                  className={`cursor-pointer rounded-sm ${selectedRunId === run.id ? "ring-1 ring-primary/50" : ""}`}
                >
                  <Message from="user" className="max-w-full">
                    <div className="mb-1 font-mono text-[8px] uppercase text-muted-foreground">
                      you ·{" "}
                      {new Date(run.created_at ?? Date.now()).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <MessageContent className="border border-border bg-secondary px-3 py-2 text-xs">
                      <MessageResponse>{run.prompt}</MessageResponse>
                    </MessageContent>
                  </Message>
                  <Message from="assistant" className="max-w-full">
                    <div className="mb-1 font-mono text-[8px] uppercase text-muted-foreground">
                      black builder
                    </div>
                    <MessageContent className="text-xs leading-relaxed">
                      <MessageResponse>{runStatusLine(run)}</MessageResponse>
                    </MessageContent>
                  </Message>
                </div>
              ))}
            </ConversationContent>
          </Conversation>
          <div className="border-t border-border p-2">
            <PromptInput onSubmit={sendMessage} className="[&_textarea]:min-h-16">
              <PromptInputTextarea placeholder="Tell the swarm what to build…" autoFocus />
              <PromptInputFooter className="justify-between">
                <span className="font-mono text-[8px] text-muted-foreground">
                  one prompt · one run · seven agents
                </span>
                <PromptInputSubmit
                  status={createRunMutation.isPending ? "submitted" : "ready"}
                  disabled={createRunMutation.isPending}
                />
              </PromptInputFooter>
            </PromptInput>
          </div>
        </section>

        <section
          className={`${mobilePanel === "agents" ? "flex" : "hidden"} h-full min-h-0 flex-col border-r border-border lg:flex`}
        >
          <div className="border-b border-border p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] font-semibold">SWARM · 7 AGENTS</span>
              <span className="font-mono text-[9px] text-warning">
                {selectedRun ? `${doneCount} / 7 DONE` : "NO RUN SELECTED"}
              </span>
            </div>
            <div className="mt-2 h-1 overflow-hidden bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: selectedRun ? `${(doneCount / 7) * 100}%` : "0%" }}
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {selectedRun ? (
              agents.map((catalog, index) => {
                const stage = stagesByAgent.get(catalog.id);
                return (
                  <StageCard
                    key={catalog.id}
                    catalog={catalog}
                    stage={stage}
                    logs={stage ? (logsByStage.get(stage.id) ?? []) : []}
                    selected={selectedAgentIndex === index}
                    onClick={() => setSelectedAgentIndex(index)}
                  />
                );
              })
            ) : (
              <div className="p-4 text-xs text-muted-foreground">
                Start a run from the chat panel to see the swarm here.
              </div>
            )}
          </div>
        </section>

        <section
          className={`${mobilePanel === "preview" ? "flex" : "hidden"} h-full min-h-0 flex-col bg-muted/30 lg:flex`}
        >
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
            <span className="font-mono text-[9px] font-semibold">PREVIEW</span>
            <span className="ml-auto flex items-center gap-1">
              <Button
                size="icon-sm"
                variant={view === "desktop" ? "secondary" : "ghost"}
                onClick={() => setView("desktop")}
                title="Desktop preview"
              >
                <Monitor />
              </Button>
              <Button
                size="icon-sm"
                variant={view === "mobile" ? "secondary" : "ghost"}
                onClick={() => setView("mobile")}
                title="Mobile preview"
              >
                <Smartphone />
              </Button>
              {selectedRun?.web_url && (
                <a
                  href={selectedRun.web_url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 flex items-center gap-1 font-mono text-[9px] text-primary"
                >
                  <ExternalLink className="h-3 w-3" /> open
                </a>
              )}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-5">
            <div
              className={`${view === "mobile" ? "max-w-[390px]" : "max-w-[760px]"} mx-auto h-full transition-[max-width] duration-300`}
            >
              {selectedRun?.web_url ? (
                <iframe
                  src={selectedRun.web_url}
                  title="Build preview"
                  className="h-full w-full rounded-md border border-border bg-background shadow-2xl"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border p-6 text-center">
                  <p className="text-sm font-semibold">
                    {selectedRun ? "No preview yet" : "No active run"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedRun
                      ? "PUBLISHER will attach a live preview URL once the build is deployed."
                      : "Submit a prompt in the chat panel to start a run."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
