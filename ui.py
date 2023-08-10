import pygame
import SectorHelper

# Initialize Pygame
pygame.init()

sector_helper = SectorHelper.SectorHelper()

# Set up the window
window_size = (1300, 1000)
screen = pygame.display.set_mode(window_size)
pygame.display.set_caption("PixelPlace by Nico Foth")

# Set up the colors
white = (255, 255, 255)
black = (0, 0, 0)
pixel_colors = [(255, 0, 0), (0, 255, 0), (0, 0, 255)]

# Set up the grid
color_picker_size = (50, 300)
cell_size = [25, 25]
grid_size = ((window_size[0]-color_picker_size[0])//cell_size[0], window_size[1]//cell_size[1])
grid_window_size = (grid_size[0]*cell_size[0], grid_size[1]*cell_size[1])
grid_window = pygame.Surface(grid_window_size)

frame_counter = 0
topLeftCell = [0, 0]
currentViewport = []
current_pixel_color = 0
color_rects = []
for i in range(len(pixel_colors)):
    color_rects.append(pygame.Rect(
        window_size[0] - color_picker_size[0] + 10,
        (window_size[1]-color_picker_size[1])/2 + 10 + i * 50,
        30, 30))

def getCurrentCoordinates(mouse_pos: tuple):
    x, y = mouse_pos
    x = x // cell_size[0] + topLeftCell[0]
    y = y // cell_size[1] + topLeftCell[1]
    return (x, y)


color_picker_rect = pygame.Rect(window_size[0] - color_picker_size[0], (window_size[1]-color_picker_size[1])/2, color_picker_size[0], color_picker_size[1])

# Main game loop
running = True
middle_mouse_down = False
middle_mouse_travel = [0, 0]
while running:
    # Handle events
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            x, y = event.pos
            if grid_window.get_rect().collidepoint(x, y):
                x = x // cell_size[0] + topLeftCell[0]
                y = y // cell_size[1] + topLeftCell[1]
                sector_helper.drawPixel(x, y, pixel_colors[current_pixel_color])
            elif color_picker_rect.collidepoint(x, y):
                    if y > (window_size[1]-color_picker_size[1])/2 + 10 and y < (window_size[1]-color_picker_size[1])/2 + 40:
                        current_pixel_color = 0
                    elif y > (window_size[1]-color_picker_size[1])/2 + 60 and y < (window_size[1]-color_picker_size[1])/2 + 90:
                        current_pixel_color = 1
                    elif y > (window_size[1]-color_picker_size[1])/2 + 110 and y < (window_size[1]-color_picker_size[1])/2 + 140:
                        current_pixel_color = 2
        elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 2:
            x, y = event.pos
            if grid_window.get_rect().collidepoint(x, y):
                middle_mouse_down = True
        elif event.type == pygame.MOUSEBUTTONUP and event.button == 2:
            middle_mouse_down = False
            middle_mouse_travel = [0, 0]
        elif event.type == pygame.MOUSEMOTION and middle_mouse_down:
            x, y = event.rel
            middle_mouse_travel[0] -= x
            middle_mouse_travel[1] -= y
            if middle_mouse_travel[0] >= cell_size[0]:
                topLeftCell[0] += 1
                middle_mouse_travel[0] -= cell_size[0]
            elif middle_mouse_travel[0] <= -cell_size[0]:
                topLeftCell[0] -= 1
                middle_mouse_travel[0] += cell_size[0]
            if middle_mouse_travel[1] >= cell_size[1]:
                topLeftCell[1] += 1
                middle_mouse_travel[1] -= cell_size[1]
            elif middle_mouse_travel[1] <= -cell_size[1]:
                topLeftCell[1] -= 1
                middle_mouse_travel[1] += cell_size[1]
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_LEFT:
                topLeftCell[0] -= 1
            elif event.key == pygame.K_RIGHT:
                topLeftCell[0] += 1
            elif event.key == pygame.K_UP:
                topLeftCell[1] -= 1
            elif event.key == pygame.K_DOWN:
                topLeftCell[1] += 1
        elif event.type == pygame.MOUSEWHEEL:
            if event.y == 1:
                if cell_size[0] < 50 and cell_size[1] < 50:
                    cell_size[0] += 1
                    cell_size[1] += 1
            elif event.y == -1:
                if cell_size[0] > 5 and cell_size[1] > 1:
                    cell_size[0] -= 1
                    cell_size[1] -= 1
    

    grid_size = ((window_size[0]-color_picker_size[0])//cell_size[0], window_size[1]//cell_size[1])
    grid_window_size = (grid_size[0]*cell_size[0], grid_size[1]*cell_size[1])
    grid_window = pygame.Surface(grid_window_size)

    # Clear the screen
    screen.fill(white)
    grid_window.fill(white)

    mouse_pos = getCurrentCoordinates(pygame.mouse.get_pos())

    # Update the viewport every second
    if frame_counter % 300 == 0:
        sector_helper.getAllSectors()

    # Draw the pixels
    for sector in sector_helper.sector_cache.values():
        for pixel in sector.pixels:
            x, y = pixel.split(",")
            x = int(x)
            y = int(y)
            if x - topLeftCell[0] >= grid_size[0] or y - topLeftCell[1] >= grid_size[1]:
                continue
            color = tuple(sector.pixels[pixel])
            rect = pygame.Rect((x-topLeftCell[0]) * cell_size[0], (y-topLeftCell[1]) * cell_size[1], cell_size[0], cell_size[1])
            pygame.draw.rect(grid_window, color, rect, 0)

    # Draw the cursor
    if grid_window.get_rect().collidepoint(pygame.mouse.get_pos()):
        x, y = pygame.mouse.get_pos()
        x = x // cell_size[0] * cell_size[0]
        y = y // cell_size[1] * cell_size[1]
        pygame.draw.rect(grid_window, (0, 0, 0), pygame.Rect(x, y, cell_size[0], cell_size[1]), 1)

    # Draw a color picker on the right side of the screen
    pygame.draw.rect(screen, (128, 128, 128), color_picker_rect, 3)

    # Draw the color picker buttons
    for i in range(len(color_rects)):
        pygame.draw.rect(screen, pixel_colors[i], color_rects[i], 0)

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


    screen.blit(grid_window, (0, 0))
    # Update the screen
    pygame.display.flip()

    frame_counter += 1
    frame_counter %= 300
# Clean up
pygame.quit()

