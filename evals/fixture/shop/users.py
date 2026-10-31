import json
from pathlib import Path

USERS_FILE = Path(__file__).with_name("users.json")


def get_user(user_id):
    """Look a user up by id. Reads the users file every time."""
    users = json.loads(USERS_FILE.read_text())
    return users.get(str(user_id))
