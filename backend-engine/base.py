import os
import requests
from pathlib import Path

class BaseScraper:
    """
    Clase base para todos los scrapers.
    Maneja la sesión compartida, rutas y configuración básica.
    """
    def __init__(self, sdapi_outlet_key=None, callback_id=None, base_output_path="MisDatosFutbol", headers=None, session=None):
        """
        Inicializa el scraper base.
        
        Args:
            sdapi_outlet_key (str): Key de la API (opcional para scrapers que solo usan Selenium).
            callback_id (str): ID de callback (opcional).
            base_output_path (str or Path): Carpeta raíz para guardar datos.
            headers (dict): Headers iniciales.
            session (requests.Session): Sesión compartida (VITAL para mantener cookies).
        """
        self.sdapi_outlet_key = sdapi_outlet_key
        self.callback_id = callback_id
        
        # Configuración de rutas
        self.base_output_path = Path(base_output_path)
        self.base_output_path.mkdir(parents=True, exist_ok=True)
        
        # Configuración de Sesión
        # Si nos pasan una sesión, la usamos. Si no, creamos una nueva.
        if session:
            self.session = session
        else:
            self.session = requests.Session()
            
        # Actualizar headers si se proporcionan
        if headers:
            self.session.headers.update(headers)

    def save_data(self, data, folder_name, file_name):
        """
        Método genérico para guardar JSON en la estructura de carpetas.
        """
        import json # Import local para evitar conflictos circulares si los hubiera
        
        # Construir ruta completa: base / folder / file
        full_path = self.base_output_path / folder_name
        full_path.mkdir(parents=True, exist_ok=True)
        
        file_path = full_path / file_name
        
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=4)
            return True
        except Exception as e:
            print(f"❌ Error guardando archivo {file_name}: {e}")
            return False

    def _get_json_response(self, url):
        """
        Helper para obtener JSON limpio de una URL (maneja JSONP).
        """
        try:
            response = self.session.get(url, timeout=15)
            response.raise_for_status()
            
            content = response.text
            
            # Limpieza básica de JSONP
            start = content.find('{')
            end = content.rfind('}')
            
            if start != -1 and end != -1:
                import json
                return json.loads(content[start:end+1])
            else:
                return None
        except Exception as e:
            print(f"❌ Error en petición base: {e}")
            return None