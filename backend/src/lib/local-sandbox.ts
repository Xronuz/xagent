/**
 * Local Sandbox — @upstash/box interfeysi bilan mos keladi
 * Upstash Box o'rniga local filesystem + child_process ishlatadi
 */
import { execSync, exec, spawn, ChildProcess } from "child_process";
import * as fs from "fs";

export interface BackgroundProcess {
  id: string;
  name: string;
  command: string;
  pid?: number;
  status: "running" | "stopped" | "error";
  exitCode?: number;
  logs: string[];
  process?: ChildProcess;
  detectedUrl?: string;
}

const backgroundProcesses = new Map<string, BackgroundProcess>();

import * as path from "path";
import { promisify } from "util";

const execAsync = promisify(exec);

const SANDBOXES_DIR = path.join(process.cwd(), ".sandboxes");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function runCmd(
  command: string,
  cwd: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: stdout || "", stderr: stderr || "", exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout || "",
      stderr: err.stderr || err.message || "",
      exitCode: err.code ?? 1,
    };
  }
}

export class LocalBox {
  private boxDir: string;
  private currentDir: string;
  private gitUser: string;
  private gitEmail: string;
  private gitToken: string;

  constructor(options: {
    boxId: string;
    gitToken?: string;
    gitUser?: string;
    gitEmail?: string;
  }) {
    this.boxDir = path.join(SANDBOXES_DIR, options.boxId);
    this.currentDir = this.boxDir;
    this.gitToken = options.gitToken || "";
    this.gitUser = options.gitUser || "xagent";
    this.gitEmail = options.gitEmail || "xronuz@gmail.com";
    ensureDir(this.boxDir);
  }

  get id(): string {
    return path.basename(this.boxDir);
  }

  /** box.cd(repoName) */
  async cd(subPath: string): Promise<void> {
    const target = path.join(this.boxDir, subPath);
    ensureDir(target);
    this.currentDir = target;
  }

  /** box.files.list(path) */
  files = {
    list: async (relPath: string = "."): Promise<string[]> => {
      const target = path.join(this.currentDir, relPath);
      if (!fs.existsSync(target)) return [];
      const entries = fs.readdirSync(target, { withFileTypes: true });
      return entries.map((e) => (e.isDirectory() ? e.name + "/" : e.name));
    },

    read: async (relPath: string): Promise<string> => {
      const target = path.join(this.currentDir, relPath);
      if (!fs.existsSync(target)) throw new Error(`File not found: ${relPath}`);
      return fs.readFileSync(target, "utf-8");
    },

    write: async (opts: { path: string; content: string }): Promise<void> => {
      const target = path.join(this.currentDir, opts.path);
      ensureDir(path.dirname(target));
      fs.writeFileSync(target, opts.content, "utf-8");
    },
  };

  /** box.exec.command(cmd) */
  exec = {
    command: async (
      command: string
    ): Promise<{ result: string; exitCode: number }> => {
      const r = await runCmd(command, this.currentDir);
      return {
        result: r.stdout || r.stderr,
        exitCode: r.exitCode,
      };
    },
  };

