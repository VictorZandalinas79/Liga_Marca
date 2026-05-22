"""
Funciones utilitarias comunes
============================

Este módulo contiene funciones de propósito general que se utilizan
a lo largo del proyecto, incluyendo configuración de drivers, 
limpieza de datos y manipulación de URLs.

Autor: Tu nombre
Fecha: Julio 2025
"""

import random
import re
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse, unquote

def random_sleep_time():
    """
    Genera un tiempo de espera aleatorio para simular comportamiento humano.
    
    Returns:
        float: Tiempo de espera en segundos entre 3 y 6
        
    Example:
        >>> sleep_time = random_sleep_time()
        >>> time.sleep(sleep_time)
    """
    return random.uniform(3, 6)

def sanitize_dir_name(name):
    """
    Limpia un nombre para que sea válido como nombre de directorio.
    
    Reemplaza caracteres problemáticos que no son permitidos en nombres
    de archivos o directorios en diferentes sistemas operativos.
    
    Args:
        name (str): Nombre a limpiar
        
    Returns:
        str: Nombre limpio y válido para directorio
        
    Example:
        >>> clean_name = sanitize_dir_name("Torneo 2024/25 *final*")
        >>> print(clean_name)  # "Torneo 2024_25 _final_"
    """
    if name is None:
        return "unnamed"
    
    # Caracteres problemáticos en nombres de archivo/directorio
    problematic_chars = ['/', '\\', '*', '?', '"', '<', '>', '|', ':']
    
    clean_name = str(name)
    for char in problematic_chars:
        clean_name = clean_name.replace(char, '_')
    
    # Eliminar espacios al inicio y final
    clean_name = clean_name.strip()
    
    # Reemplazar múltiples underscores consecutivos por uno solo
    clean_name = re.sub(r'_+', '_', clean_name)
    
    return clean_name


def get_torneo_id(url):
    """
    Extrae el ID del torneo de una URL de temporada.
    
    Modifica la URL cambiando 'results' por 'fixtures' y extrae
    el identificador del torneo usando expresiones regulares.
    
    Args:
        url (str): URL de la página de resultados del torneo
        
    Returns:
        str or None: ID del torneo si se encuentra, None en caso contrario
        
    Example:
        >>> url = "https://example.com/soccer/league/premier-league-2024/results"
        >>> torneo_id = get_torneo_id(url)
        >>> print(torneo_id)  # "premier-league-2024"
    """
    try:
        # Convertir URL de results a fixtures
        url = url.replace('results', 'fixtures')
        
        # Buscar el patrón del ID del torneo
        fixture_url = re.search(r'soccer/[^/]+/([^/]+)/fixtures', url)
        
        if fixture_url:
            torneo_id = fixture_url.group(1)
            return torneo_id
            
    except Exception as e:
        print(f"Error al extraer torneo ID de {url}: {e}")
    
    return None


def get_season_name_from_url(url):
    """
    Extrae el nombre de la temporada de una URL de resultados.
    
    Analiza la estructura de la URL y extrae el nombre de la temporada,
    decodificando caracteres especiales si es necesario.
    
    Args:
        url (str): URL de la página de resultados
        
    Returns:
        str or None: Nombre de la temporada si se encuentra, None en caso contrario
        
    Example:
        >>> url = "https://example.com/soccer/spain/la-liga-2024-25/results"
        >>> season = get_season_name_from_url(url)
        >>> print(season)  # "la-liga-2024-25"
    """
    try:
        # Obtener la parte de la ruta de la URL
        path = urlparse(url).path
        
        # Dividir por '/' y filtrar partes vacías y 'soccer'
        parts = [p for p in path.split('/') if p and 'soccer' not in p]
        
        if len(parts) >= 2:
            # Tomar la segunda parte (después del país/liga)
            season_part = parts[1]
            # Decodificar caracteres especiales
            return unquote(season_part)
            
    except Exception as e:
        print(f"Error al extraer nombre de temporada de {url}: {e}")
    
    return None

def obtener_sdapi_outlet_key(url_competicion):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5) Chrome/135.0 Mobile Safari/537.36'
    }

    try:
        response = requests.get(url_competicion, headers=headers, timeout=10)
        response.raise_for_status()
    except requests.RequestException as e:
        raise Exception(f"Error al hacer la solicitud HTTP: {e}")

    soup = BeautifulSoup(response.text, 'html.parser')

    for script in soup.find_all('script'):
        if script.string and "sdapi_outlet_key" in script.string:
            match = re.search(r'sdapi_outlet_key\s*:\s*"([^"]+)"', script.string)
            if match:
                return match.group(1)

    raise ValueError("No se encontró sdapi_outlet_key en la página.")


# Función auxiliar para testing
def test_functions():
    """
    Función de prueba para verificar el funcionamiento de las utilidades.
    """
    print("=== Testing Utility Functions ===")
    
    # Test sanitize_dir_name
    test_name = "Torneo 2024/25 *final*"
    clean = sanitize_dir_name(test_name)
    print(f"Sanitize: '{test_name}' -> '{clean}'")
    
    # Test get_torneo_id
    test_url = "https://example.com/soccer/spain/la-liga-2024/results"
    torneo_id = get_torneo_id(test_url)
    print(f"Torneo ID: {torneo_id}")
    
    # Test get_season_name_from_url
    season = get_season_name_from_url(test_url)
    print(f"Season name: {season}")
    
    # Test random_sleep_time
    sleep_time = random_sleep_time()
    print(f"Random sleep: {sleep_time:.2f} seconds")

    


if __name__ == "__main__":
    test_functions()