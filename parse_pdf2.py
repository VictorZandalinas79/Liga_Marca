import fitz # PyMuPDF
doc = fitz.open('Reporte_Completo_57dotnff3xaafnxfltzt4czdg.pdf')
text = ""
for page in doc:
    text += page.get_text()

lines = text.split('\n')
printing = False
for line in lines:
    if 'Rodri' in line:
        printing = True
    if 'Puntos Totales' in line and 'Rodri' not in line:
        printing = False
    
    if printing:
        print(line)
