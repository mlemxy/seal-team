#!/usr/bin/env python3
"""Run each eval task with and without a plugin and compare the results.

Each run gets a fresh git copy of fixture/, runs `claude -p` with only project settings (so your own
plugins, hooks and rules stay out and only the plugin under test loads), then the task's hidden check,
and records cost, tokens, time, lines changed and whether a test was added.

  python3 evals/run.py --arm none --arm seal-team=. --runs 3

Every run uses your Claude Code login and counts toward your usage. --budget caps each run (default $1).
"""
import argparse
import json
import pathlib
import shutil
import statistics
import subprocess
import sys
import tempfile
import time

HERE = pathlib.Path(__file__).resolve().parent
# Enough to read, edit and run the tests; anything else is denied, since -p has no one to ask.
ALLOWED = ["Bash(python3:*)", "Bash(git diff:*)", "Bash(git status:*)", "Bash(grep:*)", "Bash(ls:*)"]


def git(work, *args):
    return subprocess.run(["git", *args], cwd=work, capture_output=True, text=True)


def changed_lines(work):
    """Lines added and removed outside tests, and whether a new test function was written."""
    git(work, "add", "-A")
    added = removed = 0
    for line in git(work, "diff", "--cached", "--numstat", "HEAD").stdout.splitlines():
        plus, minus, name = line.split("\t")
        if plus != "-" and "test" not in name.lower():
            added, removed = added + int(plus), removed + int(minus)
    # A renamed call inside an old test is not a new test; a new `def test...` is.
    diff = git(work, "diff", "--cached", "-U0", "HEAD").stdout
    test_added = any(l.startswith("+") and l[1:].lstrip().startswith(("def test", "async def test")) for l in diff.splitlines())
    return added, removed, test_added


def read_stream(proc):
    """The final result event, and the subagent types the run started (seal-team:pebble, ...)."""
    out, agents = None, []
    for line in proc.stdout.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("type") == "result":
            out = event
        message = event.get("message")
        for block in (message.get("content") or []) if isinstance(message, dict) else []:
            if isinstance(block, dict) and block.get("type") == "tool_use" and block.get("name") in ("Agent", "Task"):
                agents.append((block.get("input") or {}).get("subagent_type") or "general-purpose")
    return out or {"is_error": True, "result": (proc.stderr or proc.stdout)[-500:]}, agents


def run_one(task, arm, plugin, model, budget):
    work = pathlib.Path(tempfile.mkdtemp(prefix=f"seal-eval-{task['id']}-"))
    try:
        shutil.copytree(HERE / "fixture", work, dirs_exist_ok=True)
        git(work, "init", "-q")
        git(work, "add", "-A")
        git(work, "-c", "user.name=eval", "-c", "user.email=eval@example.com", "commit", "-qm", "base")
        # Project settings only: the user's own plugins, hooks, rules and MCP servers stay out of every arm.
        cmd = ["claude", "-p", task["prompt"], "--setting-sources", "project", "--strict-mcp-config",
               "--output-format", "stream-json", "--verbose", "--model", model,
               "--max-budget-usd", str(budget), "--permission-mode", "acceptEdits", "--no-session-persistence",
               "--allowedTools", *ALLOWED]
        if plugin:
            cmd += ["--plugin-dir", str(pathlib.Path(plugin).resolve())]
        started = time.time()
        proc = subprocess.run(cmd, cwd=work, capture_output=True, text=True)
        seconds = round(time.time() - started, 1)
        out, agents = read_stream(proc)
        # The check reads the agent's final answer too, for tasks whose output is advice, not code.
        (work / ".eval-answer.txt").write_text(str(out.get("result") or ""))
        check = subprocess.run([sys.executable, str(HERE / "checks" / f"{task['id']}.py"), str(work)],
                               cwd=HERE / "checks", capture_output=True, text=True)
        (work / ".eval-answer.txt").unlink()
        added, removed, test_added = changed_lines(work)
        # Kept for failed runs only, so a failure can be read after the work folder is gone.
        diff = "" if check.returncode == 0 else git(work, "diff", "--cached", "HEAD").stdout[:6000]
    finally:
        shutil.rmtree(work, ignore_errors=True)
    usage = out.get("usage", {})
    error = str(out.get("result") or proc.stderr)[:300] if out.get("is_error") else ""
    return {
        "task": task["id"], "arm": arm, "pass": not error and check.returncode == 0, "check": check.stdout.strip()[:200],
        "error": error, "cost_usd": out.get("total_cost_usd", 0.0),
        "output_tokens": usage.get("output_tokens", 0),
        "input_tokens": sum(usage.get(k, 0) for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")),
        "seconds": seconds, "lines_added": added, "lines_removed": removed, "test_added": test_added,
        "agents": agents, "diff": diff,
    }


def summary(rows):
    print(f"\n{'arm':<12}{'pass':>7}{'cost $':>9}{'out tok':>9}{'seconds':>9}{'+lines':>8}{'tests':>7}")
    for arm in dict.fromkeys(r["arm"] for r in rows):
        rs = [r for r in rows if r["arm"] == arm]
        mean = lambda key: statistics.mean(r[key] for r in rs)
        print(f"{arm:<12}{sum(r['pass'] for r in rs) / len(rs):>7.0%}{mean('cost_usd'):>9.3f}{mean('output_tokens'):>9.0f}"
              f"{mean('seconds'):>9.0f}{mean('lines_added'):>8.1f}{sum(r['test_added'] for r in rs) / len(rs):>7.0%}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--arm", action="append", required=True, help="a name, or name=plugin-dir; an arm with no dir runs with no plugin")
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--task", action="append", help="task id to run (default: all)")
    ap.add_argument("--model", default="sonnet")
    ap.add_argument("--budget", type=float, default=1.0, help="max USD per run")
    ap.add_argument("--out", default=str(HERE / "results.jsonl"))
    args = ap.parse_args()
    tasks = [t for t in json.loads((HERE / "tasks.json").read_text()) if not args.task or t["id"] in args.task]
    arms = [(a.split("=", 1) + [None])[:2] for a in args.arm]
    rows = []
    with open(args.out, "a") as log:
        for task in tasks:
            for arm, plugin in arms:
                for n in range(args.runs):
                    r = run_one(task, arm, plugin, args.model, args.budget)
                    if r["error"] and not r["output_tokens"]:
                        sys.exit(f"claude never ran ({task['id']}, {arm}): {r['error']}")
                    rows.append(r)
                    log.write(json.dumps(r) + "\n")
                    log.flush()
                    print(f"{task['id']:<16}{arm:<12}run {n + 1}: {'PASS' if r['pass'] else 'FAIL'}  ${r['cost_usd']:.3f}  "
                          f"+{r['lines_added']} lines  {','.join(r['agents']) or 'no agents'}", flush=True)
    summary(rows)


if __name__ == "__main__":
    main()
