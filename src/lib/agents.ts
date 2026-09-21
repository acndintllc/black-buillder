import type { ComponentType } from "react";
import {
  BrainCircuit,
  GitBranch,
  Hammer,
  Package,
  Rocket,
  Search,
  Wrench,
} from "lucide-react";

export type AgentStatus = "done" | "active" | "queued";

export type AgentIcon = ComponentType<{
  className?: string;
  strokeWidth?: number;
}>;

export type Agent = {
  id: string;
  name: string;
  role: string;
  icon: AgentIcon;
  status: AgentStatus;
  task: string;
  file: string;
  source: string;
  logs: string[];
  color: string;
  border: string;
  ring: string;
};

export const agents: Agent[] = [
  {
    id: "planner",
    name: "PLANNER",
    role: "cowork-style brain agent with high-reasoning model",
    icon: BrainCircuit,
    color: "text-agent-planner",
    border: "border-agent-planner",
    ring: "ring-agent-planner",
    status: "done",
    task: "Product specification",
    file: "spec.md",
    source: "prompt → build manifest",
    logs: [
      "parsed product intent",
      "locked 8 acceptance rules",
      "wrote tasks.json",
    ],
  },
  {
    id: "scavenger",
    name: "SCAVENGER",
    role: "coder; finds repos that contain the functions needed",
    icon: Search,
    color: "text-agent-scavenger",
    border: "border-agent-scavenger",
    ring: "ring-agent-scavenger",
    status: "done",
    task: "Repo discovery",
    file: "brain_manifest.md",
    source: "3 top TypeScript repos",
    logs: [
      "searched GitHub + Hugging Face",
      "filtered stars > 300",
      "mapped reusable chunks",
    ],
  },
  {
    id: "builder",
    name: "BUILDER",
    role: "coder; strips found repos down to the components needed",
    icon: Hammer,
    color: "text-agent-builder",
    border: "border-agent-builder",
    ring: "ring-agent-builder",
    status: "done",
    task: "Core experience",
    file: "ScannerView.tsx",
    source: "barcode-reader-js · 2.1k★",
    logs: ["remixed scanner flow", "built result card", "all checks green"],
  },
  {
    id: "stitcher",
    name: "STITCHER",
    role: "coder; assembles one repo from the extracted components",
    icon: GitBranch,
    color: "text-agent-stitcher",
    border: "border-agent-stitcher",
    ring: "ring-agent-stitcher",
    status: "done",
    task: "Dependency graph",
    file: "connector-map.ts",
    source: "12 imports resolved",
    logs: [
      "merged repo brains",
      "resolved component imports",
      "lineage attached",
    ],
  },
  {
    id: "fixer",
    name: "FIXER",
    role: "coder; audits, fixes, tests, and repairs the stitched repo",
    icon: Wrench,
    color: "text-agent-fixer",
    border: "border-agent-fixer",
    ring: "ring-agent-fixer",
    status: "active",
    task: "Build verification",
    file: "fix_report.json",
    source: "pass 4 / 5",
    logs: [
      "running production build",
      "fixed 2 type errors",
      "checking mobile viewport…",
    ],
  },
  {
    id: "publisher",
    name: "PUBLISHER",
    role: "coder; commits, pushes, opens PR, and deploys web preview",
    icon: Rocket,
    color: "text-agent-publisher",
    border: "border-agent-publisher",
    ring: "ring-agent-publisher",
    status: "queued",
    task: "Preview release",
    file: "release.md",
    source: "waiting on Fixer",
    logs: ["preview target ready", "GitHub push queued", "docs scaffolded"],
  },
  {
    id: "app-wrapper",
    name: "APP WRAPPER",
    role: "coder; packages the published web app into a mobile app",
    icon: Package,
    color: "text-agent-app-wrapper",
    border: "border-agent-app-wrapper",
    ring: "ring-agent-app-wrapper",
    status: "queued",
    task: "Mobile package",
    file: "mobile_build/",
    source: "waiting on Publisher",
    logs: [
      "capacitor config ready",
      "ios/android targets queued",
      "store metadata drafted",
    ],
  },
];
