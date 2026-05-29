import pandas as pd
import os
import sys
from football_client import FootballClient

# Configuración
API_KEY = 'TU_API_KEY_AQUI'  # O cárgala desde variables de entorno
CALLBACK_ID = 'TU_CALLBACK_ID'
BASE_PATH = "./data"

def main():
    # 1. Inicializar Cliente
    bot = FootballClient(
        sdapi_outlet_key=API_KEY,
        callback_id=CALLBACK_ID,
        base_output_path=BASE_PATH
    )

    # 2. Definir Temporada (Manual o Cargar CSV)
    # Ejemplo manual:
    data = {
        'competicion': ['Liga Profesional Argentina'],
        'temporada': ['2025'],
        'id_temporada': ['2025'], # ID interno si lo usas
        'id_competicion': ['581t4mywybx21wcpmpykhyzr3']
    }
    df_seasons = pd.DataFrame(data)

    # 3. Ejecutar Pipeline Masivo
    print(f"🏁 Iniciando proceso para {len(df_seasons)} temporadas.")
    
    for idx, row in df_seasons.iterrows():
        # Llamamos al método maestro que creamos en la Opción 1
        # O llamamos a cada uno individualmente si no modificaste la clase
        bot.run_full_pipeline(df_seasons, index=idx)

if __name__ == "__main__":
    main()