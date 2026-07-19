import re
with open('/Users/victorzandal/Proyectos/Liga_Marca/frontend-web/src/app/(dashboard)/dashboard/page.tsx', 'r') as f:
    content = f.read()

# 1. State changes
content = content.replace(
    "const [changeHistory, setChangeHistory] = useState<Array<{outId: string, inId: string}>>([])",
    "const [changeHistory, setChangeHistory] = useState<Array<{outId: string, inId: string, index: number}>>([])"
)
content = content.replace(
    "const [pendingSwap, setPendingSwap] = useState<{ outId: string; inId: string } | null>(null)",
    "const [pendingSwap, setPendingSwap] = useState<{ outId: string; inId: string; index: number } | null>(null)"
)
content = content.replace(
    "const [playerToSwap, setPlayerToSwap] = useState<string | null>(null)",
    "const [playerToSwap, setPlayerToSwap] = useState<{ id: string; index: number } | null>(null)"
)
content = content.replace(
    "const [cancelConfirmPlayerId, setCancelConfirmPlayerId] = useState<string | null>(null)",
    "const [cancelConfirmUniqueKey, setCancelConfirmUniqueKey] = useState<string | null>(null)"
)

# 2. openPlayerSelector
content = content.replace(
    "const openPlayerSelector = (playerId: string) => {",
    "const openPlayerSelector = (playerId: string, playerIndex: number) => {"
)
content = content.replace(
    "setPlayerToSwap(playerId)",
    "setPlayerToSwap({ id: playerId, index: playerIndex })"
)

# 3. swapPlayer
content = content.replace(
    "setPendingSwap({ outId: playerToSwap, inId: newPlayerId })",
    "setPendingSwap({ outId: playerToSwap.id, inId: newPlayerId, index: playerToSwap.index })"
)

# 4. closePlayerSelector
content = content.replace(
    "const closePlayerSelector = () => {\n    setPlayerToSwap(null)",
    "const closePlayerSelector = () => {\n    setPlayerToSwap(null)"
)

# 5. confirmSwap
old_confirm = """  const confirmSwap = async () => {
    if (!pendingSwap) return

    const { outId, inId } = pendingSwap
    setChangeHistory(prev => [...prev, { outId, inId }])
    setSelectedPlayers(prev => prev.map(id => id === outId ? inId : id))

    // Guardar automáticamente en la BD
    if (!userTeamId) return

    const matchdayToSave = typeof activeMatchday === 'number' && activeMatchday > 0 ? activeMatchday : 1

    // Actualizar el equipo en la BD
    const { error: deleteError } = await supabase
      .from('team_players')
      .delete()
      .eq('team_id', userTeamId)
      .eq('matchday', matchdayToSave)

    if (!deleteError) {
      const newSelected = selectedPlayers.map(id => id === outId ? inId : id)
      const teamPlayers = newSelected.map((playerId, index) => ({
        team_id: userTeamId,
        player_id: playerId,
        is_starter: true,
        is_captain: index === 0,
        order: index,
        matchday: matchdayToSave,
      }))

      await supabase.from('team_players').insert(teamPlayers)
    }

    setPendingSwap(null)
    setShowSwapConfirm(false)
  }"""

new_confirm = """  const confirmSwap = async () => {
    if (!pendingSwap) return

    const { outId, inId, index } = pendingSwap
    setChangeHistory(prev => [...prev, { outId, inId, index }])
    
    let newSelected: string[] = []
    setSelectedPlayers(prev => {
      newSelected = [...prev]
      newSelected[index] = inId
      return newSelected
    })

    if (!userTeamId) return

    const matchdayToSave = typeof activeMatchday === 'number' && activeMatchday > 0 ? activeMatchday : 1

    const { error: deleteError } = await supabase
      .from('team_players')
      .delete()
      .eq('team_id', userTeamId)
      .eq('matchday', matchdayToSave)

    if (!deleteError && newSelected.length > 0) {
      const teamPlayers = newSelected.map((playerId, i) => ({
        team_id: userTeamId,
        player_id: playerId,
        is_starter: true,
        is_captain: i === 0,
        order: i,
        matchday: matchdayToSave,
      }))
      await supabase.from('team_players').insert(teamPlayers)
    }

    setPendingSwap(null)
    setShowSwapConfirm(false)
  }"""
content = content.replace(old_confirm, new_confirm)

