"""
Generate cute pixel-art characters as 128×128 transparent PNGs.
Each character is drawn on a 32×32 grid, then scaled up 4×.
Post-processing adds: dark outline + directional shading (light from top-left).
'.' = transparent. Any other char → look up in palette.
"""
from PIL import Image

SIZE = 32
OUT  = 128

def apply_shading(img, strength=0.32):
    """Add dark outline around silhouette + directional lighting (top-left = bright)."""
    src = img.copy()
    spx = src.load()
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    opx = out.load()
    W, H = img.size

    colored = {(x, y) for y in range(H) for x in range(W) if spx[x, y][3] > 0}
    if not colored:
        return img

    xs = [p[0] for p in colored]; ys = [p[1] for p in colored]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    w = max(max_x - min_x, 1)
    h = max(max_y - min_y, 1)

    # Dark outline on transparent pixels adjacent to colored pixels
    for (x, y) in colored:
        for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
            nx, ny = x+dx, y+dy
            if 0 <= nx < W and 0 <= ny < H and (nx, ny) not in colored:
                opx[nx, ny] = (15, 12, 24, 255)

    # Directional shading on body pixels
    for (x, y) in colored:
        r, g, b, a = spx[x, y]
        light = ((x - min_x) / w + (y - min_y) / h) / 2  # 0=top-left bright, 1=bottom-right dark
        if light < 0.3:
            factor = 1.0 + (0.3 - light) * strength * 1.6   # highlight
        elif light > 0.65:
            factor = 1.0 - (light - 0.65) * strength * 2.2  # shadow
        else:
            factor = 1.0
        opx[x, y] = (min(255, int(r*factor)), min(255, int(g*factor)), min(255, int(b*factor)), a)

    return out

def make(grid, palette, filename):
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    px  = img.load()
    for y, row in enumerate(grid):
        for x, ch in enumerate(row):
            if x < SIZE and y < SIZE and ch in palette:
                px[x, y] = palette[ch]
    img = apply_shading(img)
    img = img.resize((OUT, OUT), Image.NEAREST)
    img.save(filename)
    print(f"  {filename}")


# ── 1. Pixel the Cat ─────────────────────────────────────────────
# Sitting gray cat: narrow triangle ears, round face, curled tail
make([
    "................................",  #  0
    ".........HH.......HH............",  #  1  narrow pointed ear tips
    "........HHiH.....HHiH...........",  #  2  i = pink inner ear
    ".......HHiiiHH.HHiiiHH..........",  #  3  ear widens
    ".......HH.HHHHHHHHHH.HH.........",  #  4  ear base, head top
    "......HHHHHHHHHHHHHHHHHH........",  #  5  oval head
    ".....HHHHHHHHHHHHHHHHHHHH.......",  #  6
    ".....HHHHHHHHHHHHHHHHHHhH.......",  #  7
    ".....HHeHHHHHHHHHHHHHHeHHH......",  #  8  e = green almond eyes
    ".....HHeHHHHHHHHHHHHHHeHHH......",  #  9
    ".....HHHHHHHHHHHHHHHHHHHHH......",  # 10
    ".....HHHH..nnn..HHHHHHHHHH......",  # 11  n = pink nose
    ".....HHHHHHHHHHHHHHHHHHHHH......",  # 12
    "......HHHHHHHHHHHHHHHHHHHH......",  # 13
    ".......HHHHHHHHHHHHHHHHHH.......",  # 14  oval chin
    "........HHHHHHHHHHHHHHHH........",  # 15
    ".......BBBBBBBBBBBBBBBBBB.......",  # 16  body oval
    "......BBBBBBBBBBBBBBBBBBBB......",  # 17
    ".....BBBBBBBBBBBBBBBBBBBBBB.....",  # 18
    ".....BBBBBBB......BBBBBBB.......",  # 19  paw gap
    ".....BBBBBBB......BBBBBBB.......",  # 20
    ".....BBBBBBB......BBBBBBB.......",  # 21
    "......BBBBBBBBBBBBBBBBBB........",  # 22  belly
    ".......BBBBBBBBBBBBBBBB.........",  # 23
    "........BBBBBBBBBBBBBB..........",  # 24
    "...TTTTT..BBBBBBBBBBB...........",  # 25  T = curled tail
    "..TTTTTTT..BBBBBBBBBB...........",  # 26
    "..TTwwwTT...BBBBBBBBB...........",  # 27  w = lighter tail tip
    "...TTwwTT...BBBBBBBB............",  # 28
    "....TTTT....BBBBBBB.............",  # 29
    "................................",  # 30
    "................................",  # 31
], {
    'H': (72, 72, 94, 255),    # dark slate head
    'h': (72, 72, 94, 255),    # same (filler)
    'B': (90, 90, 112, 255),   # slightly lighter body
    'T': (88, 88, 108, 255),   # tail
    'w': (120, 120, 148, 255), # lighter tail tip
    'i': (255, 180, 190, 255), # pink inner ear
    'e': (70, 200, 110, 255),  # green eye
    'n': (255, 150, 160, 255), # pink nose
}, "sprite-pixel.png")


