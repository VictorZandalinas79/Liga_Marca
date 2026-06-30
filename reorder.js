const fs = require('fs');

const file = 'frontend-web/src/app/(dashboard)/dashboard/page.tsx';
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

// Find boundaries based on exact comments
const startTusSanciones = lines.findIndex(l => l.includes('Tus Sanciones (Jornada Activa) - Solo visible en jornada activa'));
const startOnceInicial = lines.findIndex(l => l.includes('Once inicial - Grid responsive ordenado por posiciones'));
const startHistorial = lines.findIndex(l => l.includes('Historial de Sanciones (Liga) - Colapsable (Ahora debajo de los jugadores)'));
const startIndicador = lines.findIndex(l => l.includes('Indicador de cambios guardados automáticamente'));
const startModal = lines.findIndex(l => l.includes('Modal de selector de jugador con filtros'));

console.log({
  startTusSanciones,
  startOnceInicial,
  startHistorial,
  startIndicador,
  startModal
});

const preContent = lines.slice(0, startTusSanciones).join('\n');
const tusSanciones = lines.slice(startTusSanciones, startOnceInicial).join('\n');
const onceInicial = lines.slice(startOnceInicial, startHistorial).join('\n');
const historial = lines.slice(startHistorial, startIndicador).join('\n');
const indicador = lines.slice(startIndicador, startModal).join('\n');
const postContent = lines.slice(startModal).join('\n');

const newLayout = `
      {/* ================= CONTENEDOR DE COLUMNAS (PC) ================= */}
      <div className="flex flex-col xl:flex-row gap-4 items-start w-full mt-2">
        
        {/* COLUMNA IZQUIERDA (Alineación) */}
        <div className="flex-1 w-full min-w-0 space-y-4">
${onceInicial}
${indicador}
        </div>

        {/* COLUMNA DERECHA (Sanciones) */}
        <div className="w-full xl:w-[450px] shrink-0 space-y-4">
${tusSanciones}
${historial}
        </div>
        
      </div>
      {/* ================= FIN CONTENEDOR DE COLUMNAS ================= */}
`;

const finalContent = preContent + '\n' + newLayout + '\n' + postContent;

fs.writeFileSync(file, finalContent);
console.log('File successfully refactored!');
