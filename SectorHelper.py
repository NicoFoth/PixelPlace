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

    def createSector(self, x: int, y: int) -> None:
        """
        Creates a new sector at the given coordinates (x, y) if it doesn't exist yet.

        Args:
        - x (int): The x-coordinate of the sector.
        - y (int): The y-coordinate of the sector.
        """

        return db_handler.DB_Handler.createSector(x, y);

    def getSector(self, x: int, y: int) -> db_handler.Sector.Sector:
        """
        Returns the sector at the given coordinates (x, y), creating it if it doesn't exist yet.

        Args:
        - x (int): The x-coordinate of the sector.
        - y (int): The y-coordinate of the sector.

        Returns:
        - db_handler.Sector.Sector: The sector at the given coordinates.
        """

        # Check if the sector is already in the cache
        print(self.sector_cache.keys())
        if f"{x},{y}" in self.sector_cache.keys():
            return self.sector_cache[f"{x},{y}"]

        # If the sector is not in the cache, retrieve it from the database
        sector = db_handler.DB_Handler.getSector(x, y)

        # If the sector doesn't exist in the database, create it
        if sector is None:
            self.createSector(x, y)
            sector = db_handler.DB_Handler.getSector(x, y)
        
        # Add the sector to the cache and return it
        self.sector_cache[f"{x},{y}"] = sector
        return sector

    def getSectors(self, sector_list: List[str]) -> List[db_handler.Sector.Sector]:
        """
        Returns a list of sectors given a list of sector coordinates.

        Args:
        - sector_list (list): A list of tuples representing the (x, y) coordinates of the sectors.

        Returns:
        - list: A list of sectors.
        """

        sectors = []
        to_retrieve = []
        for sector in sector_list.copy():
            if sector in self.sector_cache:
                sector_list.remove(sector)
                if self.sector_cache[sector] is not None:
                    sectors.append(self.sector_cache[sector])
            else:
                to_retrieve.append(sector)
        
        if len(to_retrieve) > 0:
            new_sectors = db_handler.DB_Handler.getSectors(to_retrieve)
        
            for sector in new_sectors:
                if sector is not None:
                    sector_list.remove(f"{sector.scoord_x},{sector.scoord_y}")
                    self.sector_cache[f"{sector.scoord_x},{sector.scoord_y}"] = sector
                    sectors.append(sector)
            
            for non_existing_sector in sector_list:
                self.sector_cache[non_existing_sector] = None


        return sectors
    
    def getAllSectors(self) -> None:
        """
        Adds all sectors to the cache.
        """
        all_sectors = db_handler.DB_Handler.getAllSectors()
        for sector in all_sectors:
            self.sector_cache[f"{sector.scoord_x},{sector.scoord_y}"] = sector
    
    def getSectorsInViewport(self, topLeftCell: List[int], bottomRightCell: List[int]) -> List[db_handler.Sector.Sector|None]:
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
        sector.pixels[f"{x},{y}"] = color # type: ignore
        self.removeFromCache(scoord_x, scoord_y)
        self.addToCache(sector)
        db_handler.DB_Handler.updateSector(sector)