# ── 2. Luna the Bunny ────────────────────────────────────────────
# Lavender bunny: very tall thin ears dominate top half
make([
    "......LLLL....LLLL..............",  #  0  tall ears start
    ".....LLiiLL..LLiiLL.............",  #  1  i = pink inner
    ".....LLiiLL..LLiiLL.............",  #  2
    ".....LLiiLL..LLiiLL.............",  #  3
    ".....LLiiLL..LLiiLL.............",  #  4
    ".....LLiiLL..LLiiLL.............",  #  5
    ".....LLiiLL..LLiiLL.............",  #  6
    ".....LLiiLL..LLiiLL.............",  #  7
    ".....LLLLLL..LLLLLL.............",  #  8  ears base
    "......LLLLLLLLLLLL..............",  #  9  head connects
    ".....LLLLLLLLLLLLLL.............",  # 10
    "....LLLLLLLLLLLLLLLLL...........",  # 11
    "....LLeeLLLLLLLLLeeLLL..........",  # 12  e = dark eyes
    "....LLLLLLLLLLLLLLLLLLL.........",  # 13
    "....LLLLL..nnn..LLLLLLLL........",  # 14  n = nose
    "....LLLLLLLLLLLLLLLLLLLL........",  # 15
    ".....LLLLLLLLLLLLLLLLLLL........",  # 16
    "......LLLLLLLLLLLLLLLLL.........",  # 17  chin
    ".......BBBBBBBBBBBBBBB..........",  # 18  body
    "......BBBBBBBBBBBBBBBBB.........",  # 19
    ".....BBBBBBBBBBBBBBBBBBB........",  # 20
    ".....BBBBBBB....BBBBBBBBB.......",  # 21  leg gap
    ".....BBBBBBB....BBBBBBBBB.......",  # 22
    "......BBBBBBBBBBBBBBBBB.........",  # 23
    ".......BBBBBBBBBBBBBBB..........",  # 24
    "........BBBBBBBBBBBBB...........",  # 25
    ".........BBBBBBBBBBB............",  # 26
    "................................",  # 27
    "................................",  # 28
    "................................",  # 29
    "................................",  # 30
    "................................",  # 31
], {
    'L': (200, 185, 240, 255), # lavender
    'B': (210, 195, 245, 255), # slightly lighter body
    'i': (255, 160, 185, 255), # pink inner ear
    'e': (80, 60, 140, 255),   # dark purple eye
    'n': (255, 160, 180, 255), # pink nose
}, "sprite-luna.png")


# ── 3. Blip the Robot ────────────────────────────────────────────
# Teal robot: square head with antenna, boxy body, LED panel
make([
    "...............A................",  #  0  A = antenna ball
    "...............R................",  #  1  R = antenna rod
    "...............R................",  #  2
    ".......RRRRRRRRRRRRRRRR.........",  #  3  head top bar
    "......RRRRRRRRRRRRRRRRRR........",  #  4
    "......RR..RRRRRRRR..RRRR........",  #  5  eye sockets dark
    "......RReeRRRRRRRReeRRRR........",  #  6  e = yellow LED eyes
    "......RReeRRRRRRRReeRRRR........",  #  7
    "......RRRRRRRRRRRRRRRRRR........",  #  8
    "......RRRR..RR..RRRRRRRR........",  #  9  speaker grill
    "......RRRR..RR..RRRRRRRR........",  # 10
    "......RRRRRRRRRRRRRRRRRR........",  # 11
    ".......RRRRRRRRRRRRRRRR.........",  # 12  head bottom
    "..........RRRRRRRRRR............",  # 13  neck
    ".......BBBBBBBBBBBBBBBB.........",  # 14  body
    "......BBBBBBBBBBBBBBBBBB........",  # 15
    "......BBppBBBBBBBBBBppBB........",  # 16  p = panel buttons
    "......BBppBBBBBBBBBBppBB........",  # 17
    "......BBBBBBBBBBBBBBBBBB........",  # 18
    "......BB..BBBBBBBBBB..BB........",  # 19  arm sockets
    "......BBBBBBBBBBBBBBBBBB........",  # 20
    ".......BBBBBBBBBBBBBBBB.........",  # 21
    "..........FFFFFFFF..............",  # 22  F = feet/legs
    ".........FFFFFFFFFF.............",  # 23
    ".........FF......FF.............",  # 24
    ".........FF......FF.............",  # 25
    ".........FFFFF.FFFFF............",  # 26  feet
    "................................",  # 27
    "................................",  # 28
    "................................",  # 29
    "................................",  # 30
    "................................",  # 31
], {
    'R': (80, 200, 220, 255),  # teal head
    'B': (60, 170, 190, 255),  # darker teal body
    'A': (255, 255, 100, 255), # yellow antenna ball
    'e': (255, 230, 60, 255),  # LED eyes
    'p': (255, 100, 80, 255),  # red panel buttons
    'F': (50, 150, 170, 255),  # dark feet
}, "sprite-blip.png")


