import firebase_admin
import db_handler

sector_collection = db_handler.db.collection(u'sectors')

def onSnapshot(col_snapshot, changes, read_time):
    for change in changes:
        if change.type.name == "ADDED":
            print(f"Added: {change.document.id}")
        elif change.type.name == "MODIFIED":
            print(f"Modified: {change.document.id}")
        elif change.type.name == "REMOVED":
            print(f"Removed: {change.document.id}")


def main():
    sector_collection.on_snapshot(onSnapshot)
