import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 })
  }

  try {
    const parsedUrl = new URL(url)
    // Validación de seguridad para restringir el proxy solo a los dominios permitidos
    const isValidHost = 
      parsedUrl.hostname.endsWith('futbolfantasy.com') || 
      parsedUrl.hostname.endsWith('opta.net') ||
      parsedUrl.hostname === 'futbolfantasy.com' ||
      parsedUrl.hostname === 'opta.net';

    if (!isValidHost) {
      return new NextResponse('Forbidden domain', { status: 403 })
    }

    const res = await fetch(url, {
      next: { revalidate: 86400 }, // Cachear por 1 día
    })

    if (!res.ok) {
      return new NextResponse(`Failed to fetch image: ${res.statusText}`, { status: res.status })
    }

    const contentType = res.headers.get('content-type') || 'image/png'
    const arrayBuffer = await res.arrayBuffer()

    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error: any) {
    return new NextResponse(`Error proxying image: ${error.message}`, { status: 500 })
  }
}
