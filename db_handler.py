import os
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
    def createSector(x: int, y: int) -> None:
        """
        Creates a new sector with the given coordinates and saves it to the database.

        Args:
            x (int): The x-coordinate of the sector.
            y (int): The y-coordinate of the sector.

        Returns:
            None
        """

        sector = Sector.Sector()
        sector.id = f"{x},{y}" # type: ignore
        sector.scoord_x = x # type: ignore
        sector.scoord_y = y # type: ignore
        sector.pixels = {} # type: ignore
        sector.last_update = firestore.SERVER_TIMESTAMP # type: ignore
        sector.save()

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
        return sector # type: ignore

    @staticmethod
    def getSectors(sector_list) -> list:
        """
        Retrieves a list of sectors from the database.

        Args:
            sector_list: A list of sector coordinates in the format [(x1, y1), (x2, y2), ...]

        Returns:
            list: A list of Sector.Sector objects.
        """

        sectors = Sector.Sector.collection.get_all(sector_list)
        return sectors # type: ignore
    
    @staticmethod
    def getAllSectors() -> list:
        """
        Returns a list of all sectors.

        Returns:
        - list: A list of sectors.
        """

        sectors = Sector.Sector.collection.fetch()
        return sectors # type: ignore

    @staticmethod
    def updateSector(sector: Sector.Sector) -> None:
        """
        Updates the given sector in the database.

        Args:
            sector (Sector.Sector): The sector to update.

        Returns:
            None
        """
        
        sector.last_update = firestore.SERVER_TIMESTAMP # type: ignore
        sector.save()
