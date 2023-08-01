import pygame
import SectorHelper

# Initialize Pygame
pygame.init()

sector_helper = SectorHelper.SectorHelper()

# Set up the window
window_size = (1200, 1000)
screen = pygame.display.set_mode(window_size)
pygame.display.set_caption("Grid Example")

# Set up the grid
cell_size = (25, 25)
grid_size = (window_size[0]//cell_size[0], window_size[1]//cell_size[1])

# Set up the colors
white = (255, 255, 255)
black = (0, 0, 0)

frame_counter = 0
sector_helper.getSectors(["0,0", "1,0", "0,1", "1,1"])
topLeftCell = [0, 0]

# Main game loop
running = True
while running:
    # Handle events
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            x, y = event.pos
            x = x // cell_size[0]
            y = y // cell_size[1]
            sector_helper.drawPixel(x, y, (0, 255, 0))
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_LEFT:
                topLeftCell[0] -= 1
            elif event.key == pygame.K_RIGHT:
                topLeftCell[0] += 1
            elif event.key == pygame.K_UP:
                topLeftCell[1] -= 1
            elif event.key == pygame.K_DOWN:
                topLeftCell[1] += 1
    
    # Clear the screen
    screen.fill(white)

    bottomRightCell = (grid_size[0]+topLeftCell[0], grid_size[1]+topLeftCell[1])

    if frame_counter % 60 == 0:
        sector_helper.getSectorsInViewport(topLeftCell[0], topLeftCell[1], bottomRightCell[0], bottomRightCell[1])

    for sector in sector_helper.sector_cache.values():
        for pixel in sector.pixels:
            x, y = pixel.split(",")
            x = int(x)
            y = int(y)
            color = tuple(sector.pixels[pixel])
            rect = pygame.Rect(x * cell_size[0], y * cell_size[1], cell_size[0], cell_size[1])
            pygame.draw.rect(screen, color, rect, 0)

    # Draw the grid
    for x in range(grid_size[0]):
        for y in range(grid_size[1]):
            rect = pygame.Rect(x * cell_size[0], y * cell_size[1], cell_size[0], cell_size[1])
            pygame.draw.rect(screen, black, rect, 1)

    # Update the screen
    pygame.display.flip()

    frame_counter += 1
    frame_counter %= 60
# Clean up
pygame.quit()

