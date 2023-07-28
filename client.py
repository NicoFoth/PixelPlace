import pygame

pixel_proportion = 8


def main(win_x, win_y):
    pygame.init()
    display = pygame.display.set_mode(tuple(map(lambda x: pixel_proportion*x, (win_x, win_y))))
    display.fill((0, 90, 0))

    while True:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                return

        pygame.display.update()


def draw_chunk(chunk):
    return

def get_relevant_chunks(x, y):
    pattern1 = [[(255, 255, 255) for _ in  range(16)] for _ in range (16) ]
    pattern2 = [[(j*i % 255, (j*i + i*5) % 255,  (j*i + j*5) % 255) for j in  range(16)] for i in range (16) ]
    chunk0 = [pattern1, (0, 15), (15, 0)]
    chunk1 = shift_chunk(chunk0, 0, 0)
    chunk2 = shift_chunk(chunk0, 0,-1)
    chunk3 = shift_chunk(chunk0,-1,-1) 
    chunk4 = shift_chunk(chunk0,-1, 0)
    return [chunk1,chunk2,chunk3,chunk4]

# returns a new chunk with the same pattern, but shifted d_ many chunks along the x and y axis
def shift_chunk(chunk, dx, dy):
    pattern = chunk[0]
    start_cords = chunk[1]
    end_cords   = chunk[2]
    return [pattern, shift(start_cords, 16*dx, 16*dy), shift(end_cords, 16*dx, 16*dy)]

# returns cordinates, that have been shifted d_ many pixels along the x and y axis
def shift_cords(cords, dx, dy):
    (x, y) = cords
    return (x+dx, y+dy)


if __name__ == "__main__":
    main(32, 32)