# ── 4. Mochi the Ghost ───────────────────────────────────────────
# Classic ghost shape: round head, wide body, scalloped bottom hem (3 bumps)
make([
    "................................",  #  0
    "................................",  #  1
    "...........GGGGGGGGGG...........",  #  2  G = ghost white-blue
    ".........GGGGGGGGGGGGGG.........",  #  3
    "........GGGGGGGGGGGGGGGG........",  #  4
    ".......GGGGGGGGGGGGGGGGGGGG.....",  #  5
    ".......GGeeGGGGGGGGGGGeeGGGG....",  #  6  e = dark blue eyes
    ".......GGeeGGGGGGGGGGGeeGGGG....",  #  7
    ".......GGGGGGGGGGGGGGGGGGGGGGG..",  #  8
    ".......GGG.GGGGGGGGGGG.GGGGGG...",  #  9  smile (two dips)
    ".......GGGGGGGGGGGGGGGGGGGGGGG..",  # 10
    ".......GGGGGGGGGGGGGGGGGGGGGGG..",  # 11  body widens
    "......GGGGGGGGGGGGGGGGGGGGGGGGG.",  # 12
    "......GGGGGGGGGGGGGGGGGGGGGGGGG.",  # 13
    "......GGGGGGGGGGGGGGGGGGGGGGGGG.",  # 14
    "......GGGGGGGGGGGGGGGGGGGGGGGGG.",  # 15
    "......GGGGGGGGGGGGGGGGGGGGGGGGG.",  # 16
    "......GGGGGGGGGGGGGGGGGGGGGGGGG.",  # 17
    "......GGGGGGGGGGGGGGGGGGGGGGGGG.",  # 18
    "......GGGGGGGGGGGGGGGGGGGGGGGGG.",  # 19  body bottom (full width)
    "......GGGGGGGGGGGGGGGGGGGGGGGGG.",  # 20
    "......GGGGGGGG.GGGGGGGG.GGGGGGG.",  # 21  scallop: 2 notches cut up
    "......GGGGGGG...GGGGGGG..GGGGGG.",  # 22  notches wider
    "......GGGGGGG...GGGGGGG..GGGGGG.",  # 23
    ".......GGGGGGG.GGGGGGG..GGGGGGG.",  # 24  bumps round off
    "........GGGGGG.GGGGGG..GGGGGGGG.",  # 25
    ".........GGGGGGGGGGG..GGGGGG....",  # 26  bump tips taper
    "..........GGGGG..GGG..GGGGG.....",  # 27
    "................................",  # 28
    "................................",  # 29
    "................................",  # 30
    "................................",  # 31
], {
    'G': (195, 220, 255, 255), # soft blue-white
    'e': (70, 90, 200, 255),   # deep blue eyes
}, "sprite-mochi.png")


# ── 5. Ember the Dragon ──────────────────────────────────────────
# Orange-red dragon: curved horns, scaly body, wings, flame tail
make([
    "....DD......................DD...",  #  0  D = dark horn
    "...DDDD....................DDDD..",  #  1
    "..DDDDDDD..............DDDDDDD..",  #  2  curved horns
    "..DDDD.....EEEEEEEE.....DDDD....",  #  3  E = dragon body
    "...DDD....EEEEEEEEEEEE...DDD....",  #  4
    "..........EEEEEEEEEEEEEE........",  #  5
    ".........EEEeEEEEEEEEeEEE.......",  #  6  e = slit eyes
    ".........EEEeEEEEEEEEeEEE.......",  #  7
    ".........EEEEEEEEEEEEEEEEE......",  #  8
    ".WWWWWWWWEEEEEEEEEEEEEEEEEWWWWW.",  #  9  W = wings spread
    "WWWWWWWWEEEEEEEEEEEEEEEEEEWWWWWW",  # 10
    "WWWWWWWWEEEEEEEEEEEEEEEEEEWWWWWW",  # 11
    ".WWWWWWWEEEEEEEEEEEEEEEEEWWWWWW.",  # 12
    "..WWWWW..EEEEEEEEEEEEEEEE.WWWW..",  # 13
    "....WW....EEEEEEEEEEEEEE..WWW...",  # 14
    "..........SSSSSSSSSSSSSSS.......",  # 15  S = scales (lighter)
    ".........SSSSSSSSSSSSSSSSS......",  # 16
    ".........EEEEEEEEEEEEEEEEE......",  # 17
    ".........EEEEEEEEEEEEEEEEE......",  # 18
    "..........EEEEEEEEEEEEEEE.......",  # 19
    "...........EEEEEEEEEEEEE........",  # 20
    "............EEEEEEEEEEEE........",  # 21
    ".............FFFFFFFFFFFF.......",  # 22  F = flame tail
    "..............FFFFFFFFFF........",  # 23
    "...............FFFFFFF..........",  # 24
    "................FFFFFFF.........",  # 25
    ".................FFFFFF.........",  # 26
    "..................FFFFF..........",  # 27
    "..................FFFFF..........",  # 28
    "................................",  # 29
    "................................",  # 30
    "................................",  # 31
], {
    'E': (230, 90, 50, 255),   # fire red-orange body
    'D': (160, 60, 20, 255),   # dark brown horns
    'S': (255, 140, 80, 255),  # lighter scale belly
    'W': (200, 70, 40, 200),   # semi-transparent wings
    'e': (255, 240, 60, 255),  # yellow slit eyes
    'F': (255, 200, 40, 255),  # flame tail gold
}, "sprite-ember.png")


