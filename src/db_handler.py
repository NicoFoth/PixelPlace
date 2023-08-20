import os
from typing import List
import firebase_admin, fireo
from firebase_admin import firestore, credentials
import Sector

cwd = os.getcwd() + "/gcp_key.json"

cred = credentials.Certificate(cwd)
firebase_admin.initialize_app(cred)
db = firestore.client()
fireo.connection(from_file=cwd)


class DB_Handler():

    @staticmethod
    def createSector(x: int, y: int) -> Sector.Sector:
        """
        Creates a new sector with the given coordinates and saves it to the database.

        Args:
            x (int): The x-coordinate of the sector.
            y (int): The y-coordinate of the sector.

        Returns:
            None
        """

        sector = Sector.Sector()
        sector.id = f"{x},{y}"  # type: ignore
        sector.scoord_x = x  # type: ignore
        sector.scoord_y = y  # type: ignore
        sector.pixels = {}  # type: ignore
        sector.last_update = firestore.SERVER_TIMESTAMP  # type: ignore
        sector.save()
        return sector

    @staticmethod
    def getSector(x: int, y: int) -> Sector.Sector:
        """
        Retrieves the sector with the given coordinates from the database.

        Args:
            x (int): The x-coordinate of the sector.
            y (int): The y-coordinate of the sector.

        Returns:
            Sector.Sector: The sector with the given coordinates.
        """

        sector = Sector.Sector.collection.get(f"{x},{y}")
        return sector  # type: ignore

    @staticmethod
    def updateSector(sector: Sector.Sector) -> None:
        """
        Updates the given sector in the database.

        Args:
            sector (Sector.Sector): The sector to update.

        Returns:
            None
        """

        sector.last_update = firestore.SERVER_TIMESTAMP  # type: ignore
        sector.save()
