import argparse
import textwrap
from pathlib import Path


def escape_pdf_text(value: str) -> str:
    cleaned = value.replace("\r", " ").replace("\n", " ")
    return cleaned.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def normalize_input_lines(raw_text: str) -> list[str]:
    normalized: list[str] = []
    for raw in raw_text.splitlines():
        line = raw.rstrip()
        if line.startswith("### "):
            normalized.append(line[4:].upper())
            normalized.append("")
        elif line.startswith("## "):
            normalized.append(line[3:].upper())
            normalized.append("")
        elif line.startswith("# "):
            normalized.append(line[2:].upper())
            normalized.append("")
        elif line.startswith("- "):
            normalized.append(f"* {line[2:]}")
        elif line.startswith("1. "):
            normalized.append(line)
        else:
            normalized.append(line)
    return normalized


def wrap_lines(lines: list[str], width: int) -> list[str]:
    wrapped: list[str] = []
    for line in lines:
        if not line.strip():
            wrapped.append("")
            continue
        chunks = textwrap.wrap(line, width=width, break_long_words=False, replace_whitespace=False)
        wrapped.extend(chunks if chunks else [""])
    return wrapped


def build_pages(lines: list[str], *, page_height: int, top_margin: int, bottom_margin: int, line_height: int) -> list[list[str]]:
    usable_height = page_height - top_margin - bottom_margin
    lines_per_page = max(1, usable_height // line_height)
    return [lines[i : i + lines_per_page] for i in range(0, len(lines), lines_per_page)] or [[""]]


def build_pdf_bytes(pages: list[list[str]]) -> bytes:
    page_width = 595
    page_height = 842
    left_margin = 48
    top_margin = 52
    line_height = 14

    objects: list[bytes] = []

    # 1: Catalog, 2: Pages root, 3: Font
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(b"<< /Type /Pages /Count 0 /Kids [] >>")  # placeholder, replaced later
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    page_obj_numbers: list[int] = []
    for page_lines in pages:
        page_obj_num = len(objects) + 1
        content_obj_num = page_obj_num + 1
        page_obj_numbers.append(page_obj_num)

        text_cmds: list[str] = ["BT", "/F1 10 Tf", f"{left_margin} {page_height - top_margin} Td"]
        for idx, line in enumerate(page_lines):
            if idx > 0:
                text_cmds.append(f"0 -{line_height} Td")
            text_cmds.append(f"({escape_pdf_text(line)}) Tj")
        text_cmds.append("ET")
        content_stream = "\n".join(text_cmds).encode("latin-1", errors="replace")

        page_obj = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_width} {page_height}] "
            f"/Resources << /Font << /F1 3 0 R >> >> /Contents {content_obj_num} 0 R >>"
        ).encode("ascii")
        content_obj = b"<< /Length %d >>\nstream\n" % len(content_stream) + content_stream + b"\nendstream"
        objects.append(page_obj)
        objects.append(content_obj)

    kids_refs = " ".join(f"{num} 0 R" for num in page_obj_numbers)
    objects[1] = f"<< /Type /Pages /Count {len(page_obj_numbers)} /Kids [{kids_refs}] >>".encode("ascii")

    pdf = bytearray()
    pdf.extend(b"%PDF-1.4\n")
    pdf.extend(b"%King-Kush Documentation\n")

    offsets = [0]
    for idx, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{idx} 0 obj\n".encode("ascii"))
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")

    xref_pos = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))

    trailer = (
        "trailer\n"
        f"<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        "startxref\n"
        f"{xref_pos}\n"
        "%%EOF\n"
    )
    pdf.extend(trailer.encode("ascii"))
    return bytes(pdf)


def generate_pdf(input_path: Path, output_path: Path) -> None:
    raw_text = input_path.read_text(encoding="utf-8")
    normalized = normalize_input_lines(raw_text)
    wrapped = wrap_lines(normalized, width=92)
    pages = build_pages(wrapped, page_height=842, top_margin=52, bottom_margin=48, line_height=14)
    pdf_bytes = build_pdf_bytes(pages)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(pdf_bytes)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a simple multi-page PDF from plain text/markdown.")
    parser.add_argument("--input", required=True, help="Input markdown/text path")
    parser.add_argument("--output", required=True, help="Output PDF path")
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()
    generate_pdf(input_path, output_path)
    print(f"Generated PDF: {output_path}")


if __name__ == "__main__":
    main()

