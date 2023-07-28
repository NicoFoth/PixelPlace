import db_handler

class SectorHelper:

    sector_size = 16

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

        sector = db_handler.DB_Handler.getSector(x, y)
        if sector is None:
            self.createSector(x, y)
            sector = db_handler.DB_Handler.getSector(x, y)
        return sector

    def getSectors(self, sector_list: list) -> list:
        """
        Returns a list of sectors given a list of sector coordinates.

        Args:
        - sector_list (list): A list of tuples representing the (x, y) coordinates of the sectors.

        Returns:
        - list: A list of sectors.
        """

        return db_handler.DB_Handler.getSectors(sector_list)

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
