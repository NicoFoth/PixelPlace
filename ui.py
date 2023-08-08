import pygame
import SectorHelper

# Initialize Pygame
pygame.init()

sector_helper = SectorHelper.SectorHelper()

# Set up the window
window_size = (1300, 1000)
screen = pygame.display.set_mode(window_size)
pygame.display.set_caption("PixelPlace by Nico Foth")

# Set up the grid
color_picker_size = (50, 300)
cell_size = (25, 25)
grid_size = ((window_size[0]-color_picker_size[0])//cell_size[0], window_size[1]//cell_size[1])

# Set up the colors
white = (255, 255, 255)
black = (0, 0, 0)
pixel_colors = [(255, 0, 0), (0, 255, 0), (0, 0, 255)]

frame_counter = 0
topLeftCell = [0, 0]
currentViewport = []
current_pixel_color = 0

def updateViewport(topLeftCell: list) -> None:
    bottomRightCell = [grid_size[0]+topLeftCell[0], grid_size[1]+topLeftCell[1]]
    currentViewport.clear()
    currentViewport.extend(sector_helper.getSectorsInViewport(topLeftCell[0], topLeftCell[1], bottomRightCell[0], bottomRightCell[1]))

def getCurrentCoordinates(mouse_pos: tuple):
    x, y = mouse_pos
    x = x // cell_size[0] + topLeftCell[0]
    y = y // cell_size[1] + topLeftCell[1]
    return (x, y)


# Main game loop
running = True
while running:
    # Handle events
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            x, y = event.pos
            if x > window_size[0] - color_picker_size[0]:
                if x > window_size[0] - color_picker_size[0] + 10 and x < window_size[0] - color_picker_size[0] + 40:
                    if y > (window_size[1]-color_picker_size[1])/2 + 10 and y < (window_size[1]-color_picker_size[1])/2 + 40:
                        current_pixel_color = 0
                    elif y > (window_size[1]-color_picker_size[1])/2 + 60 and y < (window_size[1]-color_picker_size[1])/2 + 90:
                        current_pixel_color = 1
                    elif y > (window_size[1]-color_picker_size[1])/2 + 110 and y < (window_size[1]-color_picker_size[1])/2 + 140:
                        current_pixel_color = 2
            x = x // cell_size[0] + topLeftCell[0]
            y = y // cell_size[1] + topLeftCell[1]
            sector_helper.drawPixel(x, y, pixel_colors[current_pixel_color])
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

    mouse_pos = getCurrentCoordinates(pygame.mouse.get_pos())

    # Update the viewport every second
    if frame_counter % 60 == 0:
        updateViewport(topLeftCell)

    # Draw the pixels
    for sector in currentViewport:
        for pixel in sector.pixels:
            x, y = pixel.split(",")
            x = int(x)
            y = int(y)
            if x - topLeftCell[0] >= grid_size[0] or y - topLeftCell[1] >= grid_size[1]:
                continue
            color = tuple(sector.pixels[pixel])
            rect = pygame.Rect((x-topLeftCell[0]) * cell_size[0], (y-topLeftCell[1]) * cell_size[1], cell_size[0], cell_size[1])
            pygame.draw.rect(screen, color, rect, 0)

    # Draw the grid
    for x in range(grid_size[0]):
        for y in range(grid_size[1]):
            rect = pygame.Rect(x * cell_size[0], y * cell_size[1], cell_size[0], cell_size[1])
            pygame.draw.rect(screen, black, rect, 1)

    # Draw a color picker on the right side of the screen
    color_picker_rect = pygame.Rect(window_size[0] - color_picker_size[0], (window_size[1]-color_picker_size[1])/2, color_picker_size[0], color_picker_size[1])
    pygame.draw.rect(screen, (128, 128, 128), color_picker_rect, 3)

    # Draw the color picker buttons
    for i in range(3):
        color_rect = pygame.Rect(window_size[0] - color_picker_size[0] + 10, (window_size[1]-color_picker_size[1])/2 + 10 + i * 50, 30, 30)
        pygame.draw.rect(screen, pixel_colors[i], color_rect, 0)

    # Draw the indicator for the current color
    indicator_rect = pygame.Rect(window_size[0] - color_picker_size[0] + 5, (window_size[1]-color_picker_size[1])/2 + 5 + current_pixel_color * 50, 40, 40)
    pygame.draw.rect(screen, (0, 0, 0), indicator_rect, 3)

    # Draw the current coordinates
    font = pygame.font.SysFont("Arial", 13)
    mouse_coord_headline = font.render("Coords:", True, (0, 0, 0))
    mouse_coord_x = font.render("x: " + str(mouse_pos[0]), True, (0, 0, 0))
    mouse_coord_y = font.render("y: " + str(mouse_pos[1]), True, (0, 0, 0))
    screen.blit(mouse_coord_headline, (window_size[0]-color_picker_size[0], 0))
    screen.blit(mouse_coord_x, (window_size[0]-color_picker_size[0], 10))
    screen.blit(mouse_coord_y, (window_size[0]-color_picker_size[0], 20))

    # Update the screen
    pygame.display.flip()

    frame_counter += 1
    frame_counter %= 300
# Clean up
pygame.quit()

