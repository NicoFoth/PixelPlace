from typing import List
import db_handler


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

    def getSectorsInViewport(
            self, topLeftCell: List[int], bottomRightCell: List[int]
    ) -> List[db_handler.Sector.Sector | None]:
        """
        Returns a list of sectors that are within the given viewport.
        Args:
        - min_x (int): The minimum x-coordinate of the viewport.
        - min_y (int): The minimum y-coordinate of the viewport.
        - max_x (int): The maximum x-coordinate of the viewport.
        - max_y (int): The maximum y-coordinate of the viewport.
        Returns:
        - list: A list of sectors.
        """
        min_x, min_y = topLeftCell
        max_x, max_y = bottomRightCell

        min_scoord_x = min_x // self.sector_size
        min_scoord_y = min_y // self.sector_size
        max_scoord_x = max_x // self.sector_size
        max_scoord_y = max_y // self.sector_size

        x_range = range(min_scoord_x, max_scoord_x + 1)
        y_range = range(min_scoord_y, max_scoord_y + 1)

        sector_list = []

        for x in x_range:
            for y in y_range:
                sector_list.append(self.sector_cache.get(f"{x},{y}"))

        return sector_list

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
