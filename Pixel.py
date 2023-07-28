import Sector

SECTOR_SIZE = 16

class PixelHelper:

    def drawPixel(x, y, color):
        scoord_x = x // SECTOR_SIZE
        scoord_y = y // SECTOR_SIZE
        if (scoord_x, scoord_y) not in Sector.sectors:
            Sector(scoord_x, scoord_y).updatePixel(x, y, color)
        else:
            Sector.sectors[(scoord_x, scoord_y)].updatePixel(x, y, color)
