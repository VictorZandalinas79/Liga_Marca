import requests
from bs4 import BeautifulSoup
import csv
import os
import re
import sys
import unicodedata
import time

def contar_jugadores_previos(csv_file):
    """Filas del CSV del scraping anterior. 0 si no existe o está vacío."""
    if not os.path.exists(csv_file):
        return 0
    try:
        with open(csv_file, 'r', newline='', encoding='utf-8') as f:
            return max(sum(1 for _ in csv.reader(f)) - 1, 0)  # -1 por la cabecera
    except Exception as e:
        print(f"Aviso: no se pudo leer el CSV anterior ({e}). Se omite la comprobación.")
        return 0

def slugify(text):
    text = unicodedata.normalize('NFD', text).encode('ascii', 'ignore').decode('utf-8')
    return re.sub(r'[-\s]+', '-', text).strip('-').lower()

def extract_birthdate(soup):
    for d in soup.select('div.info-right'):
        if 'años' in d.text:
            match = re.search(r'\((.*?)\)', d.text)
            if match:
                return match.group(1)
    return ""

def extract_position(soup):
    """La ficha del jugador lista la posicion por cada plataforma de fantasy
    (Comunio, Biwenger, Futmondo, LaLiga F., Marca, Mister) en filas separadas
    (div.info.d-flex). Aqui jugamos con datos de Biwenger, asi que hay que
    coger su fila concreta y no la primera que aparezca en la pagina (que
    puede ser de otra plataforma o del widget comparador de jugadores).
    Si el jugador tiene doble demarcacion en Biwenger (p.ej. MD/DL), se
    coge siempre la segunda."""
    for info in soup.select('div.info.d-flex'):
        left = info.select_one('.info-left')
        if left and 'Biwenger' in left.get_text():
            pos_tags = info.select('span.position-box')
            if pos_tags:
                return pos_tags[-1].text.strip()
            break

    # Fallback: el badge de posicion junto a la foto (paginas donde no
    # aparece la tabla por plataforma, solo tiene una posicion).
    badge = soup.select_one('div.mx-2.mb-3.text-center.mt-1 span.position-box')
    if badge:
        return badge.text.strip()

    return ""

def main():
    url = "https://www.futbolfantasy.com/analytics/biwenger/mercado/biwenger-fantasy"
    headers = {'User-Agent': 'Mozilla/5.0'}
    
    print(f"Fetching main page: {url}")
    response = requests.get(url, headers=headers, timeout=15)
    soup = BeautifulSoup(response.text, 'html.parser')
    
    # FutbolFantasy carga todos los jugadores en la tabla inicial (aunque estén ocultos por paginación en el frontend)
    rows = soup.select('tr.elemento_jugador')
    print(f"Encontrados {len(rows)} jugadores en total.")
    
    data = []
    
    for i, row in enumerate(rows):
        try:
            # 1. Nombre
            name_span = row.select_one('span.d-none.d-md-inline')
            name = name_span.text.strip() if name_span else row.get('data-nombre', '').strip().title()
            
            # 2. Equipo
            team_span = row.select_one('.player-equipo span')
            team = team_span.text.strip() if team_span else ""
            
            # 3. Valor
            val_td = row.select_one('td.font-weight-bold')
            val = val_td.text.strip().replace('.', '') if val_td else row.get('data-valor', '')
            
            # Quitar últimos 6 ceros
            if val.endswith('000000'):
                val_short = val[:-6]
            else:
                try:
                    val_short = str(int(val) // 1000000)
                except ValueError:
                    val_short = val
                    
            # 4. Obtener ID para acceder al modal y extraer la URL real
            player_id = row.get('data-id', '')
            if not player_id:
                continue
                
            modal_url = f"https://www.futbolfantasy.com/analytics/biwenger/mercado/detalle/{player_id}/biwenger-fantasy"
            
            print(f"[{i+1}/{len(rows)}] Extrayendo detalle de: {name}...")
            
            time.sleep(0.3) # Pausa
            modal_resp = requests.get(modal_url, headers=headers, timeout=15)
            modal_soup = BeautifulSoup(modal_resp.text, 'html.parser')
            
            link_tag = modal_soup.select_one('a.jugador')
            if link_tag and link_tag.has_attr('href'):
                detail_url = link_tag['href']
            else:
                # Fallback al slug normal si falla
                slug = slugify(name)
                detail_url = f"https://www.futbolfantasy.com/jugadores/{slug}"
            
            time.sleep(0.3) # Pausa
            det_resp = requests.get(detail_url, headers=headers, timeout=15)
            
            photo_url = ""
            birth_date = ""
            position = ""
            
            if det_resp.status_code == 200:
                det_soup = BeautifulSoup(det_resp.text, 'html.parser')
                
                # Foto 400x400
                img_tag = det_soup.select_one('img.img.w-100.mb-1')
                if img_tag:
                    photo_url = img_tag.get('src', '')
                    
                # Fecha nacimiento
                birth_date = extract_birthdate(det_soup)
                
                # Posición
                position = extract_position(det_soup)
            else:
                print(f"  -> Aviso: No se pudo cargar la url {detail_url}")
                # Alternativa rápida para la foto: coger la pequeña de la tabla y cambiar 80x80 por 400x400
                img_mini = row.select_one('.player-foto')
                if img_mini:
                    photo_url = img_mini.get('src', '').replace('80x80', '400x400')
            
            data.append([name, team, position, val_short, birth_date, photo_url])
            
        except Exception as e:
            print(f"Error procesando la fila {i}: {e}")
            continue

    csv_file = 'jugadores_biwenger.csv'

    # Guardarraíl: merge_players_data.py borra de la BD a todo el que no esté
    # en este CSV. Si el scraping ha salido corto (web caída, cambio de HTML,
    # rate limit), ese borrado se llevaría por delante a media liga. Ante la
    # duda no se toca el CSV y se sale con error, así el step siguiente no corre.
    previos = contar_jugadores_previos(csv_file)
    if previos and len(data) < previos * 0.75:
        print(f"\n❌ Scraping abortado: {len(data)} jugadores, menos de 3/4 de los "
              f"{previos} anteriores (mínimo {int(previos * 0.75)}).")
        print(f"   Se conserva el CSV anterior y no se sincroniza nada.")
        sys.exit(1)

    with open(csv_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['Nombre', 'Equipo', 'Posicion', 'Valor', 'Fecha_Nacimiento', 'Foto'])
        writer.writerows(data)

    if previos:
        print(f"\n¡Completado! Se han guardado {len(data)} jugadores en {csv_file} (antes: {previos})")
    else:
        print(f"\n¡Completado! Se han guardado {len(data)} jugadores en {csv_file}")

if __name__ == '__main__':
    main()
