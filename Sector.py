import time

import time

class Sector:

    # Sector coordinates
    scoords = (0, 0)
    # Dictionary of pixel objects in sector
    pixels = {}
    # Time of last update in the sector
    last_update = 0

    def __init__(self, x: int, y: int) -> None:

        self.scoords = (x, y)
        self.pixels = {}
        self.last_update = time.time()

    def updatePixel(self, x: int, y:int, color: tuple) -> None:

        self.pixels[(x, y)] = color
        self.last_update = time.time()


class SectorHelper:

    sector_size = 16
    sectors = {}

    def createSector(self, x: int, y: int) -> None:
        if (x, y) not in self.sectors:
            self.sectors[(x, y)] = Sector(x, y)

    def getSector(self, x:int , y: int) -> Sector:
        if (x, y) not in self.sectors:
            self.createSector(x, y)
        return self.sectors[(x, y)]

    def drawPixel(self, x: int, y: int, color: tuple) -> None:
        scoord_x = x // self.sector_size
        scoord_y = y // self.sector_size
        self.getSector(scoord_x, scoord_y).updatePixel(x, y, color)