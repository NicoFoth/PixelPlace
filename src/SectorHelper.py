from typing import List
from src import db_handler


class SectorHelper:

    sector_size = 64
    sector_cache = {}

    def clearCache(self) -> None:
        """
        Clears the sector cache.
        """

        self.sector_cache = {}

    def addToCache(self, sector: db_handler.Sector.Sector) -> None:
        """
        Adds the given sector to the cache.

        Args:
        - sector (db_handler.Sector.Sector): The sector to add to the cache.
        """

        self.sector_cache[f"{sector.scoord_x},{sector.scoord_y}"] = sector

    def removeFromCache(self, x: int, y: int) -> None:
        """
        Removes the sector at the given coordinates (x, y) from the cache.

        Args:
        - x (int): The x-coordinate of the sector.
        - y (int): The y-coordinate of the sector.
        """

        if f"{x},{y}" in self.sector_cache.keys():
            self.sector_cache.pop(f"{x},{y}")

    def createSector(self, x: int, y: int) -> db_handler.Sector.Sector:
        """
        Creates a new sector at the given coordinates (x, y) if it doesn't exist yet.

        Args:
        - x (int): The x-coordinate of the sector.
        - y (int): The y-coordinate of the sector.
        """
        return db_handler.DB_Handler.createSector(x, y)

    def drawPixel(self, x: int, y: int, color: tuple) -> None:
        """
        Draws a pixel at the given coordinates (x, y) with the given color.

        Args:
        - x (int): The x-coordinate of the pixel.
        - y (int): The y-coordinate of the pixel.
        - color (tuple): A tuple representing the RGB color of the pixel.
        """

        scoord_x = x // self.sector_size
        scoord_y = y // self.sector_size
        sector = db_handler.DB_Handler.getSector(scoord_x, scoord_y)
        if sector is None:
            self.createSector(scoord_x, scoord_y)
            sector = db_handler.DB_Handler.getSector(scoord_x, scoord_y)
        sector.pixels[f"{x},{y}"] = color  # type: ignore
        self.removeFromCache(scoord_x, scoord_y)
        self.addToCache(sector)
        db_handler.DB_Handler.updateSector(sector)