# ── 6. Cosmo the Alien ───────────────────────────────────────────
# Bright green alien: huge teardrop head, giant almond eyes, tiny body
make([
    "..............A.................",  #  0  antenna
    "..............A.................",  #  1
    "..............aaa...............",  #  2  a = antenna end
    ".........GGGGGGGGGGG............",  #  3  G = green head
    ".......GGGGGGGGGGGGGGG..........",  #  4
    "......GGGGGGGGGGGGGGGGGGG.......",  #  5
    ".....GGGGGGGGGGGGGGGGGGGGGGG....",  #  6
    ".....GGeeeeeGGGGGGGeeeeeGGGG....",  #  7  e = huge almond eye
    ".....GGeeeeeGGGGGGGeeeeeGGGG....",  #  8
    ".....GGeeeeeGGGGGGGeeeeeGGGG....",  #  9
    ".....GGGGGGGGGGGGGGGGGGGGGGGG...",  # 10
    "......GGGGGGGGGGGGGGGGGGGGGGG...",  # 11
    ".......GGGGG..nnn..GGGGGGGG.....",  # 12  n = tiny nose
    "........GGGGGGGGGGGGGGGGG.......",  # 13
    "..........GGGGGGGGGGGGG.........",  # 14
    "...........BBBBBBBBBBB..........",  # 15  B = small body
    "..........BBBBBBBBBBBBB.........",  # 16
    "..........BBBBBBBBBBBBB.........",  # 17
    "..........BBBBBBBBBBBBB.........",  # 18
    "....AAAAA..BBBBBBBBB..AAAAA.....",  # 19  A = arms
    "...AAAAAAA.BBBBBBBBB.AAAAAAA....",  # 20
    "...AA......BBBBBBBBB......AA....",  # 21
    "..........FFFFFFFF.FFFFFFF......",  # 22  F = legs
    ".........FFFF....FFFF...........",  # 23
    ".........FFF......FFF...........",  # 24
    "................................",  # 25
    "................................",  # 26
    "................................",  # 27
    "................................",  # 28
    "................................",  # 29
    "................................",  # 30
    "................................",  # 31
], {
    'G': (100, 220, 140, 255), # bright green head
    'B': (80, 190, 120, 255),  # slightly darker body
    'e': (255, 60, 110, 255),  # hot pink huge eyes
    'n': (200, 255, 180, 255), # light nose
    'A': (70, 200, 120, 255),  # arms
    'F': (70, 200, 120, 255),  # feet
    'a': (200, 200, 60, 255),  # antenna ball
}, "sprite-cosmo.png")


# ── 7. Fern the Sprout ───────────────────────────────────────────
# Little plant: round leaves left/right, stem, clay pot
make([
    "................................",  #  0
    "................................",  #  1
    "....LLLLLL......LLLLLL..........",  #  2  L = leaf green
    "...LLLLLLLL....LLLLLLLL.........",  #  3
    "...LLLLLLLLL..LLLLLLLLL.........",  #  4
    "...LLLLLLLLLLLLLLLLLLL..........",  #  5
    "....LLLLLLLLLLLLLLLLL...........",  #  6
    ".....LLLLLLSSSLLLLLLL...........",  #  7  S = stem
    ".......LLLSSSSLLL...............",  #  8
    ".........SSSSS..................",  #  9  stem only
    ".........SSSSS..................",  # 10
    ".........SSSSS..................",  # 11
    ".........SSSSS..................",  # 12
    ".......PPPPPPPPP................",  # 13  P = pot rim
    "......PPPPPPPPPPP...............",  # 14
    "......PP.......PP...............",  # 15  pot body
    "......PP.......PP...............",  # 16
    "......PP.......PP...............",  # 17
    "......PP.......PP...............",  # 18
    "......PP.......PP...............",  # 19
    ".......PPPPPPPPP................",  # 20  pot bottom
    "........PPPPPPP.................",  # 21
    "................................",  # 22
    "................................",  # 23
    "................................",  # 24
    "................................",  # 25
    "................................",  # 26
    "................................",  # 27
    "................................",  # 28
    "................................",  # 29
    "................................",  # 30
    "................................",  # 31
], {
    'L': (70, 185, 70, 255),   # leaf green
    'S': (100, 160, 60, 255),  # darker stem
    'P': (175, 105, 65, 255),  # terracotta pot
}, "sprite-fern.png")


# ── 8. Nova the Star ─────────────────────────────────────────────
# Golden 8-pointed star with a face in the center
make([
    "................................",  #  0
    "...............Y................",  #  1  Y = gold star
    "..............YYY...............",  #  2
    ".............YYYYY..............",  #  3
    ".............YYYYY..............",  #  4
    "...YYYYY.....YYYYY.....YYYYY....",  #  5  horizontal arms
    "..YYYYYYY...YYYYYYY...YYYYYYY...",  #  6
    ".YYYYYYYYYYYYYYYYYYYYYYYYYYYYY..",  #  7  full width
    ".YYYYYYYYYYYYYYYYYYYYYYYYYYYYY..",  #  8
    ".YYYYYYYYYYYYYYYYYYYYYYYYYYYYY..",  #  9
    "..YYYYYYYeYYYYYYYYYeYYYYYYYY...",  # 10  e = eyes
    "..YYYYYYYeYYYYYYYYYeYYYYYYYY...",  # 11
    ".YYYYYYYYYYYYYYYYYYYYYYYYYYYYY..",  # 12
    ".YYYYYYYYYYYYYYYYYYYYYYYYYYYYY..",  # 13
    "..YYYYYYYYY.nnn.YYYYYYYYYYYYYYY.",  # 14  n = nose
    "..YYYYYYYYYYYYYYYYYYYYYYYYYYYYYY",  # 15
    "...YYYYY.....YYYYY.....YYYYY....",  # 16
    ".............YYYYY..............",  # 17
    ".............YYYYY..............",  # 18
    ".............YYYYY..............",  # 19
    "..............YYY...............",  # 20
    "...............Y................",  # 21
    "................................",  # 22
    "................................",  # 23
    "................................",  # 24
    "................................",  # 25
    "................................",  # 26
    "................................",  # 27
    "................................",  # 28
    "................................",  # 29
    "................................",  # 30
    "................................",  # 31
], {
    'Y': (255, 215, 50, 255),  # golden star
    'e': (255, 120, 40, 255),  # warm orange eyes
    'n': (255, 180, 80, 255),  # lighter nose
}, "sprite-nova.png")


