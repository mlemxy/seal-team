"""Helpers for checks that read the agent's final answer and the files it left."""
import pathlib
import subprocess

from _common import WORK


def answer():
    return (pathlib.Path(WORK) / ".eval-answer.txt").read_text().lower()


def code_changed():
    """Whether anything outside seal-team/ and the answer file changed."""
    out = subprocess.run(["git", "status", "--porcelain", "--untracked-files=all"], cwd=WORK, capture_output=True, text=True).stdout
    return any(not (line[3:].startswith("seal-team/") or line[3:] == ".eval-answer.txt") for line in out.splitlines())
