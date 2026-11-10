import { type ToolDefs } from "./types";

type ControlTool = "send_agent_message" | "pause_execution" | "resume_execution" | "stop_execution";

/** Run controls (US3 ControlService): capability-gated, audited by the service as well. */
export const controlTools: ToolDefs<ControlTool> = {
  send_agent_message: {
    title: "Send a message to an agent",
    description:
      "Deliver a message to a managed agent. Capability-gated: observed sessions and runtimes " +
      "that cannot receive messages return CAPABILITY_UNSUPPORTED or CONFLICT.",
    async run({ agentId, text }, { actor, services }) {
      const message = await services.controls.sendToAgent(agentId, text, actor);
      return { structured: message, text: `Message ${message.id} delivered to ${agentId}.` };
    },
  },

  pause_execution: {
    title: "Interrupt and hold an execution",
    description:
      "Interrupt every live turn and hold the sessions (no true pause exists). Returns " +
      "CAPABILITY_UNSUPPORTED when a runtime of the execution cannot interrupt and resume.",
    async run({ executionId }, { actor, services }) {
      const e = await services.controls.pauseExecution(executionId, actor);
      return { structured: e, text: `Execution ${executionId} is ${e.status}.` };
    },
  },

  resume_execution: {
    title: "Resume an execution",
    description: "Continue a held execution. Capability-gated like pause_execution.",
    async run({ executionId }, { actor, services }) {
      const e = await services.controls.resumeExecution(executionId, actor);
      return { structured: e, text: `Execution ${executionId} is ${e.status}.` };
    },
  },

  stop_execution: {
    title: "Stop an execution",
    description: "Stop every runtime of the execution and cancel its open work.",
    async run({ executionId }, { actor, services }) {
      const e = await services.controls.stopExecution(executionId, actor);
      return { structured: e, text: `Execution ${executionId} is ${e.status}.` };
    },
  },
};
