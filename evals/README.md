# Evals

Does Seal Team really do better than plain Claude Code? These evals answer with numbers instead of claims.

`fixture/` is a tiny shop app with six planted problems. `tasks.json` asks for each fix the way a user would, including one request that asks for far more than it needs (`overbuilt-cache`). After every run a hidden check in `checks/` decides pass or fail, and the runner records cost, tokens, time, lines of code added, and whether a test was added.

```
python3 evals/run.py --arm none --arm seal-team=. --runs 3
```

- Runs load project settings only, so your own plugins, hooks and rules stay out and each arm loads only its own plugin. They use your Claude Code login and count toward your usage. `--budget` caps each run (default $1).
- Run it from a normal terminal where `claude` is logged in.
- Results are appended to `evals/results.jsonl` and summed up per arm at the end.
- Six tasks are a smoke test, not a benchmark: use at least three runs per arm and treat small differences as noise.
