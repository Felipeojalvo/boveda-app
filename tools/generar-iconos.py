"""Genera los íconos de la PWA (tres nodos unidos por líneas). Uso: python3 tools/generar-iconos.py"""
from pathlib import Path
from PIL import Image, ImageDraw

SALIDA = Path(__file__).resolve().parent.parent / "docs" / "icons"
FONDO = (22, 21, 26, 255)
TINTA = (236, 231, 218, 255)
ACENTO = (217, 154, 127, 255)


def dibujar(tam, margen):
    """margen: fracción del lado que queda libre alrededor (más para el maskable)."""
    ss = 4  # supersampling para bordes suaves
    n = tam * ss
    img = Image.new("RGBA", (n, n), FONDO)
    d = ImageDraw.Draw(img)
    area = n * (1 - 2 * margen)
    x0 = y0 = n * margen

    def p(u, v):
        return (x0 + area * u, y0 + area * v)

    nodos = [p(0.22, 0.70), p(0.50, 0.22), p(0.80, 0.62)]
    grosor = int(area * 0.045)
    for a, b in [(0, 1), (1, 2), (0, 2)]:
        d.line([nodos[a], nodos[b]], fill=TINTA, width=grosor)
    radios = [0.095, 0.12, 0.085]
    colores = [TINTA, ACENTO, TINTA]
    for (cx, cy), r, c in zip(nodos, radios, colores):
        rr = area * r
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=c)
    return img.resize((tam, tam), Image.LANCZOS)


SALIDA.mkdir(parents=True, exist_ok=True)
dibujar(192, 0.14).save(SALIDA / "icon-192.png")
dibujar(512, 0.14).save(SALIDA / "icon-512.png")
dibujar(512, 0.24).save(SALIDA / "icon-maskable-512.png")  # zona segura ampliada
dibujar(180, 0.14).save(SALIDA / "apple-touch-icon.png")
print("Íconos generados en", SALIDA)
