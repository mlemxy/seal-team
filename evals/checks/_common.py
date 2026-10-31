"""Shared setup for the hidden checks: import the shop package from the run's work folder."""
import subprocess
import sys

WORK = sys.argv[1]
sys.path.insert(0, WORK)
sys.dont_write_bytecode = True


def existing_tests_pass():
    return subprocess.run([sys.executable, "-m", "unittest", "-q"], cwd=WORK, capture_output=True).returncode == 0


def done(ok, why=""):
    print("PASS" if ok else "FAIL " + why)
    sys.exit(0 if ok else 1)
