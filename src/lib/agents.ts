import type { ComponentType } from "react";
import { BrainCircuit, GitBranch, Hammer, Package, Rocket, Search, Wrench } from "lucide-react";

// Local type definitions until the Supabase schema is created and types are regenerated.
// These mirror the agent_type and stage_status enums in the database.
export type AgentType =
  | "planner"
  | "scavenger"
  | "builder"
  | "stitcher"
  | "fixer"
  | "publisher"
  | "wrapper";

export type StageStatus = "pending" | "running" | "passed" | "failed" | "escalated";

export type AgentIcon = ComponentType<{
  className?: string;
  strokeWidth?: number;
}>;

export type AgentCatalogEntry = {
  id: AgentType;
  name: string;
  role: string;
  icon: AgentIcon;
  color: string;
  border: string;
  ring: string;
};

// Fixed pipeline order: PLANNER defines the task, SCAVENGER finds source repos,
// BUILDER/STITCHER/FIXER assemble and repair the app, PUBLISHER ships it,
// WRAPPER packages it for mobile. `agents` is ordered to match.
export const agents: AgentCatalogEntry[] = [
  {
    id: "planner",
    name: "PLANNER",
    role: "cowork-style brain agent with high-reasoning model",
    icon: BrainCircuit,
    color: "text-agent-planner",
    border: "border-agent-planner",
    ring: "ring-agent-planner",
  },
  {
    id: "scavenger",
    name: "SCAVENGER",
    role: "coder; finds repos that contain the functions needed",
    icon: Search,
    color: "text-agent-scavenger",
    border: "border-agent-scavenger",
    ring: "ring-agent-scavenger",
  },
  {
    id: "builder",
    name: "BUILDER",
    role: "coder; strips found repos down to the components needed",
    icon: Hammer,
    color: "text-agent-builder",
    border: "border-agent-builder",
    ring: "ring-agent-builder",
  },
  {
    id: "stitcher",
    name: "STITCHER",
    role: "coder; assembles one repo from the extracted components",
    icon: GitBranch,
    color: "text-agent-stitcher",
    border: "border-agent-stitcher",
    ring: "ring-agent-stitcher",
  },
  {
    id: "fixer",
    name: "FIXER",
    role: "coder; audits, fixes, tests, and repairs the stitched repo",
    icon: Wrench,
    color: "text-agent-fixer",
    border: "border-agent-fixer",
    ring: "ring-agent-fixer",
  },
  {
    id: "publisher",
    name: "PUBLISHER",
    role: "coder; commits, pushes, opens PR, and deploys web preview",
    icon: Rocket,
    color: "text-agent-publisher",
    border: "border-agent-publisher",
    ring: "ring-agent-publisher",
  },
  {
    id: "wrapper",
    name: "APP WRAPPER",
    role: "coder; packages the published web app into a mobile app",
    icon: Package,
    color: "text-agent-app-wrapper",
    border: "border-agent-app-wrapper",
    ring: "ring-agent-app-wrapper",
  },
];

export const stageStatusLabel = (status: StageStatus): string => {
  switch (status) {
    case "pending":
      return "queued";
    case "running":
      return "active";
    case "passed":
      return "done";
    case "failed":
      return "failed";
    case "escalated":
      return "escalated";
    default:
      return status;
  }
};