# 6. undoLastChange
old_undo = """  const undoLastChange = () => {
    if (changeHistory.length === 0) return

    const lastChange = changeHistory[changeHistory.length - 1]
    // Revertir el último cambio: poner el jugador que salió y quitar el que entró
    setSelectedPlayers(prev => prev.map(id => id === lastChange.inId ? lastChange.outId : id))
    setChangeHistory(prev => prev.slice(0, -1))
    setPlayerToSwap(null)
    setSearchFilter('')
    setPositionFilter('ALL')
    setTeamFilter('')
    setPriceMinFilter('')
    setPriceMaxFilter('')
  }"""

new_undo = """  const undoLastChange = async () => {
    if (changeHistory.length === 0) return

    const lastChange = changeHistory[changeHistory.length - 1]
    
    let newSelected: string[] = []
    setSelectedPlayers(prev => {
      newSelected = [...prev]
      newSelected[lastChange.index] = lastChange.outId
      return newSelected
    })
    setChangeHistory(prev => prev.slice(0, -1))
    setPlayerToSwap(null)
    setSearchFilter('')
    setPositionFilter('ALL')
    setTeamFilter('')
    setPriceMinFilter('')
    setPriceMaxFilter('')

    if (userTeamId) {
      const matchdayToSave = typeof activeMatchday === 'number' && activeMatchday > 0 ? activeMatchday : 1
      const { error: deleteError } = await supabase
        .from('team_players')
        .delete()
        .eq('team_id', userTeamId)
        .eq('matchday', matchdayToSave)

      if (!deleteError && newSelected.length > 0) {
        const teamPlayers = newSelected.map((pid, i) => ({
          team_id: userTeamId,
          player_id: pid,
          is_starter: true,
          is_captain: i === 0,
          order: i,
          matchday: matchdayToSave,
        }))
        await supabase.from('team_players').insert(teamPlayers)
      }
    }
  }"""
content = content.replace(old_undo, new_undo)

# 7. cancelChange
old_cancel = """  const cancelChange = async (playerId: string) => {
    // 1. Intentar revertir desde changeHistory (cambio de esta sesión)
    const change = [...changeHistory].reverse().find(ch => ch.inId === playerId)
    if (change) {
      setSelectedPlayers(prev => prev.map(id => id === playerId ? change.outId : id))
      setChangeHistory(prev => {
        const revIdx = [...prev].reverse().findIndex(ch => ch.inId === playerId)
        if (revIdx === -1) return prev
        const realIdx = prev.length - 1 - revIdx
        return [...prev.slice(0, realIdx), ...prev.slice(realIdx + 1)]
      })
      setCancelConfirmPlayerId(null)
      return
    }

    // 2. Cambio cross-session: el jugador no está en basePlayers pero sí en el equipo actual.
    //    Encontrar qué jugador de basePlayers ocupaba esta posición y restaurarlo.
    if (basePlayers.length > 0 && !basePlayers.includes(playerId)) {
      const currentPlayer = players.find(p => p.id === playerId)
      const currentPosCode = currentPlayer ? getPositionCode(currentPlayer.position) : ''
      // Buscar en basePlayers un jugador de la misma posición que ya no esté en selectedPlayers
      const originalId = basePlayers.find(bpId => {
        if (selectedPlayers.includes(bpId)) return false // ya está en el equipo
        const bp = players.find(p => p.id === bpId)
        return bp && getPositionCode(bp.position) === currentPosCode
      })
      if (originalId) {
        const newSelected = selectedPlayers.map(id => id === playerId ? originalId : id)
        setSelectedPlayers(newSelected)

        // Auto-guardar la reversión en la BD
        if (userTeamId) {
          const matchdayToSave = typeof activeMatchday === 'number' && activeMatchday > 0 ? activeMatchday : 1
          await supabase.from('team_players').delete().eq('team_id', userTeamId).eq('matchday', matchdayToSave)
          const teamPlayers = newSelected.map((pid, index) => ({
            team_id: userTeamId,
            player_id: pid,
            is_starter: true,
            is_captain: index === 0,
            order: index,
            matchday: matchdayToSave,
          }))
          await supabase.from('team_players').insert(teamPlayers)
        }
      }
    }
    setCancelConfirmPlayerId(null)
  }"""

