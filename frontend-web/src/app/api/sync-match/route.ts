import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'

const execPromise = promisify(exec)

// Cargar variables de entorno desde .env
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env')
  const envContent = fs.readFileSync(envPath, 'utf-8')
  const envVars: Record<string, string> = {}

  envContent.split('\n').forEach(line => {
    const trimmedLine = line.trim()
    if (trimmedLine && !trimmedLine.startsWith('#') && trimmedLine.includes('=')) {
      const eqIndex = trimmedLine.indexOf('=')
      const key = trimmedLine.substring(0, eqIndex).trim()
      // Quitar comillas si las hay
      let value = trimmedLine.substring(eqIndex + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (key) {
        envVars[key] = value
      }
    }
  })

  return envVars
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fixture_id, match_id } = body

    if (!fixture_id || !match_id) {
      return NextResponse.json(
        { error: 'fixture_id y match_id son requeridos' },
        { status: 400 }
      )
    }

    console.log(`🚀 Iniciando sincronización para fixture=${fixture_id}, match=${match_id}`)

    // Cargar variables de entorno
    const envVars = loadEnv()

    // Ejecutar el script usando Python del sistema
    // El venv tiene paquetes compilados para arquitectura incompatible (x86_64 vs arm64)
    const frontendRoot = '/Users/victorzandal/Proyectos/Liga_Marca/frontend-web'
    const pythonPath = '/Library/Frameworks/Python.framework/Versions/3.11/bin/python3'
    const scriptPath = path.join(frontendRoot, 'trigger_descarga_eventos.py')

    const { stdout, stderr } = await execPromise(
      `"${pythonPath}" "${scriptPath}" ${fixture_id} ${match_id}`,
      {
        cwd: process.cwd(),
        timeout: 120000, // 2 minutos timeout
        env: { ...process.env, ...envVars }
      }
    )

    if (stderr && !stderr.includes('✅')) {
      console.error('Error en stderr:', stderr)
    }

    console.log('Salida del script:', stdout)

    return NextResponse.json({
      success: true,
      message: 'Partido sincronizado correctamente',
      output: stdout.split('\n').filter(line => line.includes('✅') || line.includes('📊') || line.includes('🏁'))
    })

  } catch (error: any) {
    console.error('Error sincronizando partido:', error)

    return NextResponse.json(
      {
        error: 'Error al sincronizar partido',
        details: error.message || String(error),
        stdout: error.stdout,
        stderr: error.stderr
      },
      { status: 500 }
    )
  }
}