  /** Background Process Manager */
  processes = {
    start: async (opts: { command: string, cwd?: string, env?: any, name?: string }) => {
      const processId = `proc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const targetCwd = opts.cwd ? path.join(this.currentDir, opts.cwd) : this.currentDir;
      const processName = opts.name || opts.command.split(" ")[0];

      // Check for duplicate name if explicitly provided
      if (opts.name) {
         for (const [id, proc] of backgroundProcesses.entries()) {
             if (proc.name === opts.name && proc.status === "running") {
                 return { processId: id, status: proc.status, pid: proc.pid, message: "Process with this name is already running" };
             }
         }
      }

      const child = spawn(opts.command, {
        cwd: targetCwd,
        env: { ...process.env, ...opts.env },
        shell: true,
        stdio: "pipe",
      });

      const bgProc: BackgroundProcess = {
        id: processId,
        name: processName,
        command: opts.command,
        pid: child.pid,
        status: "running",
        logs: [],
        process: child,
      };

      backgroundProcesses.set(processId, bgProc);

      const urlRegex = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::[0-9]+)?)/gi;

      const appendLog = (data: Buffer | string, type: string) => {
        const lines = data.toString().split("\n").filter(Boolean);
        const prefix = type === "err" ? "[STDERR] " : "";
        for (const line of lines) {
          bgProc.logs.push(`${prefix}${line}`);
          if (bgProc.logs.length > 1000) bgProc.logs.shift(); // keep bounded

          // URL Detection
          const match = line.match(urlRegex);
          if (match && match.length > 0) {
            bgProc.detectedUrl = match[0];
          }
        }
      };

      child.stdout?.on("data", (data: any) => appendLog(data, "out"));
      child.stderr?.on("data", (data: any) => appendLog(data, "err"));

      child.on("close", (code: number | null) => {
        bgProc.status = code === 0 ? "stopped" : "error";
        bgProc.exitCode = code ?? undefined;
        bgProc.logs.push(`[SYSTEM] Process exited with code ${code}`);
      });

      child.on("error", (err: any) => {
        bgProc.status = "error";
        bgProc.logs.push(`[SYSTEM] Process error: ${err.message}`);
      });

      return { processId, pid: child.pid, status: "running" };
    },

    readLogs: (processId: string) => {
      const proc = backgroundProcesses.get(processId);
      if (!proc) throw new Error("Process not found");
      return { logs: proc.logs, status: proc.status, exitCode: proc.exitCode };
    },

    stop: (processId: string) => {
      const proc = backgroundProcesses.get(processId);
      if (!proc) throw new Error("Process not found");
      if (proc.status !== "running" || !proc.process) {
        return { success: false, message: "Process is not running" };
      }
      proc.process.kill("SIGTERM");
      proc.status = "stopped";
      return { success: true, message: "Process stopped" };
    },

    list: () => {
      const list = [];
      for (const [id, proc] of backgroundProcesses.entries()) {
        list.push({
          id,
          name: proc.name,
          command: proc.command,
          pid: proc.pid,
          status: proc.status,
          exitCode: proc.exitCode,
          detectedUrl: proc.detectedUrl,
        });
      }
      return list;
    }
  };

  /** box.git.* */
  git = {
    clone: async (opts: {
      repo: string;
      branch?: string;
      targetDir?: string;
    }): Promise<void> => {
      // repo URL'ga token embed qilamiz (HTTPS clone)
      let repoUrl = opts.repo;
      if (this.gitToken && repoUrl.startsWith("https://github.com/")) {
        repoUrl = repoUrl.replace(
          "https://github.com/",
          `https://${this.gitToken}@github.com/`
        );
      }

      // targetDir bo'lsa u papkaga, aks holda joriy papkaga clone qilamiz
      const dest = opts.targetDir ? JSON.stringify(opts.targetDir) : ".";

      // git config user
      await runCmd(
        `git config --global user.name "${this.gitUser}"`,
        this.currentDir
      );
      await runCmd(
        `git config --global user.email "${this.gitEmail}"`,
        this.currentDir
      );

      // 1. Avval branch bilan clone qilib ko'ramiz
      if (opts.branch) {
        const r = await runCmd(
          `git clone --branch ${opts.branch} --single-branch ${repoUrl} ${dest}`,
          this.currentDir
        );
        if (r.exitCode === 0) return;
        // Agar branch topilmasa yoki repo bo'sh bo'lsa — branchsiz urinib ko'ramiz
        console.log(`[sandbox] branch '${opts.branch}' topilmadi, branchsiz clone qilinmoqda...`);
      }

      // 2. Branch belgilamasdan oddiy clone
      const r2 = await runCmd(
        `git clone ${repoUrl} ${dest}`,
        this.currentDir
      );
      if (r2.exitCode === 0) return;

      // 3. Repo bo'sh bo'lsa (empty repo) — git init + remote add
      if (
        r2.stderr.includes("empty") ||
        r2.stderr.includes("nothing to commit") ||
        r2.stderr.includes("You appear to have cloned an empty repository") ||
        r2.stderr.includes("warning: You appear") ||
        r2.exitCode === 128
      ) {
        console.log("[sandbox] Bo'sh repo — git init + remote add qilinmoqda...");
        const targetPath = opts.targetDir
          ? path.join(this.currentDir, opts.targetDir)
          : this.currentDir;
        ensureDir(targetPath);
        await runCmd("git init", targetPath);
        await runCmd(`git remote add origin ${repoUrl}`, targetPath);
        await runCmd(
          `git config --global user.name "${this.gitUser}"`,
          targetPath
        );
        await runCmd(
          `git config --global user.email "${this.gitEmail}"`,
          targetPath
        );
        return;
      }