# ── 9. Pudding the Frog ──────────────────────────────────────────
# Green frog: eyes bulge UP on top, flat wide face, big smile
make([
    "................................",  #  0
    "......eeeee....eeeee............",  #  1  e = eye dome top
    ".....eEEEEee..eEEEEee...........",  #  2  E = white eye
    ".....eEPEEee..eEPEEee...........",  #  3  P = pupil
    ".....eEEEEee..eEEEEee...........",  #  4
    "......eeeee....eeeee............",  #  5  eye base
    ".....FFFFFFFFFFFFFFFFFFFFFFFFF..",  #  6  F = frog green face
    "....FFFFFFFFFFFFFFFFFFFFFFFFFFFD",  #  7
    "....FFFFFFFFFFFFFFFFFFFFFFFFFFF.",  #  8
    "....FFFFFFFFFFFFFFFFFFFFFFFFFFF.",  #  9
    "....FFFFFFFFFFFFFFFFFFFFFFFFFFF.",  # 10
    "....FF..FFFFF..mm..FFFFF..FF....",  # 11  m = mouth corner
    "....FF.FFFFFF.mmm.FFFFFF.FFF....",  # 12
    "....FFFFFFFFFFFFFFFFFFFFFFFFFFF.",  # 13
    "....FFFFFFFFFFFFFFFFFFFFFFFFFFF.",  # 14
    ".....FFFFFFFFFFFFFFFFFFFFFFF....",  # 15
    "......FFFFFFFFFFFFFFFFFFFF......",  # 16
    ".......FFFFFFFFFFFFFFFF.........",  # 17  chin
    ".......BBBBBBBBBBBBBBBB.........",  # 18  body
    "......BBBBBBBBBBBBBBBBBB........",  # 19
    ".....BBBBBBBB....BBBBBBBB.......",  # 20  legs
    ".....BBBBBBBB....BBBBBBBB.......",  # 21
    ".....BBBBBBBB....BBBBBBBB.......",  # 22
    "....LLLLLLLL......LLLLLLLL......",  # 23  L = webbed feet
    "....LLLLLLLL......LLLLLLLL......",  # 24
    "................................",  # 25
    "................................",  # 26
    "................................",  # 27
    "................................",  # 28
    "................................",  # 29
    "................................",  # 30
    "................................",  # 31
], {
    'F': (70, 185, 70, 255),   # frog green face
    'B': (60, 160, 60, 255),   # body (slightly darker)
    'L': (50, 140, 50, 255),   # webbed feet darkest
    'e': (90, 210, 90, 255),   # eye dome (lighter green)
    'E': (240, 250, 240, 255), # white of eye
    'P': (20, 30, 20, 255),    # dark pupil
    'm': (20, 100, 20, 255),   # dark mouth
}, "sprite-pudding.png")


# ── 10. Cinder the Phoenix ───────────────────────────────────────
# Red phoenix bird: beak, wings spread wide, flame tail below
make([
    "...............cc...............",  #  0  c = flame crest
    "..............cccc..............",  #  1
    ".............ccCCcc.............",  #  2  C = bright crest
    "..............RRRR..............",  #  3  R = red body/head
    ".............RRRRRR.............",  #  4
    "............RRReRRR.............",  #  5  e = eye
    "............RRRBRRR.............",  #  6  B = beak
    "...........RRRRbRRRR............",  #  7  b = beak tip
    "..WWWWWWWWWRRRRRRRRRRWWWWWWWWW..",  #  8  W = wings
    ".WWWWWWWWWWRRRRRRRRRRRWWWWWWWWW.",  #  9
    "WWWWWWWWWWWRRRRRRRRRRRWWWWWWWWWW",  # 10
    "WWWWWWWWWWWWRRRRRRRRRRWWWWWWWWWW",  # 11
    ".WWWWWWWWWWWWRRRRRRRRRWWWWWWWWW.",  # 12
    "..WWWWWWWWWWWWRRRRRRRWWWWWWWWWW.",  # 13
    "....WWWWWWWWWWRRRRRRWWWWWWWWW...",  # 14
    ".......WWWWWWWRRRRRRWWWWWWW.....",  # 15
    "...........WWWRRRRRRWWW.........",  # 16
    "..............RRRRRRRR..........",  # 17  tail base
    "..............FFFFFFFFF..........",  # 18  F = flame tail
    ".............FFFFFFFFFFF........",  # 19
    "............FFfFFFFFFfFF........",  # 20  f = bright flame
    "............FFF......FFF........",  # 21  fork
    "...........FFF........FFF.......",  # 22
    "..........FFF..........FFF......",  # 23
    ".........FfF............FfF.....",  # 24
    "................................",  # 25
    "................................",  # 26
    "................................",  # 27
    "................................",  # 28
    "................................",  # 29
    "................................",  # 30
    "................................",  # 31
], {
    'R': (210, 75, 40, 255),   # red body
    'W': (230, 120, 50, 200),  # orange semi-transparent wings
    'c': (255, 150, 30, 255),  # flame crest orange
    'C': (255, 240, 100, 255), # bright crest tip
    'e': (255, 240, 60, 255),  # eye
    'B': (255, 200, 50, 255),  # beak gold
    'b': (220, 160, 30, 255),  # beak tip darker
    'F': (255, 160, 30, 255),  # flame tail
    'f': (255, 240, 150, 255), # bright flame highlight
}, "sprite-cinder.png")


