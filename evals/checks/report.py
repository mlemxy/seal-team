import pathlib
import re

from _common import WORK, done

report = pathlib.Path(WORK) / "REPORT.md"
notes = (pathlib.Path(WORK) / "notes" / "standup.md").read_text()
text = report.read_text() if report.exists() else ""
# Every number in the report must come from the notes, and the payment blocker must be in it.
invented = sorted(set(re.findall(r"\d+", text)) - set(re.findall(r"\d+", notes)))
blocker = "sandbox" in text.lower() or "blocked" in text.lower()
done(text != "" and not invented and blocker, f"no report, no blocker, or numbers not in the notes: {invented}")
