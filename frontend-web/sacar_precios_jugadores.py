import requests
from bs4 import BeautifulSoup
import csv
import time
import re

class BiwengerScraper:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'es-ES,es;q=0.9',
            'Referer': 'https://www.futbolfantasy.com/'
        })
        self.base_url = "https://www.futbolfantasy.com"
        self.mercado_url = "https://www.futbolfantasy.com/analytics/biwenger/mercado/biwenger-fantasy"
        self.jugadores_data = []
        
    def get_teams_from_selector(self):
        """Obtiene la lista de equipos desde el selector de la página."""
        print("Obteniendo lista de equipos desde el selector...")
        try:
            response = self.session.get(self.mercado_url)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Buscar el selector de equipos
            team_select = soup.find('select', {'id': 'equipoSelect', 'name': 'equipo'})
            if not team_select:
                print("No se encontró el selector de equipos")
                return []
            
            teams = []
            for option in team_select.find_all('option'):
                if option.get('value') != '0':  # Excluir "Todos los equipos"
                    team_id = option['value']
                    team_name = option.get_text(strip=True)
                    team_identificador = option.get('data-identificador', '')
                    teams.append({
                        'id': team_id, 
                        'name': team_name,
                        'identificador': team_identificador
                    })
            
            print(f"Encontrados {len(teams)} equipos")
            return teams
            
        except requests.RequestException as e:
            print(f"Error al obtener equipos: {e}")
            return []

    def get_players_by_team(self, team_id, team_name, page=1):
        """
        Obtiene la lista de jugadores para un equipo específico y página.
        """
        print(f"Obteniendo jugadores del equipo: {team_name} (Página {page})")
        
        try:
            # Construir la URL con parámetros
            params = {
                'equipo': team_id,
                'page': page
            }
            
            response = self.session.get(self.mercado_url, params=params)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, 'html.parser')
            
            players = []
            
            # Buscar la tabla de jugadores
            # Ajusta el selector según la estructura real de la página
            table = soup.find('table')  # Puede necesitar ser más específico
            
            if not table:
                print(f"No se encontró tabla para {team_name} en página {page}")
                return players, False
            
            tbody = table.find('tbody')
            if not tbody:
                print(f"No se encontró tbody para {team_name}")
                return players, False
            
            rows = tbody.find_all('tr')
            
            if not rows:
                print(f"No hay filas en la página {page} para {team_name}")
                return players, False
            
            for row in rows:
                try:
                    # Extraer nombre del jugador
                    nombre_elem = row.find('span', class_='d-none d-md-inline')
                    if not nombre_elem:
                        nombre_elem = row.find(class_=re.compile(r'.*player.*name.*', re.I))
                    
                    nombre = nombre_elem.get_text(strip=True) if nombre_elem else ""
                    
                    # Extraer equipo desde la imagen
                    equipo_img = row.find('img', alt=True)
                    equipo = equipo_img['alt'] if equipo_img else team_name
                    
                    # Extraer precio
                    # Buscar la celda con clase 'font-weight-bold' y background-color
                    precio_elem = row.find('td', class_='font-weight-bold')
                    if not precio_elem:
                        precio_elem = row.find('td', class_='text-center font-weight-bold')
                    
                    if precio_elem:
                        precio_text = precio_elem.get_text(strip=True)
                        # Limpiar el precio: eliminar puntos y comas
                        precio_limpio = precio_text.replace('.', '').replace(',', '').replace('€', '').strip()
                        
                        try:
                            # Dividir por 1.000.000 para quitar los 6 ceros
                            precio = int(precio_limpio) // 1000000
                        except ValueError:
                            precio = precio_limpio
                    else:
                        precio = ""
                    
                    if nombre:
                        player_data = {
                            'Nombre': nombre,
                            'Equipo': equipo,
                            'Precio': precio
                        }
                        players.append(player_data)
                        print(f"  ✓ {nombre} - {equipo} - {precio}")
                
                except Exception as e:
                    print(f"  Error procesando fila: {e}")
                    continue
            
            # Verificar si hay botón "Siguiente" activo
            has_next = self.check_next_page(soup)
            
            print(f"Encontrados {len(players)} jugadores en página {page}")
            return players, has_next
            
        except requests.RequestException as e:
            print(f"Error al obtener jugadores de {team_name}: {e}")
            return [], False

    def check_next_page(self, soup):
        """Verifica si existe un botón 'Siguiente' activo."""
        next_link = soup.find('a', class_='next')
        
        if not next_link:
            return False
        
        # Verificar si tiene clase 'disabled' o similar
        classes = next_link.get('class', [])
        if 'disabled' in classes or 'inactive' in classes:
            return False
        
        # Verificar si el href es válido
        href = next_link.get('href', '')
        if href == '#' or not href:
            # Podría estar usando JavaScript, pero no habrá más páginas
            # si no hay un cambio en el contenido
            return False
        
        return True

    def scrape_all_teams(self, delay=1.5):
        """Función principal que extrae datos de todos los equipos."""
        print("Iniciando scraping de Biwenger...")
        
        # Obtener equipos
        teams = self.get_teams_from_selector()
        if not teams:
            print("No se pudieron obtener equipos. Finalizando.")
            return
        
        total_players = 0
        
        # Iterar por cada equipo
        for team_index, team in enumerate(teams, 1):
            print(f"\n{'='*60}")
            print(f"PROCESANDO EQUIPO {team_index}/{len(teams)}: {team['name']}")
            print(f"{'='*60}")
            
            page = 1
            has_next = True
            
            # Iterar por cada página del equipo
            while has_next:
                players, has_next = self.get_players_by_team(
                    team['id'], 
                    team['name'], 
                    page
                )
                
                if players:
                    self.jugadores_data.extend(players)
                    total_players += len(players)
                    
                    if has_next:
                        print(f"  → Hay más páginas, continuando...")
                        page += 1
                        time.sleep(delay)
                    else:
                        print(f"  → Última página alcanzada")
                else:
                    has_next = False
                    print(f"  → No hay más datos")
            
            # Pausa entre equipos
            if delay > 0 and team_index < len(teams):
                time.sleep(delay)
        
        # Guardar resultados
        self.save_to_csv()
        
        print(f"\n{'='*60}")
        print("=== RESUMEN FINAL ===")
        print(f"{'='*60}")
        print(f"Total equipos procesados: {len(teams)}")
        print(f"Total jugadores extraídos: {total_players}")

    def save_to_csv(self, filename="jugadores_biwenger.csv"):
        """Guarda los datos extraídos en un archivo CSV."""
        if not self.jugadores_data:
            print("No hay datos para guardar")
            return
        
        try:
            with open(filename, 'w', newline='', encoding='utf-8-sig') as csvfile:
                fieldnames = ['Nombre', 'Equipo', 'Precio']
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                
                writer.writeheader()
                writer.writerows(self.jugadores_data)
            
            print(f"\n✅ Datos guardados exitosamente en: {filename}")
            print(f"Total de registros: {len(self.jugadores_data)}")
            
        except Exception as e:
            print(f"❌ Error al guardar CSV: {e}")


if __name__ == "__main__":
    scraper = BiwengerScraper()
    scraper.scrape_all_teams(delay=1.5)