      throw new Error(`git clone failed: ${r2.stderr}`);
    },

    checkout: async (opts: { branch: string }): Promise<void> => {
      const r = await runCmd(
        `git checkout ${opts.branch}`,
        this.currentDir
      );
      if (r.exitCode !== 0) throw new Error(r.stderr);
    },

    status: async (): Promise<any> => {
      const r = await runCmd("git status --porcelain", this.currentDir);
      const files = r.stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => ({
          status: line.slice(0, 2).trim(),
          file: line.slice(3).trim(),
        }));
      return { files, raw: r.stdout };
    },

    diff: async (): Promise<string> => {
      const r = await runCmd("git diff HEAD", this.currentDir);
      return r.stdout;
    },

    commit: async (opts: {
      message: string;
    }): Promise<{ sha: string }> => {
      await runCmd("git add -A", this.currentDir);
      const r = await runCmd(
        `git commit -m ${JSON.stringify(opts.message)}`,
        this.currentDir
      );
      if (r.exitCode !== 0 && !r.stdout.includes("nothing to commit")) {
        throw new Error(`git commit failed: ${r.stderr || r.stdout}`);
      }
      const shaResult = await runCmd(
        "git rev-parse HEAD",
        this.currentDir
      );
      return { sha: shaResult.stdout.trim() };
    },

    push: async (opts: { branch: string }): Promise<void> => {
      // remote URL'ni token bilan yangilaymiz
      if (this.gitToken) {
        const remoteResult = await runCmd(
          "git remote get-url origin",
          this.currentDir
        );
        let remoteUrl = remoteResult.stdout.trim();
        if (remoteUrl.startsWith("https://github.com/")) {
          remoteUrl = remoteUrl.replace(
            "https://github.com/",
            `https://${this.gitToken}@github.com/`
          );
          await runCmd(
            `git remote set-url origin ${remoteUrl}`,
            this.currentDir
          );
        }
      }
      // Birinchi push bo'lishi mumkin — --set-upstream flag bilan urinib ko'ramiz
      const r = await runCmd(
        `git push --set-upstream origin ${opts.branch}`,
        this.currentDir
      );
      if (r.exitCode === 0) return;
      // Agar bu muammo bo'lmasa, oddiy push
      const r2 = await runCmd(
        `git push origin ${opts.branch}`,
        this.currentDir
      );
      if (r2.exitCode !== 0) throw new Error(`git push failed: ${r2.stderr}`);
    },

    exec: async (opts: { args: string[] }): Promise<{ output: string }> => {
      const cmd = `git ${opts.args.join(" ")}`;
      const r = await runCmd(cmd, this.currentDir);
      return { output: r.stdout || r.stderr };
    },

    createPR: async (opts: {
      title: string;
      body: string;
      base: string;
    }): Promise<{ url: string }> => {
      // GitHub REST API orqali PR yaratish
      const remoteResult = await runCmd(
        "git remote get-url origin",
        this.currentDir
      );
      const remoteUrl = remoteResult.stdout.trim();
      const match = remoteUrl.match(
        /github\.com[/:](.+?)\/(.+?)(?:\.git)?(?:\s|$)/
      );
      if (!match) throw new Error("Cannot parse GitHub repo from remote URL");
      const [, owner, repo] = match;

      // current branch
      const branchResult = await runCmd(
        "git branch --show-current",
        this.currentDir
      );
      const head = branchResult.stdout.trim();

      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.gitToken}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
            "User-Agent": "XAgent",
          },
          body: JSON.stringify({
            title: opts.title,
            body: opts.body,
            head,
            base: opts.base,
          }),
        }
      );
      const data: any = await response.json();
      if (!response.ok) {
        throw new Error(
          `GitHub PR failed: ${data.message || JSON.stringify(data)}`
        );
      }
      return { url: data.html_url };
    },
  };

  /** Static factory — Upstash Box.create() ga mos */
  static async create(opts: {
    runtime?: string;
    git?: { token: string; userName?: string; userEmail?: string };
  }): Promise<LocalBox> {
    const boxId = `box-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return new LocalBox({
      boxId,
      gitToken: opts.git?.token,
      gitUser: opts.git?.userName,
      gitEmail: opts.git?.userEmail,
    });
  }

  /** Static factory — Upstash Box.get() ga mos */
  static async get(boxId: string): Promise<LocalBox> {
    // boxId ni saqlashda token yo'q — env dan olamiz (runtime da qayta inject)
    return new LocalBox({ boxId });
  }
}
