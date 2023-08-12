from typing import List, Dict, Any
import firebase_admin
import db_handler, ui

sector_collection = db_handler.db.collection(u'sector')

def createSectorObject(sector_document: Dict[str, Any]) -> db_handler.Sector.Sector:
    """
    Creates a Sector object from a sector document.

    Args:
        sector_document (dict): The sector document.

    Returns:
        db_handler.Sector.Sector: The sector object.
    """

    x = sector_document["scoord_x"]
    y = sector_document["scoord_y"]
    pixels = sector_document["pixels"]
    last_update = sector_document["last_update"]
    sector = db_handler.Sector.Sector(scoord_x=x, scoord_y=y, pixels=pixels, last_update=last_update)
    return sector


def onSnapshot(col_snapshot: List[Any], changes: List[Any], read_time: Any) -> None:
    print(type(read_time))
    for change in changes:
        if change.type.name == "ADDED":
            new_sector = createSectorObject(change.document.to_dict())
            ui.sector_helper.addToCache(new_sector)
        elif change.type.name == "MODIFIED":
            new_sector = createSectorObject(change.document.to_dict())
            ui.sector_helper.addToCache(new_sector)
        elif change.type.name == "REMOVED":
            x, y = change.document.id.split(",")
            ui.sector_helper.removeFromCache(int(x), int(y))


def main() -> None:
    sector_collection.on_snapshot(onSnapshot)
