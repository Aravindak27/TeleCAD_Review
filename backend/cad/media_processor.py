import os
import fitz  # PyMuPDF

def process_pdf_to_images(pdf_path: str, output_dir: str, drawing_uid: str) -> list[str]:
    """
    Extracts all pages from a PDF file and saves them as PNG images.
    Returns a list of absolute file paths to the generated PNGs.
    """
    doc = fitz.open(pdf_path)
    image_paths = []
    
    for page_index in range(len(doc)):
        page = doc.load_page(page_index)
        # Rendering at 300 DPI for high fidelity
        pix = page.get_pixmap(dpi=300)
        
        output_filename = f"{drawing_uid}_page_{page_index}.png"
        output_path = os.path.join(output_dir, output_filename)
        pix.save(output_path)
        
        image_paths.append(output_path)
        
    doc.close()
    return image_paths
