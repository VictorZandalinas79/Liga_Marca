from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service # ¡NUEVO!
from webdriver_manager.chrome import ChromeDriverManager # ¡NUEVO!
from bs4 import BeautifulSoup
import pandas as pd
import time
import re

# URLs
URL_EQUIPOS = "https://segunda.clubcomunio.com/es/equipos"
URL_JUGADORES = "https://segunda.clubcomunio.com/es/jugadores"

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
    servicio = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=servicio, options=options)

    
    try:
        # ==========================================
        # PASO 1: EXTRAER Y MAPEAR LOS EQUIPOS
        # ==========================================
        print("Obteniendo lista de equipos...")
        driver.get(URL_EQUIPOS)
        time.sleep(3) # Esperar a que cargue JS
        
        soup_equipos = BeautifulSoup(driver.page_source, 'html.parser')
        
        diccionario_equipos = {}
        # Buscamos todos los links de equipos en la tabla
        enlaces_equipos = soup_equipos.find_all('a', class_='py-name')
        
        for enlace in enlaces_equipos:
            href = enlace.get('href', '')
            nombre_equipo = enlace.text.strip()
            
            # El href es tipo "/es/equipo/4/castellon" -> Sacamos el "4"
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
        time.sleep(5) # Esperar a que JS cargue la lista completa de jugadores
        
        # Bucle para hacer scroll automático y cargar la lista completa
        print("Desplazando hacia abajo automáticamente para cargar todos los jugadores...")
        jugadores_cargados = 0
        
        while True:
            # Hace scroll al fondo de la pantalla
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(2) # Espera a que el servidor mande más jugadores
            
            # Cuenta cuántos van cargados
            soup_temp = BeautifulSoup(driver.page_source, 'html.parser')
            total_actual = len(soup_temp.find_all('li', class_='py-li'))
            print(f" -> Jugadores detectados en pantalla: {total_actual}")
            
            # Si el número ya no sube, paramos el bucle
            if total_actual == jugadores_cargados:
                break
            jugadores_cargados = total_actual
        
        soup_jugadores = BeautifulSoup(driver.page_source, 'html.parser')
        
        # Buscar cada fila (jugador) en la lista
        filas_jugadores = soup_jugadores.find_all('li', class_='py-li')
        print(f"Se encontraron {len(filas_jugadores)} jugadores. Extrayendo datos...")
        
        datos_jugadores = []
        
        for fila in filas_jugadores:
            try:
                # 1. Extraer Nombre
                tag_nombre = fila.find('a', class_='py-name')
                nombre = tag_nombre.text.strip() if tag_nombre else "Desconocido"
                
                # 2. Extraer ID de Equipo (de la clase 'e20-XX')
                tag_equipo = fila.find('i', class_=re.compile(r'e20-\d+'))
                id_equipo = "0"
                if tag_equipo:
                    # Las clases vienen en una lista, la unimos a texto y sacamos el número
                    clases = " ".join(tag_equipo.get('class', []))
                    match_eq = re.search(r'e20-(\d+)', clases)
                    if match_eq:
                        id_equipo = match_eq.group(1)
                
                # Cruzar el ID con nuestro diccionario del Paso 1
                nombre_equipo = diccionario_equipos.get(id_equipo, f"Equipo {id_equipo}")
                
                # 3. Extraer Precio (El primer 'li' dentro de 'ul.labs')
                ul_labs = fila.find('ul', class_='labs')
                precio_raw = "0"
                if ul_labs:
                    tag_precio = ul_labs.find('b')
                    if tag_precio:
                        precio_raw = tag_precio.text.strip()
                
                precio_real = clean_price(precio_raw)
                
                # 4. Extraer Foto (Regex dentro del background-image)
                tag_foto = fila.find('a', class_='py-pic')
                foto_url = ""
                if tag_foto and tag_foto.has_attr('style'):
                    estilo = tag_foto['style']
                    # Limpiamos las comillas raras (&quot;) que pone el HTML
                    match_foto = re.search(r'url\((.*?)\)', estilo.replace('&quot;', '"'))
                    if match_foto:
                        foto_url = match_foto.group(1).replace('"', '').replace("'", "")
                
                # Agregar a nuestra lista
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
    
    # Modelo Matemático Min-Max
    MIN_NUEVO = 7.0
    MAX_NUEVO = 50.0
    
    # Filtramos precios > 0 por si hubo algún error de lectura
    min_actual = df[df['Precio_Num'] > 0]['Precio_Num'].min()
    max_actual = df['Precio_Num'].max()
    
    if pd.isna(min_actual) or max_actual == min_actual:
        df['Precio_Normalizado'] = MIN_NUEVO
    else:
        df['Precio_Normalizado'] = MIN_NUEVO + ( (df['Precio_Num'] - min_actual) * (MAX_NUEVO - MIN_NUEVO) ) / (max_actual - min_actual)
    
    # Redondear al número más cercano y convertir a entero puro
    df['Precio_Normalizado'] = df['Precio_Normalizado'].round(0).astype(int)
    
    df_final = df[['Nombre', 'Equipo', 'Precio_Comunio', 'Precio_Num', 'Precio_Normalizado', 'Foto']]
    
    print("\n--- PRIMEROS 10 JUGADORES ---")
    print(df_final.head(10).to_string())
    
    # Guardar en CSV para la BD de Supabase
    archivo_salida = 'jugadores_optimizados.csv'
    df_final.to_csv(archivo_salida, index=False, encoding='utf-8-sig')
    print(f"\n✅ Proceso exitoso. ¡{len(df_final)} jugadores guardados en {archivo_salida}!")

if __name__ == "__main__":
    main()