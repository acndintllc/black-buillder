import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  Bot, Box, BrainCircuit, Check, ChevronDown, CircleDot, Eye,
  GitBranch, Hammer, Maximize2, Monitor, PanelTop,
  Play, Rocket, Search, ShieldCheck, Smartphone, TerminalSquare,
  Wrench, X,
} from "lucide-react";
import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import brandAsset from "@/assets/black-builder-logo.jpg.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "BLACK BUILDER — Frankenswarm Demo" },
    { name: "description", content: "A repo-first six-agent app builder workspace powered by Frankenswarm." },
    { property: "og:title", content: "BLACK BUILDER — Frankenswarm Demo" },
    { property: "og:description", content: "Build anything with a repo-first six-agent swarm." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: BlackBuilder,
});

type Agent = {
  name: string; icon: typeof Search; status: "done" | "active" | "queued";
  task: string; file: string; source: string; logs: string[];
};

const agents: Agent[] = [
  { name: "PLANNER", icon: BrainCircuit, status: "done", task: "Product specification", file: "spec.md", source: "prompt → build manifest", logs: ["parsed product intent", "locked 8 acceptance rules", "wrote tasks.json"] },
  { name: "SCAVENGER", icon: Search, status: "done", task: "Repo discovery", file: "brain_manifest.md", source: "3 top TypeScript repos", logs: ["searched GitHub + Hugging Face", "filtered stars > 300", "mapped reusable chunks"] },
  { name: "BUILDER", icon: Hammer, status: "done", task: "Core experience", file: "ScannerView.tsx", source: "barcode-reader-js · 2.1k★", logs: ["remixed scanner flow", "built result card", "all checks green"] },
  { name: "STITCHER", icon: GitBranch, status: "done", task: "Dependency graph", file: "connector-map.ts", source: "12 imports resolved", logs: ["merged repo brains", "resolved component imports", "lineage attached"] },
  { name: "FIXER", icon: Wrench, status: "active", task: "Build verification", file: "fix_report.json", source: "pass 4 / 5", logs: ["running production build", "fixed 2 type errors", "checking mobile viewport…"] },
  { name: "PUBLISHER", icon: Rocket, status: "queued", task: "Preview release", file: "release.md", source: "waiting on Fixer", logs: ["preview target ready", "GitHub push queued", "docs scaffolded"] },
];

const initialMessages = [
  { role: "user" as const, text: "Build a dog food scanner — barcode scan, ingredient toxicity, score, and AI swap suggestions. Light, trustworthy." },
  { role: "assistant" as const, text: "Locked the build specification. Six agents are working in parallel across planning, repo discovery, implementation, stitching, verification, and publishing." },
  { role: "user" as const, text: "Make the toxicity badge more alarming." },
  { role: "assistant" as const, text: "Routed to **FIXER** through the connector map. Targeted edit applied to `ResultCard.tsx` — no full rebuild." },
];

function StatusDot({ status }: { status: Agent["status"] }) {
  return <span className={`h-1.5 w-1.5 rounded-full ${status === "done" ? "bg-success" : status === "active" ? "animate-pulse bg-warning" : "bg-muted-foreground"}`} />;
}

function AgentCard({ agent, selected, onClick }: { agent: Agent; selected: boolean; onClick: () => void }) {
  const Icon = agent.icon;
  const [open, setOpen] = useState(agent.status === "active");
  return (
    <article className={`border-b border-border transition-colors ${selected ? "bg-accent/60" : "bg-card hover:bg-accent/25"}`}>
      <button type="button" onClick={onClick} className="flex w-full items-start gap-3 p-3 text-left">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center border border-border bg-background text-primary"><Icon className="h-3.5 w-3.5" /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2"><b className="font-mono text-[10px] tracking-normal">{agent.name}</b><span className="flex items-center gap-1 font-mono text-[9px] uppercase text-muted-foreground"><StatusDot status={agent.status} />{agent.status}</span></span>
          <span className="mt-1 block text-xs font-semibold">{agent.task}</span>
          <span className="mt-0.5 block truncate font-mono text-[9px] text-primary/85">{agent.file}</span>
          <span className="block truncate text-[10px] text-muted-foreground">{agent.source}</span>
        </span>
      </button>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-1.5 border-t border-border/50 px-3 py-1.5 font-mono text-[9px] text-muted-foreground hover:text-foreground"><TerminalSquare className="h-3 w-3" /> LOGS <ChevronDown className={`ml-auto h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} /></button>
      {open && <div className="space-y-1 bg-background/60 px-3 py-2 font-mono text-[9px] text-muted-foreground">{agent.logs.map((log) => <p key={log}><span className="text-primary">›</span> {log}</p>)}</div>}
    </article>
  );
}

