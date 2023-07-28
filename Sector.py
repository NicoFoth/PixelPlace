import time

sectors = {}

class Sector:
    
    # Sector coordinates
    scoords = (0, 0)
    # Dictionary of pixel objects in sector
    pixels = {}
    # Time of last update in the sector
    last_update = 0

    def __init__(self, x, y) -> None:
        self.scoords = (x, y)
        self.pixels = {}
        self.last_update = time.time()
        sectors[(x, y)] = self

    def updatePixel(self, x, y, color) -> None:
        self.pixels[(x, y)] = color
        self.last_update = time.time()
