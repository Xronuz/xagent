export interface ApprovalRequest {
  requiresApproval: true;
  riskLevel: "high" | "medium";
  category: string;
  action: string;
  reason: string;
  saferAlternative?: string;
}

const COMMAND_RULES: Array<{
  pattern: RegExp;
  category: string;
  riskLevel: "high" | "medium";
  reason: string;
  saferAlternative?: string;
}> = [
  // Destructive shell
  {
    pattern: /rm\s+-rf\s+(node_modules|dist|build|\.git|\/)/,
    category: "destructive_command",
    riskLevel: "high",
    reason: "Recursive deletion of critical directories is dangerous.",
    saferAlternative: "Only delete specific files or ask the user to clear caches manually."
  },
  {
    pattern: /sudo\s+/,
    category: "destructive_command",
    riskLevel: "high",
    reason: "Executing commands as root is blocked for safety."
  },
  {
    pattern: /(chmod\s+-R|chown\s+-R)/,
    category: "destructive_command",
    riskLevel: "high",
    reason: "Recursive permission changes can break the environment."
  },
  {
    pattern: /(killall|pkill)\s+/,
    category: "destructive_command",
    riskLevel: "high",
    reason: "Killing processes globally is unsafe.",
    saferAlternative: "Use the built-in stop_process tool with the specific processId."
  },
  {
    pattern: /(shutdown|reboot)/,
    category: "destructive_command",
    riskLevel: "high",
    reason: "System control commands are strictly forbidden."
  },

  // Git high-risk
  {
    pattern: /git\s+push\s+.*--force/,
    category: "git_high_risk",
    riskLevel: "high",
    reason: "Force pushing can overwrite collaborative history."
  },
  {
    pattern: /git\s+reset\s+--hard/,
    category: "git_high_risk",
    riskLevel: "high",
    reason: "Hard resets permanently discard uncommitted changes.",
    saferAlternative: "Use 'git reset --soft' or stash changes."
  },
  {
    pattern: /git\s+clean\s+-fd/,
    category: "git_high_risk",
    riskLevel: "high",
    reason: "Git clean permanently deletes untracked files.",
    saferAlternative: "Inspect files with 'git status' and remove them manually if needed."
  },
  {
    pattern: /git\s+rebase/,
    category: "git_high_risk",
    riskLevel: "high",
    reason: "Rebasing alters git history and requires approval."
  },

  // Dependencies
  {
    pattern: /(npm|pnpm|yarn|bun)\s+(install|add|uninstall|remove|update|upgrade)/,
    category: "dependency_changes",
    riskLevel: "medium",
    reason: "Dependency changes can introduce security risks or break the build.",
    saferAlternative: "Request approval before modifying dependencies."
  },

  // Infrastructure & Database
  {
    pattern: /docker\s+compose\s+down\s+-v/,
    category: "infrastructure_changes",
    riskLevel: "high",
    reason: "Removing Docker volumes destroys database and state data.",
    saferAlternative: "Use 'docker compose down' without the '-v' flag."
  },
  {
    pattern: /docker\s+system\s+prune/,
    category: "infrastructure_changes",
    riskLevel: "high",
    reason: "System prune deletes containers, networks, and images.",
  },
  {
    pattern: /prisma\s+migrate\s+reset/,
    category: "database_changes",
    riskLevel: "high",
    reason: "Migrate reset drops the entire database.",
  },
  {
    pattern: /prisma\s+db\s+push\s+--force-reset/,
    category: "database_changes",
    riskLevel: "high",
    reason: "Force-reset drops the database.",
  },
  {
    pattern: /(drop\s+database|truncate\s+table)/i,
    category: "database_changes",
    riskLevel: "high",
    reason: "Destructive SQL operations are blocked.",
  }
];

const FILE_RULES: Array<{
  pattern: RegExp;
  category: string;
  riskLevel: "high" | "medium";
  reason: string;
}> = [
  {
    pattern: /\.env(\..+)?$/,
    category: "sensitive_file",
    riskLevel: "high",
    reason: "Editing environment variable files is blocked for security."
  },
  {
    pattern: /^Dockerfile$/i,
    category: "infrastructure_config",
    riskLevel: "medium",
    reason: "Editing Docker configuration requires approval."
  },
  {
    pattern: /^docker-compose.*\.ya?ml$/i,
    category: "infrastructure_config",
    riskLevel: "medium",
    reason: "Editing Docker Compose configuration requires approval."
  },
  {
    pattern: /^\.github\/workflows\/.*\.ya?ml$/i,
    category: "ci_config",
    riskLevel: "medium",
    reason: "Editing CI/CD pipelines requires approval."
  },
  {
    pattern: /^(k8s|kubernetes)\/.*\.ya?ml$/i,
    category: "infrastructure_config",
    riskLevel: "medium",
    reason: "Editing Kubernetes manifests requires approval."
  },
  {
    pattern: /nginx.*\.conf$/i,
    category: "infrastructure_config",
    riskLevel: "medium",
    reason: "Editing Nginx configurations requires approval."
  },
  {
    pattern: /^(package\.json|.*-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i,
    category: "dependency_changes",
    riskLevel: "medium",
    reason: "Directly editing package definition or lockfiles requires approval."
  }
];

export const RiskClassifier = {
  checkCommand(command: string): ApprovalRequest | null {
    for (const rule of COMMAND_RULES) {
      if (rule.pattern.test(command)) {
        return {
          requiresApproval: true,
          riskLevel: rule.riskLevel,
          category: rule.category,
          action: command,
          reason: rule.reason,
          saferAlternative: rule.saferAlternative
        };
      }
    }
    return null;
  },

  checkFile(filePath: string): ApprovalRequest | null {
    // Standardize path separators for regex matching
    const normalizedPath = filePath.replace(/\\/g, '/');
    const filename = normalizedPath.split('/').pop() || "";

    for (const rule of FILE_RULES) {
      if (rule.pattern.test(normalizedPath) || rule.pattern.test(filename)) {
        return {
          requiresApproval: true,
          riskLevel: rule.riskLevel,
          category: rule.category,
          action: `Edit file: ${filePath}`,
          reason: rule.reason
        };
      }
    }
    return null;
  }
};