# ── 11. Shell the Turtle ─────────────────────────────────────────
# Green turtle: head pokes out top-left, big dome shell, 4 flippers
make([
    "................................",  #  0
    "................................",  #  1
    ".....HHHHHH.....................",  #  2  H = head (left side, peeking out)
    ".....HHeHHeH....................",  #  3  e = yellow eyes
    ".....HHHHHHH....................",  #  4
    ".....HHHHHHH.SSSSSSSSSSSSS......",  #  5  shell starts (S = shell green)
    "..FF.HHHHH.SSSSSSSSSSSSSSSSS....",  #  6  F = front flipper
    ".FFFF.....SSSDSSSSSSSDSSSSSSS...",  #  7  D = dark hexagon pattern
    ".FFFF.....SSSSSSSSSSSSSSSSSSSS..",  #  8
    ".FFFF.....SSSDSSSSSSSDSSSSSSS...",  #  9
    "..FF......SSSSSSSSSSSSSSSSSSSS..",  # 10
    "..........SSSDSSSSSSSDSSSSSSS...",  # 11
    "..........SSSSSSSSSSSSSSSSSSSS..",  # 12
    "..FF......SSSDSSSSSSSDSSSSSSS...",  # 13  back flippers
    ".FFFF.....SSSSSSSSSSSSSSSSSSSS..",  # 14
    ".FFFF.....SSSDSSSSSSSDSSSSSSS...",  # 15
    ".FFFF.....SSSSSSSSSSSSSSSSSSSS..",  # 16
    "..FF.......SSSSSSSSSSSSSSSSSSS..",  # 17
    "...........SSSSSSSSSSSSSSSSSSS..",  # 18
    "............SSSSSSSSSSSSSSSSSS..",  # 19
    ".............SSSSSSSSSSSSSSSSS..",  # 20
    "..............SSSSSSSSSSSSSSSS..",  # 21  dome rounds off
    "...............SSSSSSSSSSSSSS...",  # 22
    "................SSSSSSSSSSSSSS..",  # 23
    ".................SSSSSSSSSSSS...",  # 24
    "..................SSSSSSSSSS.....",  # 25
    "....................SSSSSS.......",  # 26
    "................................",  # 27
    "................................",  # 28
    "................................",  # 29
    "................................",  # 30
    "................................",  # 31
], {
    'S': (60, 155, 75, 255),   # shell green
    'D': (35, 105, 50, 255),   # dark hexagon markings
    'H': (95, 175, 95, 255),   # head lighter green
    'F': (70, 150, 70, 255),   # flippers
    'e': (230, 245, 100, 255), # bright yellow eyes
}, "sprite-shell.png")


# ── 12. Ziggy the Spark ──────────────────────────────────────────
# Clear ⚡ lightning bolt: wide top-right block, sharp diagonal, wide bottom-left
make([
    "................................",  #  0
    "..............ZZZZZZZZZZZZZZZ...",  #  1  Z = yellow, TOP block (right side)
    ".............ZZZZZZZZZZZZZZZZZ..",  #  2
    "............ZZZeZZZZZZZZeZZZZZZ",  #  3  e = purple eyes
    "............ZZZeZZZZZZZZeZZZZZZ",  #  4
    ".............ZZZZZZZZZZZZZZZZZ..",  #  5
    "..............ZZZZZZZZZZZZZZZ...",  #  6  top block ends
    "...............ZZZZZZZZ.........",  #  7  sharp diagonal strip (narrow)
    "..............ZZZZZZZZZ.........",  #  8
    ".............ZZZZZZZZZ..........",  #  9
    "............ZZZZZZZZZ...........",  # 10
    "...........ZZZZZZZZZ............",  # 11
    "..........ZZZZZZZZZ.............",  # 12  diagonal going left-down
    ".........ZZZZZZZZZ..............",  # 13
    "........ZZZZZZZZZ...............",  # 14
    ".......ZZZZZZZZZ................",  # 15
    "......ZZZZZZZZZ.................",  # 16
    ".ZZZZZZZZZZZZZZZZZZZZZZZZZ......",  # 17  BOTTOM block (left side)
    "ZZZZZZZZZZZZZZZZZZZZZZZZZZZZ....",  # 18
    "ZZZZzZZZZZZZZZZZZZZZZZZZZZZZ...",  # 19  z = bright highlight
    "ZZZZZZZZZZZZZZZZZZZZZZZZZZZZ....",  # 20
    ".ZZZZZZZZZZZZZZZZZZZZZZZZZ......",  # 21  bottom block ends
    "..ZZZZZZZZZZZZZZZZZZZZZZZZ......",  # 22
    "...ZZZZZZZZZZZZZZZZZZZZZZZ......",  # 23
    "....ZZZZZZZZZZZZZZZZZZZZ........",  # 24  bolt narrows to tip
    ".....ZZZZZZZZZZZZZZZZZZZ........",  # 25
    "......ZZZZZZZZZZZZZZZZ..........",  # 26
    "................................",  # 27
    "................................",  # 28
    "................................",  # 29
    "................................",  # 30
    "................................",  # 31
], {
    'Z': (255, 225, 40, 255),  # electric yellow
    'z': (255, 255, 180, 255), # bright core highlight
    'e': (140, 60, 255, 255),  # purple eyes
}, "sprite-ziggy.png")


