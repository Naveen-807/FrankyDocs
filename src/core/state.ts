export type CommandStatus =
  | "INVALID"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "REJECTED_POLICY"
  | "EXECUTING"
  | "EXECUTED"
  | "FAILED";

export function canTransition(from: CommandStatus, to: CommandStatus): boolean {
  if (from === to) return true;
  const allowed: Record<CommandStatus, CommandStatus[]> = {
    INVALID: ["PENDING_APPROVAL", "REJECTED", "REJECTED_POLICY"],
    PENDING_APPROVAL: ["APPROVED", "REJECTED", "REJECTED_POLICY"],
    APPROVED: ["EXECUTING", "REJECTED"],
    REJECTED: [],
    REJECTED_POLICY: [],
    EXECUTING: ["EXECUTED", "FAILED"],
    EXECUTED: [],
    FAILED: []
  };
  return allowed[from].includes(to);
}

