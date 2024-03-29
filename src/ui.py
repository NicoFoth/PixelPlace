import pygame
import SectorHelper

sector_helper = None


def startUI():
    global sector_helper
    sector_helper = SectorHelper.SectorHelper()

    # Initialize Pygame
    pygame.init()

    # Set up the application icon
    icon = pygame.image.load("application_icon.png")
    pygame.display.set_icon(icon)

    # Set up the window
    window_size_default = (1300, 1000)
    flags = pygame.RESIZABLE
    screen = pygame.display.set_mode(window_size_default, flags)
    pygame.display.set_caption("PixelPlace by Nico Foth")

    # Set up the colors
    white = (255, 255, 255)
    black = (0, 0, 0)
    pixel_colors = [
        (0, 0, 0),
        (153, 153, 153),
        (255, 255, 255),
        (255, 53, 94),
        (253, 91, 120),
        (255, 96, 55),
        (255, 153, 51),
        (255, 255, 102),
        (204, 255, 0),
        (102, 255, 102),
        (22, 208, 203),
        (80, 191, 230),
        (156, 39, 176),
        (255, 0, 204),
    ]

    # Set up the grid
    color_button_size = (30, 30)
    color_picker_size = (50,
                         (color_button_size[1] + 10) * len(pixel_colors) + 10)
    cell_size = [25, 25]
    grid_size = ((screen.get_size()[0] - color_picker_size[0]) // cell_size[0],
                 screen.get_size()[1] // cell_size[1])
    grid_window_size = (grid_size[0] * cell_size[0],
                        grid_size[1] * cell_size[1])
    grid_window = pygame.Surface(grid_window_size)

    frame_counter = 0
    topLeftCell = [0, 0]
    current_pixel_color = 0

    def getCurrentCoordinates(mouse_pos: tuple):
        x, y = mouse_pos
        x = x // cell_size[0] + topLeftCell[0]
        y = y // cell_size[1] + topLeftCell[1]
        return (x, y)

    # Main game loop
    running = True
    middle_mouse_down = False
    middle_mouse_travel = [0, 0]
    while running:
        color_picker_rect = pygame.Rect(
            screen.get_size()[0] - color_picker_size[0],
            (screen.get_size()[1] - color_picker_size[1]) / 2,
            color_picker_size[0], color_picker_size[1])

        # Handle events
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                x, y = event.pos
                if grid_window.get_rect().collidepoint(x, y):
                    x = x // cell_size[0] + topLeftCell[0]
                    y = y // cell_size[1] + topLeftCell[1]
                    sector_helper.drawPixel(x, y,
                                            pixel_colors[current_pixel_color])
                elif color_picker_rect.collidepoint(x, y):
                    y -= color_picker_rect.y
                    current_pixel_color = y // 40
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

        grid_size = ((screen.get_size()[0] - color_picker_size[0]) //
                     cell_size[0], screen.get_size()[1] // cell_size[1])
        grid_window_size = (grid_size[0] * cell_size[0],
                            grid_size[1] * cell_size[1])
        grid_window = pygame.Surface(grid_window_size)

        # Clear the screen
        screen.fill(white)
        grid_window.fill(white)

        mouse_pos = getCurrentCoordinates(pygame.mouse.get_pos())

        bottomRightCell = [
            topLeftCell[0] + grid_size[0], topLeftCell[1] + grid_size[1]
        ]

        # Draw the pixels
        for sector in sector_helper.getSectorsInViewport(
                topLeftCell, bottomRightCell):
            if sector is None:
                continue
            for pixel in sector.pixels:
                x, y = pixel.split(",")
                x = int(x)
                y = int(y)
                if x - topLeftCell[0] >= grid_size[
                        0] or y - topLeftCell[1] >= grid_size[1]:
                    continue
                color = tuple(sector.pixels[pixel])
                rect = pygame.Rect((x - topLeftCell[0]) * cell_size[0],
                                   (y - topLeftCell[1]) * cell_size[1],
                                   cell_size[0], cell_size[1])
                pygame.draw.rect(grid_window, color, rect, 0)

        # Draw the cursor
        if grid_window.get_rect().collidepoint(pygame.mouse.get_pos()):
            x, y = pygame.mouse.get_pos()
            x = x // cell_size[0] * cell_size[0]
            y = y // cell_size[1] * cell_size[1]
            pygame.draw.rect(grid_window, (0, 0, 0),
                             pygame.Rect(x, y, cell_size[0], cell_size[1]), 1)

        # Draw a color picker on the right side of the screen
        pygame.draw.rect(screen, (128, 128, 128), color_picker_rect, 3)

        # Draw the color picker buttons
        color_rects = []
        for i in range(len(pixel_colors)):
            color_rects.append(
                pygame.Rect(screen.get_size()[0] - color_picker_size[0] + 10,
                            (screen.get_size()[1] - color_picker_size[1]) / 2 +
                            10 + i * (color_button_size[0] + 10),
                            color_button_size[1], color_button_size[1]))
        for i in range(len(color_rects)):
            pygame.draw.rect(screen, pixel_colors[i], color_rects[i], 0)

        # Draw the indicator for the current color
        indicator_rect = pygame.Rect(
            screen.get_size()[0] - color_picker_size[0] + 5,
            (screen.get_size()[1] - color_picker_size[1]) / 2 + 5 +
            current_pixel_color * 40, 40, 40)
        pygame.draw.rect(screen, (0, 0, 0), indicator_rect, 3)

        # Draw the current coordinates
        font = pygame.font.SysFont("Arial", 13)
        mouse_coord_headline = font.render("Coords:", True, (0, 0, 0))
        mouse_coord_x = font.render("x: " + str(mouse_pos[0]), True, (0, 0, 0))
        mouse_coord_y = font.render("y: " + str(mouse_pos[1]), True, (0, 0, 0))
        screen.blit(mouse_coord_headline,
                    (screen.get_size()[0] - color_picker_size[0], 0))
        screen.blit(mouse_coord_x,
                    (screen.get_size()[0] - color_picker_size[0], 10))
        screen.blit(mouse_coord_y,
                    (screen.get_size()[0] - color_picker_size[0], 20))

        screen.blit(grid_window, (0, 0))
        # Update the screen
        pygame.display.flip()

        frame_counter += 1
        frame_counter %= 300


# Clean up
pygame.quit()