# ── 13. Pebble the Golem ─────────────────────────────────────────
# Stone golem: chunky humanoid, cracked texture, glowing blue eyes
make([
    "................................",  #  0
    ".......RRRRRRRRRRRRR............",  #  1  R = stone grey
    "......RRRRRRRRRRRRRRR...........",  #  2
    "......RRRRRRrRRRrRRRR...........",  #  3  r = dark crack
    "......RRReRRRRRRRRRRReRR........",  #  4  e = glowing eyes
    "......RRReRRRRRRRRRRReRR........",  #  5
    "......RRRRRRRrRRRrRRRRRRR.......",  #  6
    ".......RRRRRRRRRRRRRRRRR........",  #  7
    "........RRRRRRRRRRRRRRR.........",  #  8
    "AAAAAAA..RRRRRRRRRRRRR..AAAAAAA.",  #  9  A = arms out
    "AAAAAAA..RRRRRRRRRRRRR..AAAAAAA.",  # 10
    "AAAAAAA..RRRRRRRRRRRRR..AAAAAAA.",  # 11
    "AAAAAAA..RRRRRRRRRRRRR..AAAAAAA.",  # 12
    ".AAAAAA..RRRRRRRRRRRRR..AAAAAA..",  # 13
    "..AAAAA..RRRRRRRRRRRRR..AAAAA...",  # 14
    "..........RRRRRRRRRRR...........",  # 15  torso
    "..........RRRRRRRRRRR...........",  # 16
    "..........RRrRRRRRRrR...........",  # 17  crack
    "..........RRRRRRRRRRR...........",  # 18
    ".........RRRRRRRRRRRRR..........",  # 19
    "........RRRRR...RRRRR...........",  # 20  leg gap
    "........RRRRR...RRRRR...........",  # 21
    "........RRRRR...RRRRR...........",  # 22
    "........RRRRR...RRRRR...........",  # 23
    ".......RRRRRR...RRRRRR..........",  # 24  feet
    ".......RRRRRR...RRRRRR..........",  # 25
    "................................",  # 26
    "................................",  # 27
    "................................",  # 28
    "................................",  # 29
    "................................",  # 30
    "................................",  # 31
], {
    'R': (155, 145, 135, 255), # stone grey
    'r': (100, 90, 80, 255),   # dark cracks
    'A': (135, 125, 115, 255), # arms (slightly darker)
    'e': (60, 210, 230, 255),  # glowing cyan eyes
}, "sprite-pebble.png")


# ── 14. Wisp the Candle ──────────────────────────────────────────
# Candle spirit: teardrop flame on top, wax cylinder body, drips
make([
    "................................",  #  0
    "..............fff...............",  #  1  f = outer flame
    ".............fffff..............",  #  2
    "............ffFFFff.............",  #  3  F = bright flame core
    "............ffFFFff.............",  #  4
    "............ffFFFff.............",  #  5
    ".............fffff..............",  #  6
    "..............fff...............",  #  7
    "..............CCC...............",  #  8  C = candle wick
    ".............CCCCC..............",  #  9
    "............CCCCCCC.............",  # 10  wax body widens
    "............CCCCCCC.............",  # 11
    "............CCoCCoCC............",  # 12  o = wax drips shadow
    "............CCCCCCC.............",  # 13
    "............CCCCCCC.............",  # 14
    "............CCCCCCC.............",  # 15
    "...........dCCCCCCCd............",  # 16  d = wax drip
    "...........dCCCCCCCd............",  # 17
    "............CCCCCCC.............",  # 18
    "............CCCCCCC.............",  # 19
    "...........CCCCCCCCCd...........",  # 20
    "..........dCCCCCCCCCCC..........",  # 21  wider base
    "..........CCCCCCCCCCCCC.........",  # 22
    "..........dCCCCCCCCCCCd.........",  # 23
    "...........CCCCCCCCCCCd.........",  # 24
    "...........CCCCCCCCCCC..........",  # 25
    "............CCCCCCCCC...........",  # 26
    "................................",  # 27
    "................................",  # 28
    "................................",  # 29
    "................................",  # 30
    "................................",  # 31
], {
    'f': (255, 155, 25, 255),  # flame orange
    'F': (255, 240, 180, 255), # bright flame core
    'C': (245, 235, 210, 255), # cream candle wax
    'o': (200, 175, 140, 255), # shadow on wax
    'd': (210, 185, 150, 255), # wax drip
}, "sprite-wisp.png")