function BrandMark() {
  return <div className="flex items-center gap-2.5"><div className="h-8 w-12 overflow-hidden"><img src={brandAsset.url} alt="BLACK BUILDER pyramid-eye mark" className="h-full w-full object-cover object-center scale-[3.4]" /></div><div><div className="font-serif text-sm font-semibold leading-none text-primary">BLACK</div><div className="mt-1 font-mono text-[7px] tracking-[0.28em] text-muted-foreground">BUILDER</div></div></div>;
}

function KibblePreview({ inspect }: { inspect: boolean }) {
  return (
    <div className="mx-auto min-h-full w-full max-w-[440px] bg-foreground text-background">
      <div className="flex h-12 items-center justify-between border-b border-background/10 px-4"><div className="flex items-center gap-2 font-semibold"><span className="grid h-6 w-6 place-items-center rounded-full bg-background text-foreground">K</span>KibbleCheck</div><CircleDot className="h-4 w-4" /></div>
      <div className="relative m-4 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-background text-foreground">
        <div className="absolute inset-x-4 top-5 h-px bg-primary/80 shadow-[0_0_18px_var(--primary)] scanline" />
        <div className="text-center"><Box className="mx-auto h-14 w-14 text-primary" strokeWidth={1.2}/><p className="mt-3 text-sm font-semibold">Point at barcode</p><p className="mt-1 font-mono text-[9px] text-muted-foreground">ScannerView.tsx · BUILDER</p><Button size="sm" className="mt-4"><Play className="h-3 w-3" /> Scan</Button></div>
        {inspect && <div className="absolute inset-3 border border-primary"><span className="absolute -top-5 left-0 bg-primary px-1.5 py-0.5 font-mono text-[8px] text-primary-foreground">scan-card · ScannerView.tsx</span></div>}
      </div>
      <div className="space-y-3 px-4 pb-6">
        <section className="rounded-md border border-background/15 bg-background/5 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[9px] font-semibold text-danger">DETECTED · 2 RISKS</p><h3 className="mt-1 text-sm font-bold">Acme Grain-Free Kibble</h3><p className="text-[10px] opacity-60">Chicken recipe · 12 ingredients</p></div><div className="text-right"><div className="text-2xl font-bold">6.2</div><div className="text-[9px] font-bold text-warning">C+ SCORE</div></div></div></section>
        <section><div className="mb-2 flex justify-between font-mono text-[9px] font-semibold"><span>INGREDIENTS</span><span className="opacity-50">FOOD-PARSER-APP</span></div><div className="divide-y divide-background/10 rounded-md border border-background/15">{[["Chicken", "safe", "text-success"], ["Pea Protein", "watch", "text-warning"], ["Propylene Glycol", "risk", "text-danger"]].map(([name,label,color]) => <div key={name} className="flex justify-between p-2.5 text-xs"><span>{name}</span><b className={color}>{label}</b></div>)}</div></section>
        <section className="rounded-md bg-primary p-3 text-primary-foreground"><div className="flex items-center gap-1.5 font-mono text-[9px] font-bold"><Bot className="h-3 w-3" /> AI SWAP</div><p className="mt-2 text-xs font-medium">Try Orijen Original — 32% less filler at a similar price.</p><div className="mt-3 flex items-center justify-between border-t border-primary-foreground/20 pt-2 text-xs"><b>Orijen Original</b><span>$24.99 · 8.4 B+</span></div></section>
      </div>
    </div>
  );
}

