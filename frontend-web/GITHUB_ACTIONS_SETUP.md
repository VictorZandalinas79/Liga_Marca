# Configuración de GitHub Actions para Sincronización Automática

## Paso a paso

### 1. Sube el código a GitHub

Si aún no tienes un repositorio:

```bash
cd /Users/victorzandal/Proyectos/Liga_Marca
git init
git remote add origin https://github.com/TU_USUARIO/Liga_Marca.git
git add .
git commit -m "Initial commit con sync automático"
git push -u origin main
```

### 2. Configura los Secrets en GitHub

1. Ve a tu repositorio en GitHub
2. Haz clic en **Settings** (Configuración)
3. En el menú lateral, haz clic en **Secrets and variables** → **Actions**
4. Haz clic en **New repository secret**
5. Añade los siguientes secrets:

| Nombre | Valor |
|--------|-------|
| `SUPABASE_URL` | Tu URL de Supabase (ej: `https://xxxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Tu Service Role Key de Supabase (lo encuentras en Settings → API) |
| `SDAPI_OUTLET_KEY` | Tu clave de StatsPerform (`ft1tiv1inq7v1sk3y9tv12yh5`) |

### 3. Habilita el workflow

1. Ve a la pestaña **Actions** en tu repositorio GitHub
2. Si ves un mensaje diciendo "Workflows aren't being run", haz clic en **I understand my workflows, go ahead and enable them**

### 4. Verifica que funciona

1. Ve a **Actions** → **Sync Live Matches**
2. Haz clic en **Run workflow** (botón a la derecha)
3. Espera a que se ejecute
4. Revisa los logs para ver si encontró partidos próximos

### 5. Monitorea la ejecución

Cada minuto, GitHub Actions:
- Buscará partidos que empiecen en los próximos 5 minutos
- Buscará partidos que ya empezaron y están en vivo
- Ejecutará `sync_live_matches.py` para cada partido encontrado
- Subirá los `player_scores` a Supabase

## Consideraciones importantes

### Límites de GitHub Actions

- **Repositorios públicos**: 2000 minutos/mes gratis
- **Repositorios privados**: 500 minutos/mes gratis
- Cada ejecución dura ~1-2 minutos
- Si tienes muchos partidos simultáneos, podrías consumir más minutos

### Optimización del consumo

El workflow está configurado para ejecutarse cada minuto, pero solo procesa partidos cuando:
- Faltan ≤5 minutos para el inicio
- El partido está en vivo (≤120 minutos desde el inicio)

Si no hay partidos que sincronizar, la ejecución es rápida (~10 segundos).

## Comandos útiles

### Ejecutar manualmente desde GitHub

```
Actions → Sync Live Matches → Run workflow → Run workflow (botón verde)
```

### Ver logs en GitHub

```
Actions → Click en el run → Click en el job "sync" → Ver logs
```

### Debuggear problemas

Si algo falla:

1. Revisa los logs del workflow en GitHub Actions
2. Verifica que los secrets están bien configurados
3. Comprueba que los partidos en `fixtures` tienen `start_time` correcto
4. Asegúrate de que `sync_live_matches.py` funciona localmente

## Alternativa: Usar un servidor VPS

Si GitHub Actions se queda corto, puedes usar un VPS (Railway, Render, DigitalOcean):

```bash
# En el VPS, ejecutar el scheduler continuamente
python scheduler.py &
```

O añadir al crontab:
```bash
* * * * * cd /path/to/Liga_Marca && python .github/scripts/run_sync.py >> /var/log/sync.log 2>&1
```
