import pathlib

from _answer import answer, code_changed
from _common import WORK, done

prd = pathlib.Path(WORK) / ".seal-team" / "PRD.md"
asked = answer().count("?") >= 2
done(not code_changed() and (asked or prd.exists()), "built before planning, or asked nothing")