# ── 15. Dusk the Fox ─────────────────────────────────────────────
# Orange fox: pointy ears, long narrow snout, sitting, tail curls
make([
    "......VVV......VVV..............",  #  0  V = fox orange, ear tips
    ".....VVVVV....VVVVV.............",  #  1
    ".....VViVV....VViVV.............",  #  2  i = inner ear pink
    "....VViiiVVVVVVViiVV............",  #  3
    "....VVVVVVVVVVVVVVVVV...........",  #  4  head top
    "...VVVVVVVVVVVVVVVVVVV..........",  #  5
    "...VVeVVVVVVVVVVVVVeVV..........",  #  6  e = eyes
    "...VVeVVVVVVVVVVVVVeVV..........",  #  7
    "...VVVVVVVVVVVVVVVVVVV..........",  #  8
    "...VVVVVVVVVVVVVVVVVVV..........",  #  9
    "....VVV..nnn..VVVVVVVV..........",  # 10  n = nose
    "....VVVVVVVVVVVVVVVVVVV.........",  # 11
    ".....VVVVVVVVVVVVVVVVVV.........",  # 12
    ".....VVVVVVVVVVVVVVVVV..........",  # 13  snout tip
    "......VVVVVVVVVVVVVVV...........",  # 14
    ".......BBBBBBBBBBBBBB...........",  # 15  B = body
    "......BBBBBBBBBBBBBBBB..........",  # 16
    ".....BBBBBBBBBBBBBBBBBB.........",  # 17
    ".....BBBBBBB....BBBBBBB.........",  # 18  leg gap
    ".....BBBBBBB....BBBBBBB.........",  # 19
    ".....BBBBBBB....BBBBBBB.........",  # 20
    "......BBBBBBBBBBBBBBBB..........",  # 21
    ".TTTTTT.BBBBBBBBBBBBBBBB........",  # 22  T = tail
    "TTTTTTTTT.BBBBBBBBBBBBBB.......",  # 23
    "TTwwTTTTT..BBBBBBBBBBBBB.......",  # 24  w = white tail tip
    "TTwwTTTTTT..BBBBBBBBBBBB.......",  # 25
    ".TTwwwTTTT...BBBBBBBBBBB.......",  # 26
    "..TTTwwTTTT...BBBBBBBBBB.......",  # 27
    "...TTTwwwTTTT..BBBBBBBBB.......",  # 28
    "....TTTwwwwTTTT.BBBBBBBB.......",  # 29
    ".....TTTTwwwwTTT.BBBBBBB.......",  # 30
    "......TTTTTwwwTTT.BBBBBB.......",  # 31
], {
    'V': (220, 105, 45, 255),  # fox orange
    'B': (200, 95, 40, 255),   # slightly darker body
    'T': (220, 105, 45, 255),  # tail same orange
    'w': (245, 235, 225, 255), # white tail tip
    'i': (255, 175, 185, 255), # pink inner ear
    'e': (255, 215, 170, 255), # warm amber eyes
    'n': (180, 70, 30, 255),   # dark nose
}, "sprite-dusk.png")


# ── 16. Glimmer the Fairy ────────────────────────────────────────
# Lavender fairy: large butterfly wings, small body, sparkles
make([
    "................................",  #  0
    "...w.................w..........",  #  1  w = sparkle
    "..www.....CCCCC.....www.........",  #  2  C = crown
    "...w......CCCCC......w..........",  #  3
    "WWWWWWW..XXXXXXX..WWWWWWW.......",  #  4  W = wings, X = body
    "WWWWWWWW.XXXXXXX.WWWWWWWW.......",  #  5
    "WWWWWWWWWXXXXXXX.WWWWWWWWW......",  #  6  x = lighter wing center
    "WwWWWWWWXXXXXXXXXWWWWWWWwW......",  #  7
    "WWWWWWWWWXXXXXXX.WWWWWWWWW......",  #  8
    "WWWWWWWW.XXXXXXX.WWWWWWWW.......",  #  9
    "WWWWWWW..XXXXXXX..WWWWWWW.......",  # 10
    ".WWWWW...XXeXXeXX...WWWWW.......",  # 11  e = eyes
    "..WWWWW..XXXXXXXX..WWWWW........",  # 12
    "...WWWWW..XXXXXX..WWWWW.........",  # 13
    "....WWW...XXXXXX...WWWW.........",  # 14
    ".....WW...XXXXXX...WWW..........",  # 15  lower wings
    "......W....XXXX....WW...........",  # 16
    ".......W...XXXX...WW............",  # 17
    "........WW.XXXX.WW..............",  # 18
    ".........WWWXXXXWWW.............",  # 19
    "..........WWXXXXWW..............",  # 20
    "...........WXXXXW...............",  # 21
    "............XXXX................",  # 22
    "............XXXX................",  # 23
    "...........XXXXXX...............",  # 24  legs/skirt
    "...........XX..XX...............",  # 25
    "...........XX..XX...............",  # 26
    "................................",  # 27
    "................................",  # 28
    "................................",  # 29
    "................................",  # 30
    "................................",  # 31
], {
    'X': (220, 155, 225, 255), # lavender body
    'W': (180, 220, 255, 200), # translucent blue-white wings
    'x': (210, 235, 255, 160), # lighter wing center
    'C': (255, 215, 50, 255),  # gold crown
    'e': (255, 80, 160, 255),  # hot pink eyes
    'w': (255, 255, 160, 255), # yellow sparkle
}, "sprite-glimmer.png")


print("\nDone! All 16 sprites regenerated at 32×32 (4× scale).")