function BlackBuilder() {
  const [messages, setMessages] = useState(initialMessages);
  const [selectedAgent, setSelectedAgent] = useState(4);
  const [view, setView] = useState<"desktop" | "mobile">("desktop");
  const [inspect, setInspect] = useState(false);
  const [building, setBuilding] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"chat" | "agents" | "preview">("preview");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendMessage = ({ text }: { text: string }) => {
    const value = text.trim();
    if (!value) return;
    setMessages((current) => [...current, { role: "user", text: value }, { role: "assistant", text: "Request routed to **FIXER**. The focused demo change is now queued for verification." }]);
  };
  const simulateBuild = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setBuilding(true);
    timeoutRef.current = setTimeout(() => setBuilding(false), 1800);
  };

  return (
    <main className="flex h-dvh min-h-[620px] flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card px-3">
        <BrandMark />
        <div className="hidden h-4 w-px bg-border sm:block" />
        <div className="hidden min-w-0 sm:block"><p className="truncate font-mono text-[10px] text-muted-foreground">FRANKENSWARM / dog-food-scanner</p></div>
        <div className="ml-auto hidden items-center gap-2 md:flex"><span className="flex items-center gap-1.5 font-mono text-[9px] text-success"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> SWARM LIVE</span><span className="border border-border px-2 py-1 font-mono text-[9px] text-muted-foreground">QWEN2.5-CODER:32B</span></div>
        <Button size="sm" onClick={simulateBuild} disabled={building}>{building ? <><CircleDot className="animate-spin" /> Building</> : <><Rocket /> Ship</>}</Button>
      </header>

      <nav className="grid h-10 shrink-0 grid-cols-3 border-b border-border lg:hidden">{(["chat","agents","preview"] as const).map((item) => <Button key={item} variant="ghost" className={`h-10 rounded-none font-mono text-[9px] uppercase ${mobilePanel === item ? "border-b border-primary text-primary" : "text-muted-foreground"}`} onClick={() => setMobilePanel(item)}>{item}</Button>)}</nav>

      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(280px,22%)_minmax(310px,25%)_1fr]">
        <section className={`${mobilePanel === "chat" ? "flex" : "hidden"} h-full min-h-0 flex-col border-r border-border bg-panel lg:flex`}>
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3"><span className="font-mono text-[9px] font-semibold">CHAT / EDIT</span><span className="font-mono text-[8px] text-muted-foreground">MASON ROUTING</span></div>
          <Conversation className="min-h-0"><ConversationContent className="gap-4 p-3">{messages.map((message, index) => <Message from={message.role} key={`${message.role}-${index}`} className="max-w-full"><div className="mb-1 font-mono text-[8px] uppercase text-muted-foreground">{message.role === "user" ? "you" : "black builder"} · 09:{41 + index}</div><MessageContent className={message.role === "user" ? "border border-border bg-secondary px-3 py-2 text-xs" : "text-xs leading-relaxed"}><MessageResponse>{message.text}</MessageResponse></MessageContent></Message>)}</ConversationContent></Conversation>
          <div className="border-t border-border p-2"><div className="mb-2 flex items-start gap-2 border border-primary/40 bg-primary/5 p-2"><Eye className="mt-0.5 h-3 w-3 text-primary"/><div className="min-w-0"><p className="font-mono text-[8px] text-primary">EDITING CONTEXT</p><p className="truncate text-[10px]">result-card · ResultCard.tsx</p></div><X className="ml-auto h-3 w-3 text-muted-foreground" /></div><PromptInput onSubmit={sendMessage} className="[&_textarea]:min-h-16"><PromptInputTextarea placeholder="Tell the swarm what to build…" autoFocus /><PromptInputFooter className="justify-between"><span className="font-mono text-[8px] text-muted-foreground">repo-first · no full rebuild</span><PromptInputSubmit status="ready" /></PromptInputFooter></PromptInput></div>
        </section>

        <section className={`${mobilePanel === "agents" ? "flex" : "hidden"} h-full min-h-0 flex-col border-r border-border lg:flex`}>
          <div className="border-b border-border p-3"><div className="flex items-center justify-between"><span className="font-mono text-[9px] font-semibold">SWARM · 6 AGENTS</span><span className="font-mono text-[9px] text-warning">5 / 6 ACTIVE</span></div><div className="mt-2 h-1 overflow-hidden bg-muted"><div className="h-full w-[86%] bg-primary" /></div></div>
          <div className="min-h-0 flex-1 overflow-y-auto">{agents.map((agent, index) => <AgentCard key={agent.name} agent={agent} selected={selectedAgent === index} onClick={() => setSelectedAgent(index)} />)}</div>
          <div className="border-t border-border bg-card p-3"><div className="flex justify-between font-mono text-[9px]"><span>INSPECTOR</span><span className="text-warning">92% COMPLIANCE</span></div><div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-success" /> manifest locked · 1 drift flagged</div></div>
        </section>

        <section className={`${mobilePanel === "preview" ? "flex" : "hidden"} h-full min-h-0 flex-col bg-muted/30 lg:flex`}>
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-card px-3"><span className="font-mono text-[9px] font-semibold">PREVIEW</span><span className="font-mono text-[8px] text-muted-foreground">dog-food-scanner</span><span className="ml-auto flex items-center gap-1"><Button size="icon-sm" variant={view === "desktop" ? "secondary" : "ghost"} onClick={() => setView("desktop")} title="Desktop preview"><Monitor /></Button><Button size="icon-sm" variant={view === "mobile" ? "secondary" : "ghost"} onClick={() => setView("mobile")} title="Mobile preview"><Smartphone /></Button><Button size="icon-sm" variant={inspect ? "secondary" : "ghost"} onClick={() => setInspect(!inspect)} title="Inspect elements"><PanelTop /></Button><Button size="icon-sm" variant="ghost" title="Expand preview"><Maximize2 /></Button></span></div>
          <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-5"><div className={`${view === "mobile" ? "max-w-[390px]" : "max-w-[760px]"} mx-auto min-h-full overflow-hidden rounded-md border border-border shadow-2xl transition-[max-width] duration-300`}><KibblePreview inspect={inspect} /></div></div>
          <footer className="flex h-8 shrink-0 items-center gap-2 border-t border-border bg-card px-3 font-mono text-[8px] text-muted-foreground"><Check className="h-3 w-3 text-success" /> build_output/ ready <span className="ml-auto text-success">HOT RELOAD ON</span></footer>
        </section>
      </div>
    </main>
  );
}
