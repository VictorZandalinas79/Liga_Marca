import fitz # PyMuPDF
doc = fitz.open('Reporte_Completo_57dotnff3xaafnxfltzt4czdg.pdf')
text = ""
for page in doc:
    text += page.get_text()
for line in text.split('\n'):
    if 'E. Martínez' in line or 'Calidad P.' in line:
        print(line)
