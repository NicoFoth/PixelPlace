import db_handler

class SectorHelper:

    sector_size = 16
    sector_cache = {}

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

    def getSectors(self, sector_list: list) -> list:
        """
        Returns a list of sectors given a list of sector coordinates.

        Args:
        - sector_list (list): A list of tuples representing the (x, y) coordinates of the sectors.

        Returns:
        - list: A list of sectors.
        """

        sectors = []
        to_retrieve = []
        for sector in sector_list:
            if sector in self.sector_cache:
                sectors.append(self.sector_cache[sector])
            else:
                to_retrieve.append(sector)
        
        if len(to_retrieve) > 0:
            new_sectors = db_handler.DB_Handler.getSectors(to_retrieve)
        
            for sector in new_sectors:
                self.sector_cache[f"{sector.scoord_x},{sector.scoord_y}"] = sector
                sectors.append(sector)

        return sectors

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
        sector.pixels[f"{x},{y}"] = color # type: ignore
        db_handler.DB_Handler.updateSector(sector)