new_cancel = """  const cancelChange = async (uniqueKey: string) => {
    const playerMatch = selectedPlayersData.find(p => p._uniqueKey === uniqueKey)
    if (!playerMatch) return
    const index = playerMatch._originalIndex

    const changeIdx = changeHistory.findIndex(ch => ch.index === index)
    if (changeIdx !== -1) {
      const change = changeHistory[changeIdx]
      let newSelected: string[] = []
      setSelectedPlayers(prev => {
        newSelected = [...prev]
        newSelected[index] = change.outId
        return newSelected
      })
      setChangeHistory(prev => {
        const next = [...prev]
        next.splice(changeIdx, 1)
        return next
      })
      setCancelConfirmUniqueKey(null)

      if (userTeamId) {
        const matchdayToSave = typeof activeMatchday === 'number' && activeMatchday > 0 ? activeMatchday : 1
        await supabase.from('team_players').delete().eq('team_id', userTeamId).eq('matchday', matchdayToSave)
        const teamPlayers = newSelected.map((pid, i) => ({
          team_id: userTeamId,
          player_id: pid,
          is_starter: true,
          is_captain: i === 0,
          order: i,
          matchday: matchdayToSave,
        }))
        await supabase.from('team_players').insert(teamPlayers)
      }
      return
    }

    const outPlayer = replacedPlayerByUniqueKey.get(uniqueKey)
    if (outPlayer) {
      let newSelected: string[] = []
      setSelectedPlayers(prev => {
        newSelected = [...prev]
        newSelected[index] = outPlayer.id
        return newSelected
      })

      if (userTeamId) {
        const matchdayToSave = typeof activeMatchday === 'number' && activeMatchday > 0 ? activeMatchday : 1
        await supabase.from('team_players').delete().eq('team_id', userTeamId).eq('matchday', matchdayToSave)
        const teamPlayers = newSelected.map((pid, i) => ({
          team_id: userTeamId,
          player_id: pid,
          is_starter: true,
          is_captain: i === 0,
          order: i,
          matchday: matchdayToSave,
        }))
        await supabase.from('team_players').insert(teamPlayers)
      }
    }
    setCancelConfirmUniqueKey(null)
  }"""
content = content.replace(old_cancel, new_cancel)

# 8. JSX Replacements
content = content.replace("openPlayerSelector(player.id)", "openPlayerSelector(player.id, player._originalIndex)")
content = content.replace("cancelConfirmPlayerId", "cancelConfirmUniqueKey")
content = content.replace("setCancelConfirmPlayerId", "setCancelConfirmUniqueKey")

# Fix cancel confirm popup variables
content = content.replace(
    "const player = players.find(p => p.id === cancelConfirmUniqueKey)",
    "const player = selectedPlayersData.find(p => p._uniqueKey === cancelConfirmUniqueKey)"
)
content = content.replace(
    "const change = [...changeHistory].reverse().find(ch => ch.inId === cancelConfirmUniqueKey)",
    "const change = changeHistory.find(ch => ch.index === player?._originalIndex)"
)
content = content.replace(
    "const outPlayer = change ? players.find(p => p.id === change.outId) : undefined",
    "const outPlayer = replacedPlayerByUniqueKey.get(cancelConfirmUniqueKey)"
)
content = content.replace(
    "if (!outPlayer && basePlayers.length > 0 && !basePlayers.includes(cancelConfirmUniqueKey)) {",
    "if (false) {"
)
# We don't need the old cross-session outPlayer search inside the modal since replacedPlayerByUniqueKey handles it!
# Wait, let's just make the modal simple:
modal_old = """      {cancelConfirmUniqueKey && (() => {
        const player = selectedPlayersData.find(p => p._uniqueKey === cancelConfirmUniqueKey)
        const change = changeHistory.find(ch => ch.index === player?._originalIndex)
        let outPlayer = replacedPlayerByUniqueKey.get(cancelConfirmUniqueKey)
        
        if (false) {
          const currentPlayer = players.find(p => p.id === cancelConfirmUniqueKey)
          const currentPosCode = currentPlayer ? getPositionCode(currentPlayer.position) : ''
          const originalId = basePlayers.find(bpId => {
            if (selectedPlayers.includes(bpId)) return false
            const bp = players.find(p => p.id === bpId)
            return bp && getPositionCode(bp.position) === currentPosCode
          })
          if (originalId) {
            outPlayer = players.find(p => p.id === originalId)
          }
        }

        if (!player || !outPlayer) return null"""
        
# Actually, wait. I replaced `cancelConfirmPlayerId` with `cancelConfirmUniqueKey`.
with open('/Users/victorzandal/Proyectos/Liga_Marca/frontend-web/src/app/(dashboard)/dashboard/page.tsx', 'w') as f:
    f.write(content)
