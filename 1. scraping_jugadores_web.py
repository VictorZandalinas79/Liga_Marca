from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service 
from webdriver_manager.chrome import ChromeDriverManager 
from selenium.webdriver.common.by import By # ¡NUEVO IMPORT NECESARIO!
from bs4 import BeautifulSoup
import pandas as pd
import time
import re

# URLs
URL_EQUIPOS = "https://wc2026.clubcomunio.com/es/equipos"
URL_JUGADORES = "https://wc2026.clubcomunio.com/es/jugadores"

def clean_price(price_str):
    """Convierte textos como '5,97 M' o '990 K' a números matemáticos."""
    clean_str = price_str.replace('\xa0', '').replace(' ', '').replace(',', '.')
    try:
        if 'M' in clean_str:
            return float(clean_str.replace('M', '')) * 1_000_000
        elif 'K' in clean_str:
            return float(clean_str.replace('K', '')) * 1_000
        else:
            return float(clean_str)
    except:
        return 0.0

def main():
    print("Iniciando navegador web silencioso...")
    options = Options()
    # Tamaño de ventana fijo para evitar errores de renderizado en el scroll
    options.add_argument("--window-size=1920,1080") 
    
    servicio = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=servicio, options=options)

    try:
        # ==========================================
        # PASO 1: EXTRAER Y MAPEAR LOS EQUIPOS
        # ==========================================
        print("Obteniendo lista de equipos...")
        driver.get(URL_EQUIPOS)
        time.sleep(3) 
        
        soup_equipos = BeautifulSoup(driver.page_source, 'html.parser')
        
        diccionario_equipos = {}
        enlaces_equipos = soup_equipos.find_all('a', class_='py-name')
        
        for enlace in enlaces_equipos:
            href = enlace.get('href', '')
            nombre_equipo = enlace.text.strip()
            
            match_id = re.search(r'/equipo/(\d+)/', href)
            if match_id:
                equipo_id = match_id.group(1)
                diccionario_equipos[equipo_id] = nombre_equipo
                
        print(f"✅ Se cargaron {len(diccionario_equipos)} equipos en memoria.\n")

        # ==========================================
        # PASO 2: EXTRAER JUGADORES DESDE LA TABLA
        # ==========================================
        print("Cargando tabla principal de jugadores...")
        driver.get(URL_JUGADORES)
        time.sleep(5) 
        
        print("Desplazando hacia abajo (buscando al último jugador) para cargar toda la lista...")
        print("(Esto puede tardar 1 o 2 minutos si hay más de 1000 jugadores. Paciencia...)")
        
        # --- LÓGICA DE SCROLL APUNTANDO AL ÚLTIMO ELEMENTO ---
        jugadores_cargados = 0
        intentos_fallidos = 0
        MAX_INTENTOS = 5 # Tolerancia por si el servidor de Comunio va lento
        
        while True:
            # En lugar de BeautifulSoup aquí, usamos Selenium para ubicar los elementos web físicos
            filas_actuales = driver.find_elements(By.CSS_SELECTOR, "li.py-li")
            total_actual = len(filas_actuales)
            
            if total_actual > jugadores_cargados:
                print(f" -> Jugadores detectados: {total_actual}")
                jugadores_cargados = total_actual
                intentos_fallidos = 0 # Reseteamos fallos
                
                # ¡EL TRUCO MAESTRO!: Hacemos scroll directamente hasta el ÚLTIMO jugador
                ultimo_jugador = filas_actuales[-1]
                driver.execute_script("arguments[0].scrollIntoView(true);", ultimo_jugador)
                
                # Esperamos 2 segundos a que el servidor mande la siguiente tanda
                time.sleep(2)
            else:
                intentos_fallidos += 1
                
                # Si se atasca, hacemos un pequeño rebote: subimos un poco y volvemos al final
                driver.execute_script("window.scrollBy(0, -400);")
                time.sleep(1)
                if len(filas_actuales) > 0:
                    driver.execute_script("arguments[0].scrollIntoView(true);", filas_actuales[-1])
                time.sleep(2)
                
                if intentos_fallidos >= MAX_INTENTOS:
                    print("✅ Fin de la lista detectado. No se cargan más jugadores.")
                    break
        # ----------------------------------------------------
        
        # Ahora sí, una vez cargados todos, parseamos todo el HTML de golpe
        soup_jugadores = BeautifulSoup(driver.page_source, 'html.parser')
        filas_jugadores = soup_jugadores.find_all('li', class_='py-li')
        print(f"\nSe extraerán los datos de {len(filas_jugadores)} jugadores...")
        
        datos_jugadores = []
        
        for fila in filas_jugadores:
            try:
                # 1. Nombre
                tag_nombre = fila.find('a', class_='py-name')
                nombre = tag_nombre.text.strip() if tag_nombre else "Desconocido"
                
                # 2. Equipo
                tag_equipo = fila.find('i', class_=re.compile(r'e20-\d+'))
                id_equipo = "0"
                if tag_equipo:
                    clases = " ".join(tag_equipo.get('class', []))
                    match_eq = re.search(r'e20-(\d+)', clases)
                    if match_eq:
                        id_equipo = match_eq.group(1)
                
                nombre_equipo = diccionario_equipos.get(id_equipo, f"Equipo {id_equipo}")
                
                # 3. Precio
                ul_labs = fila.find('ul', class_='labs')
                precio_raw = "0"
                if ul_labs:
                    tag_precio = ul_labs.find('b')
                    if tag_precio:
                        precio_raw = tag_precio.text.strip()
                
                precio_real = clean_price(precio_raw)
                
                # 4. Foto
                tag_foto = fila.find('a', class_='py-pic')
                foto_url = ""
                if tag_foto and tag_foto.has_attr('style'):
                    estilo = tag_foto['style']
                    match_foto = re.search(r'url\((.*?)\)', estilo.replace('&quot;', '"'))
                    if match_foto:
                        foto_url = match_foto.group(1).replace('"', '').replace("'", "")
                
                datos_jugadores.append({
                    "Nombre": nombre,
                    "Equipo": nombre_equipo,
                    "Precio_Comunio": precio_raw,
                    "Precio_Num": precio_real,
                    "Foto": foto_url
                })
                
            except Exception as e:
                print(f"Error procesando un jugador: {e}")
                
    finally:
        driver.quit()
        print("Navegador cerrado.\n")

    # ==========================================
    # PASO 3: LIMPIEZA Y NORMALIZACIÓN (PANDAS)
    # ==========================================
    df = pd.DataFrame(datos_jugadores)
    
    if df.empty:
        print("No se logró extraer ningún dato.")
        return
        
    print("Normalizando precios (Min 7 - Max 50)...")
    
    MIN_NUEVO = 7.0
    MAX_NUEVO = 50.0
    
    min_actual = df[df['Precio_Num'] > 0]['Precio_Num'].min()
    max_actual = df['Precio_Num'].max()
    
    if pd.isna(min_actual) or max_actual == min_actual:
        df['Precio_Normalizado'] = MIN_NUEVO
    else:
        df['Precio_Normalizado'] = MIN_NUEVO + ( (df['Precio_Num'] - min_actual) * (MAX_NUEVO - MIN_NUEVO) ) / (max_actual - min_actual)
    
    df['Precio_Normalizado'] = df['Precio_Normalizado'].round(0).astype(int)
    
    df_final = df[['Nombre', 'Equipo', 'Precio_Comunio', 'Precio_Num', 'Precio_Normalizado', 'Foto']]
    
    print("\n--- PRIMEROS 10 JUGADORES ---")
    print(df_final.head(10).to_string())
    
    archivo_salida = 'jugadores_optimizados.csv'
    df_final.to_csv(archivo_salida, index=False, encoding='utf-8-sig')
    print(f"\n✅ Proceso exitoso. ¡{len(df_final)} jugadores guardados en {archivo_salida}!")

if __name__ == "__main__":
    main()